/* eslint-disable max-lines -- 崩溃监控与无响应监视集中单模块，拆分反而增加跨文件状态同步 */
import { BrowserWindow, type WebContents } from "electron";
import type { CrashCapturePaths } from "./desktopCrashCapture.js";
import { registerCrashEventMonitor as registerBaseCrashEventMonitor } from "./desktopCrashCapture.js";
import { getResourceManagerWindowId } from "./resourceManagerWindow.js";

/**
 * 桌面稳定性监视：只做本地诊断，不做任何远端上报。
 *
 * 历史背景：本模块原为 ARMS RUM 的稳定性上报层（render-process-gone / child-process-gone /
 * ANR / freeze 全量上报到阿里云 ARMS，并带 device_mid）。DWeis Next 不做任何遥测，
 * 因此移除全部上报链路，保留三样本地能力：
 *   1. 崩溃事件监听（render-process-gone / child-process-gone）与分类；
 *   2. 无响应（ANR）与挂死（freeze）的本地轮询判定，结果只写日志；
 *   3. 主窗口登记，用于把崩溃归属到正确的窗口而非当前焦点窗。
 */

/** ANR：主线程无响应阈值（与 Electron unresponsive 对齐） */
const STABILITY_ANR_THRESHOLD_MS = 5_000;
/** 挂死：未恢复且未 crash 的更长无响应阈值 */
const STABILITY_FREEZE_THRESHOLD_MS = 30_000;
/** 无响应轮询间隔 */
const UNRESPONSIVE_POLL_INTERVAL_MS = 1_000;

type StabilityLogger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
};

type StabilityWindowScene = "main" | "process_monitor" | "other";

type StabilityCrashKind = "native" | "js" | "oom";

type StabilityCrashScope = "main" | "renderer" | "host" | "child" | "gpu" | "utility" | "other";

type StabilityCrashCause =
  | "oom"
  | "gpu"
  | "native_crash"
  | "js_exception"
  | "killed"
  | "clean_exit"
  | "unknown";

interface StabilityCrashClassification {
  crashKind: StabilityCrashKind;
  crashScope: StabilityCrashScope;
  crashCause: StabilityCrashCause;
}

interface RenderProcessGoneInput {
  reason: string;
  exitCode: number;
  webContentsType: string;
  windowScene: StabilityWindowScene;
}

interface ChildProcessGoneInput {
  type: string;
  reason: string;
  name: string;
}

interface UnresponsiveWatchState {
  webContentsId: number;
  windowId: number;
  windowScene: StabilityWindowScene;
  startedAt: number;
  anrReported: boolean;
  freezeReported: boolean;
  crashReported: boolean;
  pollTimer: NodeJS.Timeout | null;
}

const mainWindowIds = new Set<number>();
const unresponsiveByWebContentsId = new Map<number, UnresponsiveWatchState>();

function resolveRegisteredWindowScene(win: BrowserWindow | null | undefined): StabilityWindowScene {
  if (win && !win.isDestroyed() && win.webContents) {
    if (mainWindowIds.has(win.id)) {
      return "main";
    }
    // 进程监控窗口按 resource manager 的 window id 识别，不能按标题猜。
    if (getResourceManagerWindowId() === win.id) {
      return "process_monitor";
    }
  }
  return "other";
}

function mapExitReasonToCrashKind(reason: string): StabilityCrashKind {
  if (reason === "oom") return "oom";
  if (reason === "crashed" || reason === "abnormal-exit") return "native";
  if (reason === "killed") return "native";
  return "native";
}

function mapExitReasonToCrashCause(reason: string): StabilityCrashCause {
  switch (reason) {
    case "oom":
      return "oom";
    case "gpu-process-lost":
    case "gpu-crash":
      return "gpu";
    case "killed":
      return "killed";
    case "clean-exit":
      return "clean_exit";
    case "crashed":
    case "abnormal-exit":
      return "native_crash";
    case "javascript-exception":
      return "js_exception";
    default:
      return "unknown";
  }
}

/**
 * 渲染进程崩溃分类。返回 null 表示这次退出不应按崩溃处理
 * （正常导航销毁、devtools 关闭等）。
 */
function classifyRenderProcessCrash(input: RenderProcessGoneInput): StabilityCrashClassification | null {
  if (input.reason === "clean-exit") {
    return null;
  }
  if (input.reason === "killed") {
    return null;
  }
  return {
    crashKind: mapExitReasonToCrashKind(input.reason),
    crashScope: input.windowScene === "main" ? "main" : "renderer",
    crashCause: mapExitReasonToCrashCause(input.reason),
  };
}

function mapChildProcessGoneToProcessRoleWithName(type: string, processName: string): StabilityCrashScope {
  const name = processName.toLowerCase();
  if (name.includes("host")) return "host";
  if (type === "Utility") return "utility";
  if (type === "GPU") return "gpu";
  if (name.includes("zygote")) return "other";
  return "child";
}

/** 子进程消失是否应按崩溃记录（GPU/工具类噪音退出不记） */
function shouldReportChildProcessGoneAsCrash(input: ChildProcessGoneInput): boolean {
  if (input.type === "GPU") return false;
  const name = input.name.toLowerCase();
  if (name.includes("crashpad")) return false;
  return true;
}

function shouldReportAnr(elapsedMs: number, anrReported: boolean): boolean {
  return !anrReported && elapsedMs >= STABILITY_ANR_THRESHOLD_MS;
}

function shouldReportFreeze(
  elapsedMs: number,
  freezeReported: boolean,
  crashReported: boolean,
): boolean {
  return !freezeReported && !crashReported && elapsedMs >= STABILITY_FREEZE_THRESHOLD_MS;
}

function markWebContentsCrash(webContentsId: number): void {
  const state = unresponsiveByWebContentsId.get(webContentsId);
  if (state) {
    state.crashReported = true;
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }
}

function clearUnresponsiveWatch(webContentsId: number): void {
  const state = unresponsiveByWebContentsId.get(webContentsId);
  if (!state) {
    return;
  }
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
  }
  unresponsiveByWebContentsId.delete(webContentsId);
}

function describeCrash(classification: StabilityCrashClassification): string {
  return `${classification.crashKind}/${classification.crashScope}/${classification.crashCause}`;
}

function pollUnresponsiveState(state: UnresponsiveWatchState, logger: StabilityLogger): void {
  if (state.crashReported) {
    clearUnresponsiveWatch(state.webContentsId);
    return;
  }

  const elapsedMs = Date.now() - state.startedAt;

  if (shouldReportAnr(elapsedMs, state.anrReported)) {
    state.anrReported = true;
    logger.warn("[stability] renderer unresponsive (ANR)", {
      windowId: state.windowId,
      webContentsId: state.webContentsId,
      durationMs: elapsedMs,
    });
  }

  if (shouldReportFreeze(elapsedMs, state.freezeReported, state.crashReported)) {
    state.freezeReported = true;
    logger.warn("[stability] renderer unresponsive (freeze)", {
      windowId: state.windowId,
      webContentsId: state.webContentsId,
      durationMs: elapsedMs,
    });
  }

  // 只做本地诊断：无响应判定后继续轮询，直到渲染恢复或进程消失。
  state.pollTimer = setTimeout(() => pollUnresponsiveState(state, logger), UNRESPONSIVE_POLL_INTERVAL_MS);
}

function attachWebContentsStabilityWatch(
  win: BrowserWindow,
  webContents: WebContents,
  logger: StabilityLogger,
): void {
  const webContentsId = webContents.id;
  if (unresponsiveByWebContentsId.has(webContentsId)) {
    return;
  }
  const state: UnresponsiveWatchState = {
    webContentsId,
    windowId: win.id,
    windowScene: resolveRegisteredWindowScene(win),
    startedAt: Date.now(),
    anrReported: false,
    freezeReported: false,
    crashReported: false,
    pollTimer: null,
  };
  unresponsiveByWebContentsId.set(webContentsId, state);

  webContents.on("unresponsive", () => {
    const current = unresponsiveByWebContentsId.get(webContentsId);
    if (!current || current.crashReported) {
      return;
    }
    current.startedAt = Date.now();
    current.anrReported = false;
    current.freezeReported = false;
    if (current.pollTimer) {
      clearTimeout(current.pollTimer);
    }
    current.pollTimer = setTimeout(() => pollUnresponsiveState(current, logger), UNRESPONSIVE_POLL_INTERVAL_MS);
  });

  webContents.on("responsive", () => {
    const current = unresponsiveByWebContentsId.get(webContentsId);
    if (!current) {
      return;
    }
    if (current.pollTimer) {
      clearTimeout(current.pollTimer);
      current.pollTimer = null;
    }
    unresponsiveByWebContentsId.delete(webContentsId);
  });

  webContents.on("destroyed", () => {
    clearUnresponsiveWatch(webContentsId);
  });
}

/** 登记主窗口，使崩溃能归属到主窗口而不是当前焦点窗 */
export function registerStabilityMainWindow(win: BrowserWindow): void {
  mainWindowIds.add(win.id);
  win.on("closed", () => {
    mainWindowIds.delete(win.id);
  });
}

/**
 * 注册崩溃与无响应监视。只写本地日志，不上报任何远端。
 */
export function registerDesktopStabilityMonitors(
  logger: StabilityLogger,
  crashPaths: CrashCapturePaths,
): void {
  // CrashCaptureLogger 的签名是 (...args: unknown[]) => void，本地 logger 是 (message, meta)；
  // 这里做一次窄化适配，避免为了迁就调用方把本地类型放宽。
  const captureLogger: Parameters<typeof registerBaseCrashEventMonitor>[0] = {
    info: (message, meta) => logger.info(String(message), meta),
    warn: (message, meta) => logger.warn(String(message), meta),
    error: (message, meta) => logger.error(String(message), meta),
  };
  registerBaseCrashEventMonitor(captureLogger, crashPaths, {
    onRenderProcessGone: (webContents, details) => {
      markWebContentsCrash(webContents.id);
      const win = BrowserWindow.fromWebContents(webContents) ?? null;
      const input: RenderProcessGoneInput = {
        reason: details.reason,
        exitCode: details.exitCode,
        webContentsType: webContents.getType(),
        // 必须使用崩溃 WebContents 自身所属窗口；回退到当前焦点窗会把辅助窗误判成主业务窗。
        windowScene: resolveRegisteredWindowScene(win),
      };
      const classification = classifyRenderProcessCrash(input);
      if (classification) {
        logger.error("[stability] render process gone", {
          crash: describeCrash(classification),
          exitCode: details.exitCode,
          reason: details.reason,
          webContentsId: webContents.id,
          windowId: win?.id,
        });
      } else {
        logger.info("[stability] render process gone (not a crash)", {
          exitCode: details.exitCode,
          reason: details.reason,
          webContentsId: webContents.id,
        });
      }
    },
    onChildProcessGone: (details) => {
      // 修复原因：Electron 将 utilityProcess.fork() 的自定义标识放在 serviceName，
      // name 只表示 Chromium Utility 服务名（如 Network Service）。只读 name 会把
      // Host 归为 utility，导致 Host 异常退出被误分类。
      const processName = details.serviceName?.trim() || details.name?.trim() || "";
      const role = mapChildProcessGoneToProcessRoleWithName(details.type, processName);
      if (details.reason === "killed" || details.reason === "clean-exit") {
        logger.info("[stability] child process exited", {
          processRole: role,
          exitCode: details.exitCode,
          reason: details.reason,
          processType: details.type,
          processName,
        });
      } else if (!shouldReportChildProcessGoneAsCrash({ ...details, name: processName })) {
        logger.info("[stability] child process gone (not a crash)", {
          processRole: role,
          exitCode: details.exitCode,
          reason: details.reason,
          processType: details.type,
          processName,
        });
      } else {
        logger.error("[stability] child process gone", {
          crash: describeCrash({
            crashKind: mapExitReasonToCrashKind(details.reason),
            crashScope: role,
            crashCause: mapExitReasonToCrashCause(details.reason),
          }),
          exitCode: details.exitCode,
          reason: details.reason,
          processRole: role,
          processType: details.type,
          processName,
        });
      }
    },
    onBrowserWindowCreated: (win) => {
      attachWebContentsStabilityWatch(win, win.webContents, logger);
    },
  });
}
