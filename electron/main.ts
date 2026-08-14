import type { AppCommand } from "./app-command.ts"
import type { AppLocale } from "./app-locale.ts"
import type { AuthRuntimeAccount } from "./auth/store.ts"
import type { BrowserControlConnection } from "./browser/control-server.ts"
import type { AppUpdateState } from "./update/common.ts"

import { ConnectionServer } from "@oomol/connection"
import { ElectronServerAdapter } from "@oomol/connection-electron-adapter/server"
import { isTrustedIpcSender } from "./ipc-guard.ts"
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  safeStorage,
  screen,
  session,
  shell,
} from "electron"
import path from "node:path"
import { writeFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { AgentRefreshScheduler } from "./agent-refresh-scheduler.ts"
import {
  ooBinaryName,
  opencodeBinaryName,
  resolveBundledBin,
  resolveBundledSkillsDir,
  resolveBundledToolRuntimePath,
  resolveDevBundledSkillsDir,
  resolveDevBundledToolRuntimePath,
  resolveDevOoBin,
  resolveDevOpencodeBin,
} from "./agent/binaries.ts"
import { AgentManager } from "./agent/manager.ts"
import { AgentRetirementPool } from "./agent/retirement.ts"
import { APP_COMMAND_CHANNEL } from "./app-command.ts"
import { APP_LOCALE_CHANNEL, isAppLocale, normalizeAppLocale } from "./app-locale.ts"
import { ArtifactResourceLeaseStore } from "./artifact-resource/lease-store.ts"
import {
  artifactResourceUrl,
  installArtifactResourceProtocol,
  registerArtifactResourceScheme,
} from "./artifact-resource/protocol.ts"
import { registerAttachmentDialogHandlers } from "./attachment-dialog-handlers.ts"
import { AttentionServiceImpl } from "./attention/node.ts"
import { AttentionStore } from "./attention/store.ts"
import { AuthManager, AuthServiceImpl } from "./auth/node.ts"
import { AuthStore } from "./auth/store.ts"
import { branding } from "./branding.ts"
import { BrowserControlServer } from "./browser/control-server.ts"
import { BrowserManager, BrowserServiceImpl } from "./browser/node.ts"
import { ArtifactBundleStore } from "./chat/artifact-bundles.ts"
import { AuthorizationOverlayStore } from "./chat/authorization.ts"
import { ChatServiceImpl } from "./chat/node.ts"
import { createPptxConverter } from "./chat/pptx-converter.ts"
import { removeSessionOutputDirectories } from "./chat/output-directory-cleanup.ts"
import { SpreadsheetPreviewWorkerClient } from "./chat/spreadsheet-preview-worker-client.ts"
import { StoppedGenerationStore } from "./chat/stopped-generations.ts"
import { TurnOutputStore } from "./chat/turn-outputs.ts"
import { UserAttachmentStore } from "./chat/user-attachments.ts"
import { registerClipboardHandler } from "./clipboard-handler.ts"
import { configureDiagnosticsLog, flushDiagnosticsLog, logDiagnostic } from "./diagnostics-log.ts"
import { applyPersistedDataDirectory } from "./data-directory.ts"
import { GitServiceImpl } from "./git/node.ts"
import { KnowledgeServiceImpl } from "./knowledge/node.ts"
import { isAudioOnlyMediaRequest, isTrustedRendererUrl } from "./media-permission-policy.ts"
import type { Config } from "@opencode-ai/sdk/v2/client"
import type { DWeisReasoningLevel } from "./agent/reasoning.ts"
import { opencodeReasoningVariant } from "./agent/reasoning.ts"
import type { SubagentModelChoice } from "./settings/common.ts"
import { AutomationServiceImpl } from "./automation/node.ts"
import type { ParsedTaskDraft } from "./automation/common.ts"
import {
  cronToSchedule,
  defaultTimezone,
  normalizeCron,
  parseAutomationSchedule,
  scheduleToCron,
} from "./automation/schedule.ts"
import { AutomationStore } from "./automation/store.ts"
import { ModelCredentialStore } from "./models/credential-store.ts"
import { McpServiceImpl } from "./mcp/node.ts"
import { McpStore } from "./mcp/store.ts"
import { toOpencodeMcpConfig } from "./mcp/common.ts"
import { ModelsServiceImpl } from "./models/node.ts"
import { ModelsStore } from "./models/store.ts"
import { MemoryServiceImpl } from "./memory/node.ts"
import { MemoryStore } from "./memory/store.ts"
import { MemoryReviewer } from "./memory/reviewer.ts"
import { installOomolCorsShim } from "./net/oomol-cors.ts"
// Teams 请求已整体搬到渲染层（src/lib/teams-client.ts），不再有对应主进程 service。
import { listenProtocolUrls, registerProtocolClient, requestProtocolSingleInstanceLock } from "./protocol.ts"
import { normalizeRendererErrorReport } from "./renderer-error-report.ts"
import { resolveAgentRuntime } from "./runtime/agent-runtime.ts"
import { resolveRuntimeCapabilities } from "./runtime/common.ts"
import { SessionActivityStore } from "./session/activity-store.ts"
import { SessionMetadataStore } from "./session/metadata-store.ts"
import { SessionServiceImpl } from "./session/node.ts"
import { SessionProjectStore } from "./session/project-store.ts"
import { SettingsServiceImpl } from "./settings/node.ts"
import { SettingsStore } from "./settings/store.ts"
import { SkillServiceImpl } from "./skills/node.ts"
import { UsageServiceImpl } from "./stats/node.ts"
import { ExpiringTrustedPathRegistry } from "./trusted-path-registry.ts"
import { UpdateServiceImpl } from "./update/node.ts"
import { buildApplicationMenuTemplate } from "./window/application-menu.ts"
import {
  buildWindowsTitleBarOverlay,
  nativeWindowFrameForPlatform,
  nativeWindowMaterialForPlatform,
  resolveWindowsTitleBarTheme,
  windowBackgroundColorForMaterial,
} from "./window/title-bar-overlay.ts"
import { createHideOnCloseHandler, revealMainWindow } from "./window/window-close-behavior.ts"
import { createWindowsTrayLifecycle } from "./window/windows-tray-lifecycle.ts"
import { dismissSplashWindow, showSplashWindow, SPLASH_FALLBACK_MS, SPLASH_MIN_VISIBLE_MS } from "./window/splash.ts"

declare const __APP_COMMIT__: string | undefined

const dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.join(dirname, "..")
process.env.APP_ROOT = appRoot
applyUserDataOverride()
// 数据目录持久化设置（默认 ~/DWeisNext）：必须在所有 store 构造之前生效；dev 的
// DWEIS_USER_DATA_DIR 覆盖已生效时自动跳过（见 data-directory.ts）。
if (!process.env["DWEIS_USER_DATA_DIR"]?.trim()) {
  applyPersistedDataDirectory()
}
configureDiagnosticsLog(path.join(app.getPath("userData"), "logs", "diagnostics.jsonl"))
installMainProcessErrorHandlers()
registerArtifactResourceScheme()
if (process.platform === "win32") {
  // Windows Toast 以 AppUserModelID 识别发送者；与安装包 appId 保持单一来源。
  app.setAppUserModelId(branding.appId)
}

const viteDevServerUrl = process.env["VITE_DEV_SERVER_URL"]
const rendererDist = path.join(appRoot, "dist")
const rendererBaseUrl = pathToFileURL(`${rendererDist}${path.sep}`).href
const preloadPath = path.join(dirname, "preload.js")
const macTrafficLightPosition = { x: 15, y: 17 }
const shutdownCleanupTimeoutMs = 5_000

// dev 用本地 scheme，生产用正式 scheme（R1 / 阶段 6）。
const protocolScheme = viteDevServerUrl ? branding.devProtocolScheme : branding.protocolScheme

let mainWindow: BrowserWindow | null = null
// 启动画面切换状态：splash 遮挡加载，渲染层 UI 就绪（ui-ready IPC）后才淡出替换。
let splashShownAt = 0
let mainWindowReadyToShow = false
let uiReadyReceived = false
let mainWindowRevealScheduled = false
let currentLocale: AppLocale | null = null
let isQuitting = false
type AppQuitIntent = "none" | "user-quit" | "update-install" | "termination-signal" | "relaunch"
let appQuitIntent: AppQuitIntent = "none"
// 退出回收只跑一次：记忆化 Promise，多条退出路径（before-quit / 信号 / 更新安装）复用同一次回收。
let shutdownReap: Promise<void> | null = null
const agentRetirementPool = new AgentRetirementPool()
let windowsTrayLifecycle: {
  dispose: () => void
  setLocale: (locale: string) => void
  setUpdateReadyVersion: (version: string | undefined) => void
} | null = null
let updateReadyNotification: Notification | null = null
let lastNotifiedUpdateVersion: string | null = null

const serverAdapter = new ElectronServerAdapter()
const server = new ConnectionServer(serverAdapter)

const settingsStore = new SettingsStore(app.getPath("userData"))
const attentionStore = new AttentionStore(app.getPath("userData"))
const modelCredentialStore = new ModelCredentialStore(app.getPath("userData"), safeStorage)
const modelsStore = new ModelsStore(app.getPath("userData"), modelCredentialStore)
const wikiGraphStateDir = path.join(app.getPath("userData"), "wikigraph-state")
const wikiGraphLibraryDir = path.join(wikiGraphStateDir, "library")
const wikiGraphCliPath = path.join(dirname, "dweis-wg.js")
// 二进制解析：生产从打包 Resources/bin（extraResources），dev 从 node_modules（opencode）与 .oo-bin（oo）。
const opencodeBinPath = app.isPackaged
  ? resolveBundledBin(process.resourcesPath, opencodeBinaryName())
  : resolveDevOpencodeBin(appRoot)
const ooBinPath = app.isPackaged ? resolveBundledBin(process.resourcesPath, ooBinaryName()) : resolveOoBin()
process.env.OO_CLI_PATH = ooBinPath
// 内置 skill 源目录：生产从打包 Resources/skills，dev 从 resources/skills（postinstall 导出）。
// AgentManager 启动时拷进 OpenCode workspace 的 .opencode/skill/，使 agent 直接读到。
const bundledSkillsDir = app.isPackaged
  ? resolveBundledSkillsDir(process.resourcesPath)
  : resolveDevBundledSkillsDir(appRoot)
const bundledToolRuntimePath = app.isPackaged
  ? resolveBundledToolRuntimePath(process.resourcesPath)
  : resolveDevBundledToolRuntimePath(appRoot)

// Agent 内核：凭证来自 Electron 会话中的短期 token；userData/auth.json 仅保存账号 profile。
// 未登录时 agent=null，服务仍注册但 isReady()=false，渲染层显示登录页；
// 登录 / 登出时经 applyAuthAccount 动态装配。
let agent: AgentManager | null = null
// 装配串行化：登录后紧接登出时避免 dispose/start 交错。
let applyChain: Promise<void> = Promise.resolve()
let agentRuntimeVersion = 0
let appliedAgentRuntimeVersion = -1
let runtimeInitialized = false

const authStore = new AuthStore(app.getPath("userData"))
const sessionActivityStore = new SessionActivityStore(app.getPath("userData"))
const sessionMetadataStore = new SessionMetadataStore(app.getPath("userData"))
const sessionProjectStore = new SessionProjectStore(app.getPath("userData"))
const artifactBundleStore = new ArtifactBundleStore(app.getPath("userData"))
const authorizationOverlayStore = new AuthorizationOverlayStore(app.getPath("userData"))
const stoppedGenerationStore = new StoppedGenerationStore(app.getPath("userData"))
const turnOutputStore = new TurnOutputStore(app.getPath("userData"), artifactBundleStore)
const userAttachmentStore = new UserAttachmentStore(app.getPath("userData"))
const trustedAttachmentPaths = new ExpiringTrustedPathRegistry()
const trustedProjectPaths = new ExpiringTrustedPathRegistry()
const artifactResourceLeaseStore = new ArtifactResourceLeaseStore()
const spreadsheetPreviewWorker = new SpreadsheetPreviewWorkerClient()
const browserManager = new BrowserManager({
  downloadsDir: app.getPath("downloads"),
  enabled: settingsStore.read().browserEnabled !== false,
  screenshotDir: path.join(app.getPath("userData"), "agent", "browser-screenshots"),
  // 子代理（task 子会话）浏览时携带自己的 sessionID：归一化为父会话，保证渲染层能收到
  // browserRequested/stateChanged（否则 agent 看得到、用户面板不出现）。
  normalizeSessionId: (sessionId) => chatService.displaySessionIdFor(sessionId),
})
const browserService = new BrowserServiceImpl(browserManager)
const browserControlServer = new BrowserControlServer(browserManager)
// Connections 请求已整体搬到渲染层（src/lib/connections-client.ts）；主进程只保留 agent 团队作用域同步，
// 持久记忆：MEMORY.md / USER.md 位于 userData 根，agent 每轮注入 system prompt，工具与设置页读写。
const memoryService = new MemoryServiceImpl({ store: new MemoryStore(app.getPath("userData")) })
// 后台记忆审查：每完成 N 轮对话，临时审查会话决定是否写入 MEMORY.md（agent 引用随登录变化）。
const memoryReviewer: MemoryReviewer = new MemoryReviewer({
  getAgent: () => agent,
  hasActiveGeneration: () => chatService.hasActiveGeneration(),
  getMemory: () => memoryService.getMemory(),
  getConfig: () => ({
    enabled: settingsStore.read().autoMemoryReview !== false,
    interval: settingsStore.read().autoMemoryReviewInterval ?? 10,
  }),
})

// 经 ChatService.setAgentTeam → onSetAgentTeam 回调（渲染层切 workspace 时调用）。
// PPTX 产物预览：LibreOffice headless 转 PDF（完整渲染图形/图片/排版），缓存到 userData/pptx-cache。
const pptxConverter = createPptxConverter({
  sofficeCandidates: [
    path.join(app.getAppPath(), "resources", "libreoffice", "minimal", "program", "soffice.exe"),
    path.join(process.resourcesPath, "libreoffice", "program", "soffice.exe"),
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ],
  cacheDir: path.join(app.getPath("userData"), "pptx-cache"),
})
const chatService: ChatServiceImpl = new ChatServiceImpl(null, {
  browserAvailable: () => settingsStore.read().browserEnabled !== false,
  bugReportRuntime: {
    appCommit: typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "unknown",
    appVersion: app.getVersion(),
    platform: process.platform,
  },
  createArtifactThumbnail: async (filePath) => {
    const image = await nativeImage.createThumbnailFromPath(filePath, { height: 160, width: 160 })
    return { dataUrl: image.isEmpty() ? null : image.toDataURL() }
  },
  createArtifactResourceUrl: (item) => {
    const lease = artifactResourceLeaseStore.grant(item)
    return { expiresAt: lease.expiresAt, url: artifactResourceUrl(lease.token) }
  },
  createSpreadsheetPreview: (filePath, mime, size) => spreadsheetPreviewWorker.preview(filePath, mime, size),
  createPptxPdfPreview: (pptxPath) => pptxConverter.convertToPdf(pptxPath),
  artifactBundleStore,
  authorizationOverlayStore,
  projectStore: sessionProjectStore,
  stoppedGenerationStore,
  trustedAttachmentPaths,
  turnOutputStore,
  userAttachmentStore,
  onPermissionModeChanged: (sessionId, permissionMode) =>
    sessionService.setPermissionMode({ id: sessionId, permissionMode }),
  onOomolAuthRequired: () => authManager.expireSession().then(() => undefined),
  planDir: path.join(app.getPath("userData"), "agent", "workspace", ".opencode", "plans"),
  onSetAgentTeam: handleAgentTeamChanged,
  onSessionCompleted: (input) => attentionService.completeSession(input),
  onTurnCompleted: (input) => memoryReviewer.onTurnCompleted(input),
})
const sessionService = new SessionServiceImpl(null, {
  activityStore: sessionActivityStore,
  metadataStore: sessionMetadataStore,
  onSessionArchived: (sessionId) => attentionService.removeSession(sessionId),
  onSessionRemoved: async (sessionId) => {
    await browserManager.removeSession(sessionId)
    await chatService.forgetSession(sessionId).catch((error: unknown) => {
      console.warn("[dweis] failed to clear removed session chat state", error)
      logMainError("failed to clear removed session chat state", error, { sessionId })
    })
    const [artifactBundles, turnOutputs] = await Promise.all([artifactBundleStore.read(), turnOutputStore.read()])
    await removeSessionOutputDirectories({
      agentRoot: path.join(app.getPath("userData"), "agent"),
      artifactBundles: artifactBundles.get(sessionId)?.values(),
      sessionId,
      turnOutputs: turnOutputs.get(sessionId)?.values(),
    }).catch((error: unknown) => {
      console.warn("[dweis] failed to clean removed session directories", error)
    })
    await Promise.all([
      artifactBundleStore.removeSession(sessionId),
      attentionService.removeSession(sessionId),
      turnOutputStore.removeSession(sessionId),
      userAttachmentStore.removeSession(sessionId),
    ]).catch((error: unknown) => {
      console.warn("[dweis] failed to clean removed session outputs", error)
    })
  },
  projectStore: sessionProjectStore,
  trustedProjectPaths,
  getPersona: () => settingsService.current().persona,
})
const modelsService = new ModelsServiceImpl({
  store: modelsStore,
  onModelDefinitionsChanged: () => {
    restartAgentForModelConfig()
    // 即时同步 agent 内存快照：刚添加/删除/切换的模型立即可 resolve，
    // 不等重启（重启负责刷新 opencode 侧 provider 配置）。
    void syncAgentCustomModels()
  },
})
const mcpStore = new McpStore(app.getPath("userData"))
const mcpService = new McpServiceImpl({
  store: mcpStore,
  onMcpServersChanged: () => agentRefreshScheduler.schedule("mcp configuration changed", 0),
})
const automationStore = new AutomationStore(app.getPath("userData"))
const automationService = new AutomationServiceImpl({
  store: automationStore,
  runTask: async (task) => {
    // 到点执行：新建会话并让 agent 执行任务指令，结果留在新会话。
    if (!agent || !agent.isReady()) {
      throw new Error("Agent runtime is not ready")
    }
    const session = await agent.createSession(task.name)
    await agent.promptStreaming(session.id, task.prompt, { mode: "build" })
  },
  parseTaskText: async (text, signal) => {
    // AI 解析优先（用户不需要懂任何语法），本地确定性解析兜底。
    const parsed = await parseTaskTextWithAgent(text, signal)
    if (parsed) {
      return parsed
    }
    const schedule = parseAutomationSchedule(text)
    if (schedule) {
      return {
        name: taskNameFromText(text),
        scheduleText: text,
        cron: scheduleToCron(schedule),
        schedule,
        timezone: defaultTimezone(),
        prompt: text,
      }
    }
    return null
  },
})
// 凭证逻辑在未注册的 AuthManager；注册给渲染层的 AuthServiceImpl 只是薄门面（防 RPC 凭证泄露）。
const authManager = new AuthManager({
  store: authStore,
  protocolScheme,
  applyAccount: applyAuthAccount,
})
const agentRefreshScheduler = new AgentRefreshScheduler({
  canRefresh: () => runtimeInitialized,
  isBusy: () => chatService.hasActiveGeneration(),
  isQuitting: () => isQuitting,
  refresh: refreshAgentRuntime,
})
const authService = new AuthServiceImpl(authManager)
const skillService = new SkillServiceImpl(authManager, {
  onRuntimeSkillsChanged: (reason) => agentRefreshScheduler.schedule(reason),
})
const settingsService = new SettingsServiceImpl({
  onSettingsChanged: async (settings) => {
    attentionService.settingsChanged(settings)
    await browserManager.setEnabled(settings.browserEnabled)
    agent?.setPersona(settings.persona)
    if (lastAppliedSubagentModelId !== serializedSubagentModelId(settings.subagentModelId)) {
      lastAppliedSubagentModelId = serializedSubagentModelId(settings.subagentModelId)
      agentRefreshScheduler.schedule("subagent model changed", 0)
    }
    if (lastAppliedSubagentReasoningLevel !== serializedSubagentReasoningLevel(settings.subagentReasoningLevel)) {
      lastAppliedSubagentReasoningLevel = serializedSubagentReasoningLevel(settings.subagentReasoningLevel)
      agentRefreshScheduler.schedule("subagent reasoning changed", 0)
    }
    if (lastAppliedExploreModelId !== serializedSubagentModelId(settings.exploreModelId)) {
      lastAppliedExploreModelId = serializedSubagentModelId(settings.exploreModelId)
      agentRefreshScheduler.schedule("explore model changed", 0)
    }
    if (lastAppliedExploreReasoningLevel !== serializedSubagentReasoningLevel(settings.exploreReasoningLevel)) {
      lastAppliedExploreReasoningLevel = serializedSubagentReasoningLevel(settings.exploreReasoningLevel)
      agentRefreshScheduler.schedule("explore reasoning changed", 0)
    }
    // 工具配置（AI 生成 / 网页搜索）写入 userData/tool-config.json：工具源码按调用读取，
    // 配置变化即时生效（热加入），无需重启 agent。
    await writeToolConfigFile(settingsService, modelCredentialStore).catch((error: unknown) => {
      console.warn("[dweis] failed to write tool config file:", error)
    })
  },
  store: settingsStore,
  // 工具密钥（生成 API key / 搜索 token）经 ModelCredentialStore 以 safeStorage 密文落盘。
  toolCredentialStore: {
    get: async (scope) => (await modelCredentialStore.get(`tools:${scope}`)) ?? null,
    set: async (scope, secret) => {
      if (secret === null) {
        await modelCredentialStore.delete(`tools:${scope}`)
      } else {
        await modelCredentialStore.set(`tools:${scope}`, secret)
      }
      // 密钥变化 = 工具配置变化：写回 tool-config.json（工具源码按调用读取，热加入即时生效）。
      await writeToolConfigFile(settingsService, modelCredentialStore).catch((error: unknown) => {
        console.warn("[dweis] failed to write tool config file:", error)
      })
    },
  },
})
// 子代智能体/探索子代理模型与推理强度变更去重：记录启动时的生效值，settingsChanged 广播变化时才调度 agent 重启。
let lastAppliedSubagentModelId: string | null = serializedSubagentModelId(settingsService.current().subagentModelId)
let lastAppliedSubagentReasoningLevel: string | null = serializedSubagentReasoningLevel(
  settingsService.current().subagentReasoningLevel,
)
let lastAppliedExploreModelId: string | null = serializedSubagentModelId(settingsService.current().exploreModelId)
let lastAppliedExploreReasoningLevel: string | null = serializedSubagentReasoningLevel(
  settingsService.current().exploreReasoningLevel,
)

/** 把子代智能体模型选择序列化为可比较字符串（null = 跟随主模型）。 */
function serializedSubagentModelId(modelId: SubagentModelChoice | null): string | null {
  return modelId ? `${modelId.kind}:${modelId.id}` : null
}

/** 把子代智能体推理强度序列化为可比较字符串（null = 跟随主会话）。 */
function serializedSubagentReasoningLevel(level: DWeisReasoningLevel | null): string | null {
  return level
}

/** 把启用的 MCP 服务转成 opencode config 的 mcp 段（stdio→local / http,sse→remote）。 */
async function runtimeMcpServers(): Promise<NonNullable<Config["mcp"]> | undefined> {
  const servers = await mcpStore.read()
  const mcp: NonNullable<Config["mcp"]> = {}
  for (const server of servers) {
    if (!server.enabled) continue
    const config = toOpencodeMcpConfig(server)
    if (config.type === "local" && config.command.length === 0) continue
    if (config.type === "remote" && !config.url) continue
    mcp[server.name] = config
  }
  return Object.keys(mcp).length > 0 ? mcp : undefined
}

/** 自动化任务默认名：取用户原话的前一段。 */
function taskNameFromText(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed
}

/** AI 解析任务的自然语言描述；AI 不可用 / 输出非法时返回 null。 */
async function parseTaskTextWithAgent(text: string, signal?: AbortSignal): Promise<ParsedTaskDraft | null> {
  if (!agent) {
    return null
  }
  const system = [
    "You are a schedule parser for a desktop AI assistant. The user describes a scheduled automation task in one sentence.",
    'Reply with ONLY a JSON object, no markdown fences, no commentary, in this exact shape:',
    '{',
    '  "name": "short task name (<= 24 chars)",',
    '  "prompt": "the instruction to execute when triggered, rewritten as a clear directive for an AI assistant",',
    '  "cron": "standard 5-field cron expression (minute hour day-of-month month day-of-week; day-of-week 0=Sunday, 7=Sunday)"',
    '}',
    "Examples:",
    '"每天早上9点整理今日待办" -> {"name":"整理今日待办","prompt":"整理今天的待办事项清单","cron":"0 9 * * *"}',
    '"每周一和周五上午10点发周报" -> {"name":"发周报","prompt":"生成并发送本周工作报告","cron":"0 10 * * 1,5"}',
    '"每30分钟检查一次服务器状态" -> {"name":"检查服务器状态","prompt":"检查服务器运行状态并报告异常","cron":"*/30 * * * *"}',
    '"每个工作日9点打卡" -> {"name":"打卡","prompt":"完成今日打卡","cron":"0 9 * * 1-5"}',
    "If the sentence has no time or frequency, reply {\"error\":\"no-schedule\"}.",
  ].join("\n")
  const answer = await agent.parseStructuredText(system, text, signal)
  if (!answer) {
    return null
  }
  try {
    const parsed = JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as Record<string, unknown>
    if (parsed.error || typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
      return null
    }
    const cron = normalizeCron(parsed.cron)
    if (!cron) {
      return null
    }
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : taskNameFromText(text),
      scheduleText: text,
      cron,
      schedule: cronToSchedule(cron),
      timezone: defaultTimezone(),
      prompt: parsed.prompt.trim(),
    }
  } catch {
    return null
  }
}
const attentionService = new AttentionServiceImpl({
  getLocale: activeLocale,
  getSettings: () => settingsService.current(),
  getWindow: () => mainWindow,
  getSessionPersona: (sessionId) => sessionService.sessionPersona(sessionId),
  revealWindow: showMainWindow,
  store: attentionStore,
})
// 更新渠道（stable/beta）持久化在同一 settings.json；服务内部仅打包态联网。
const updateService = new UpdateServiceImpl({
  // 安装前先武装退出意图并把 agent（含 opencode 工具子进程树）连根回收，再交给
  // quitAndInstall。此处刻意在 quitAndInstall 之前 await：安装走 Squirrel 的正常退出流程，
  // 不能像用户退出那样 preventDefault+app.exit（会跳过安装），故回收必须在退出前完成。
  beforeInstallDownloadedAppUpdate: async () => {
    armAppQuit("update-install")
    await reapAgentForShutdown()
  },
  onStateChanged: handleAppUpdateStateChanged,
  store: settingsStore,
})
const gitService = new GitServiceImpl({
  projectStore: sessionProjectStore,
})
const knowledgeService = new KnowledgeServiceImpl({
  onRemoved: async (id) => {
    await Promise.all([sessionService.removeKnowledgeBaseReferences(id), agent?.removeKnowledgeBaseAccess(id)])
  },
  runtime: { managedLibraryDir: wikiGraphLibraryDir, stateDir: wikiGraphStateDir },
  trustedImportPaths: trustedAttachmentPaths,
})
// 使用统计：只读查询 opencode SQLite（token 用量 + 活跃热力），数据库缺失时返回空统计。
const usageService = new UsageServiceImpl(
  path.join(app.getPath("userData"), "agent", "isolation", "xdg-data", "opencode", "opencode.db"),
)

chatService.sessionActivity.on(({ sessionId, usedAt }) => {
  void sessionService.recordUseAndEmit(sessionId, usedAt).catch((error: unknown) => {
    console.warn("[dweis] failed to record session activity:", error)
    logMainError("failed to record session activity", error, { sessionId })
  })
})

if (shouldRegisterProtocolClient()) {
  registerProtocolClient(protocolScheme)
} else {
  console.info(`[dweis] protocol registration skipped for ${protocolScheme}`)
}
const { initialUrl, isLocked } = requestProtocolSingleInstanceLock(protocolScheme, { enabled: app.isPackaged })

if (!isLocked) {
  app.quit()
}

// 注册所有 service 实现，必须在 server.start() 之前。
server.registerService(chatService)
server.registerService(attentionService)
server.registerService(sessionService)
server.registerService(skillService)
server.registerService(modelsService)
server.registerService(settingsService)
server.registerService(mcpService)
server.registerService(automationService)
server.registerService(authService)
server.registerService(updateService)
server.registerService(gitService)
server.registerService(knowledgeService)
server.registerService(usageService)
server.registerService(memoryService)
server.registerService(browserService)
settingsService.applyStartupTheme()
// RPC 加固（纵深防御）：sender 校验（主 frame + 受信 origin）。方法级白名单曾引入
// （isRpcMethodAllowed）但因枚举难与调用点同步、漏项导致 RPC 静默失败（build215 白屏 /
// build216 解构报错）已整体回退——sender 校验是主防御。
// @oomol/connection 的 adapter 在 start() 时把 _ipcInvokeHandler_/_ipcEventHandler_ 绑到
// ipcMain 通道上（引用的是字段当前值），必须在 server.start() 之前替换成带守卫的包装。
// 这两个字段是编译产物的内部实现（.d.ts 未声明），用结构类型声明访问。
type ConnectionInvokePayload = { serviceName?: string; method?: string; args?: unknown[] }
interface ConnectionAdapterInternals {
  _ipcInvokeHandler_: (
    event: Electron.IpcMainInvokeEvent,
    type: string,
    payload: ConnectionInvokePayload | undefined,
  ) => unknown
  _ipcEventHandler_: (event: Electron.IpcMainEvent, serviceName: string, payload: unknown) => void
}
const connectionGuardOptions = { viteDevServerUrl, rendererBaseUrl }
const windowBoundsIpcGuard = connectionGuardOptions
const serverAdapterInternals = serverAdapter as unknown as ConnectionAdapterInternals
const connectionInvokeHandler = serverAdapterInternals._ipcInvokeHandler_
const connectionEventHandler = serverAdapterInternals._ipcEventHandler_
serverAdapterInternals._ipcInvokeHandler_ = (event, type, payload) => {
  if (!isTrustedIpcSender(event, connectionGuardOptions)) {
    return undefined
  }
  return connectionInvokeHandler(event, type, payload)
}
serverAdapterInternals._ipcEventHandler_ = (event, serviceName, payload) => {
  if (!isTrustedIpcSender(event, connectionGuardOptions)) {
    return
  }
  connectionEventHandler(event, serviceName, payload)
}
registerAttachmentDialogHandlers(
  trustedAttachmentPaths,
  windowBoundsIpcGuard,
  {
    createSpreadsheetPreview: (filePath, mime, size) => spreadsheetPreviewWorker.preview(filePath, mime, size),
    rememberProjectPath: (directoryPath) => trustedProjectPaths.add(directoryPath),
  },
)
registerClipboardHandler(windowBoundsIpcGuard)
registerAppLocaleHandler()
registerRendererErrorHandler()
registerUiReadyHandler()
registerWindowBoundsHandlers()

if (isLocked) {
  server.start()

  // macOS 冷启动的 open-url 在 ready 前就会派发（无缓冲），监听必须尽早注册——
  // 放进 whenReady 会整个丢掉登录回调。
  listenProtocolUrls(protocolScheme, { handleUrl: handleDeepLink }, showMainWindow)

  if (initialUrl) {
    // 冷启动经协议 URL 拉起（win/linux argv）：统一分发登录与连接器回调，窗口创建在 whenReady。
    void handleDeepLink(initialUrl).catch((error: unknown) => {
      console.error("[dweis] failed to handle startup deep link:", error)
    })
  }

  app
    .whenReady()
    .then(() => {
      void browserControlConnection()
      installArtifactResourceProtocol(artifactResourceLeaseStore)
      // 放行渲染进程对 *.<endpoint> 的已鉴权直连请求（凭证经会话 cookie 自动附带，token 不进渲染层）。
      installOomolCorsShim(session.defaultSession)
      installApplicationMenu()
      createMainWindow()
      void attentionService.initialize().catch((error: unknown) => {
        console.warn("[dweis] failed to initialize task attention state:", error)
      })
      void automationService.start().catch((error: unknown) => {
        console.warn("[dweis] failed to start automation scheduler:", error)
      })
      void userAttachmentStore.pruneExpiredUnreferenced().catch((error: unknown) => {
        console.warn("[dweis] failed to prune expired attachment snapshots:", error)
      })
      // 打包态启动跨平台后台更新：延迟首查、周期检查、系统唤醒后补查；发现后后台下载，
      // 安装仍由用户点击重启或正常退出触发，避免打断 Agent 任务。
      updateService.startBackgroundChecks()

      // 启动时一次性抹除磁盘上残留的旧长期 api-key（迁移到纯会话 token 后不再落盘任何凭证）。
      authStore.purgeLegacy()
      void authManager
        .activeRuntimeAccount()
        .then((account) => {
          return applyAuthAccount(account)
        })
        .catch((error: unknown) => {
          console.error("[dweis] agent sidecar failed to start:", error)
          logMainError("agent sidecar failed to start", error)
        })

      app.on("activate", () => {
        if (mainWindow) {
          revealMainWindow(mainWindow)
        } else if (BrowserWindow.getAllWindows().length === 0) {
          createMainWindow()
        }
      })
    })
    .catch((error: unknown) => {
      console.error("[dweis] app startup failed:", error)
      logMainError("app startup failed", error)
    })

  app.on("window-all-closed", () => {
    // 沿用系统惯例：仅 Windows/Linux 在关闭最后一个窗口时退出；macOS 保持存活留在 Dock，
    // 点图标经 activate 重开窗口。macOS 上"退出后仍显示正在后台运行"的病根是 opencode sidecar
    // 孤儿化（见下方信号处理器与 sidecar.ts 的按组回收），而非关窗行为，故这里不改。
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  // 终端 Ctrl-C / kill <pid> / OS 关机 / macOS "停止在后台运行" 可能以原始 POSIX 信号（而非 Cocoa
  // Quit 事件，后者走 before-quit）送达主进程。没有信号处理器时进程会被直接终止、不触发 before-quit，
  // opencode sidecar 便沦为永久孤儿（reparent 到 launchd），macOS 仍把 app 判为"后台运行"。
  // 这里 await 完整回收（进程树 SIGTERM/SIGKILL 送达）后再硬退出。
  // 另注：opencode 现以 detached 独立进程组运行，dev 下 Ctrl-C 不会经前台进程组自然传到它，
  // 全靠此处 SIGINT 处理器显式回收，否则会残留孤儿。
  const onTerminationSignal = (signal: NodeJS.Signals): void => {
    console.log(`[dweis] received ${signal}; shutting down`)
    armAppQuit("termination-signal")
    void reapAgentForShutdown().finally(() => app.exit(0))
  }
  process.once("SIGTERM", () => onTerminationSignal("SIGTERM"))
  process.once("SIGINT", () => onTerminationSignal("SIGINT"))

  app.on("before-quit", (event) => {
    // 更新安装（quitAndInstall）路径：回收已在 beforeInstallDownloadedAppUpdate 里 await 完成，
    // 且必须放行 Squirrel 的正常退出流程去执行安装，故绝不 preventDefault/app.exit。
    if (appQuitIntent === "update-install") {
      return
    }
    // 用户退出（Cmd+Q / 菜单退出 / win-linux 关末窗）：opencode 的工具子进程各自 setsid 逃逸出
    // opencode 进程组，单发 kill(-pgid) 收不掉，退出后成孤儿被 macOS 判为"正在后台运行"。这里
    // 始终拦下默认退出，await 按 ppid 进程树连根回收后再 app.exit(0)（回收记忆化，连按 Cmd+Q
    // 也只回收一次，且每次 before-quit 都 preventDefault，绝不让第二次退出穿透略过回收）。
    event.preventDefault()
    armAppQuit("user-quit")
    void reapAgentForShutdown().finally(() => app.exit(0))
  })
}

async function browserControlConnection(): Promise<BrowserControlConnection | undefined> {
  try {
    return await browserControlServer.connection()
  } catch (error) {
    console.warn("[dweis] integrated browser control unavailable:", error)
    logMainError("integrated browser control unavailable", error)
    return undefined
  }
}

/**
 * 退出前一次性回收：停掉待处理定时器/托盘，await agent（含 opencode 工具子进程树）连根回收，
 * 再 dispose 服务与刷日志。记忆化，确保多条退出路径只回收一次。
 */
function reapAgentForShutdown(): Promise<void> {
  shutdownReap ??= (async () => {
    agentRefreshScheduler.dispose()
    // 退出观感：先藏窗口，回收（含最长宽限期）在后台进行，不让用户盯着卡住的窗口。
    mainWindow?.hide()
    updateReadyNotification?.close()
    updateReadyNotification = null
    windowsTrayLifecycle?.dispose()
    windowsTrayLifecycle = null
    const activeAgent = agent
    agent = null
    chatService.setAgent(null)
    sessionService.setAgent(null)
    if (activeAgent) {
      await runBoundedShutdownStep("retire active agent", () => agentRetirementPool.retire(activeAgent))
    }
    await runBoundedShutdownStep("drain agent retirements", () => agentRetirementPool.drain())
    await runBoundedShutdownStep("dispose spreadsheet preview worker", () => spreadsheetPreviewWorker.dispose())
    await runBoundedShutdownStep("dispose browser control server", () => browserControlServer.dispose())
    await runBoundedShutdownStep("dispose integrated browser", () => browserManager.dispose())
    server.dispose()
    artifactResourceLeaseStore.clear()
    await runBoundedShutdownStep("flush diagnostics log", flushDiagnosticsLog)
  })()
  return shutdownReap
}

async function runBoundedShutdownStep(label: string, task: () => Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${shutdownCleanupTimeoutMs}ms`)),
      shutdownCleanupTimeoutMs,
    )
  })
  try {
    await Promise.race([Promise.resolve().then(task), timeout])
  } catch (error) {
    console.warn(`[dweis] shutdown cleanup failed: ${label}`, error)
    logDiagnostic("app-lifecycle", "shutdown cleanup failed", { error, label }, "warn")
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function armAppQuit(intent: Exclude<AppQuitIntent, "none">): void {
  if (appQuitIntent === "none") {
    appQuitIntent = intent
    logDiagnostic("app-lifecycle", "application quit armed", { intent }, "info")
  }
  isQuitting = true
}

function logMainError(message: string, error: unknown, fields: Record<string, unknown> = {}): void {
  logDiagnostic("main", message, { ...fields, error }, "error")
}

function installMainProcessErrorHandlers(): void {
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    console.error("[dweis] uncaught exception:", error)
    logMainError("uncaught exception", error, { origin })
  })
  process.on("unhandledRejection", (reason) => {
    console.error("[dweis] unhandled promise rejection:", reason)
    logMainError("unhandled promise rejection", reason)
  })
  process.on("warning", (warning) => {
    console.warn("[dweis] process warning:", warning)
    logDiagnostic("main", "process warning", { warning }, "warn")
  })
  app.on("child-process-gone", (_event, details) => {
    console.error("[dweis] child process gone:", details)
    logDiagnostic("main", "child process gone", { details }, "error")
  })
  app.on("render-process-gone", (_event, webContents, details) => {
    console.error("[dweis] render process gone:", details)
    logDiagnostic(
      "main",
      "render process gone",
      {
        details,
        url: webContents.getURL(),
      },
      "error",
    )
  })
}

function registerRendererErrorHandler(): void {
  ipcMain.on("dweis:renderer-error", (event, input: unknown) => {
    if (!isTrustedIpcSender(event, { viteDevServerUrl, rendererBaseUrl })) {
      return
    }
    const report = normalizeRendererErrorReport(input)
    if (!report) return
    const message = report.level === "error" ? "renderer error" : "renderer handled issue"
    if (report.level === "error") console.error("[dweis] renderer error:", report)
    else console.warn("[dweis] renderer handled issue:", report)
    logDiagnostic("renderer", message, { ...report }, report.level)
  })
}

function registerUiReadyHandler(): void {
  ipcMain.on("dweis:ui-ready", (event) => {
    if (!isTrustedIpcSender(event, { viteDevServerUrl, rendererBaseUrl })) {
      return
    }
    uiReadyReceived = true
    maybeRevealMainWindow()
  })
}

function registerWindowBoundsHandlers(): void {
  ipcMain.handle("dweis:window:get-bounds", (event) => {
    if (!isTrustedIpcSender(event, windowBoundsIpcGuard)) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
    if (!mainWindow) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
    return mainWindow.getBounds()
  })
  ipcMain.handle(
    "dweis:window:set-bounds",
    (event, bounds: { x: number; y: number; width: number; height: number }) => {
      if (!isTrustedIpcSender(event, windowBoundsIpcGuard)) {
        return
      }
      if (!mainWindow) {
        return
      }
      const current = mainWindow.getBounds()
      const minWidth = mainWindow.getMinimumSize()[0]
      // 仅允许从右边缘缩放：固定左上角 (x, y) 与高度，只改宽度，使主界面（聊天区）不被牵连移动。
      let width = Math.max(minWidth, Math.round(bounds.width))
      const display = screen.getPrimaryDisplay()
      const maxWidth = display.workArea.x + display.workArea.width - current.x
      width = Math.min(width, Math.max(minWidth, maxWidth))
      mainWindow.setBounds({ x: current.x, y: current.y, width, height: current.height })
    },
  )
  // 数据目录迁移后立即重启（设置页"立即重启"按钮）。
  // app.relaunch()+app.exit(0) 不触发 before-quit，sidecar 进程树会沦为孤儿——
  // 先走记忆化退出回收（同一次回收，sidecar 连根 SIGTERM/SIGKILL）再重启。
  ipcMain.handle("dweis:relaunch-app", (event) => {
    if (!isTrustedIpcSender(event, windowBoundsIpcGuard)) {
      return
    }
    armAppQuit("relaunch")
    void reapAgentForShutdown().finally(() => {
      app.relaunch()
      app.exit(0)
    })
  })
}

function runtimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function applyUserDataOverride(): void {
  const override = process.env["DWEIS_USER_DATA_DIR"]?.trim()
  if (!override) {
    return
  }
  if (app.isPackaged) {
    console.warn("[dweis] ignoring DWEIS_USER_DATA_DIR in packaged app")
    return
  }
  app.setPath("userData", path.resolve(appRoot, override))
}

function shouldRegisterProtocolClient(): boolean {
  if (app.isPackaged) {
    return true
  }
  const value = process.env["DWEIS_SKIP_PROTOCOL_REGISTRATION"]?.trim().toLowerCase()
  return !value || !["1", "true", "yes", "on"].includes(value)
}

/** 凭证 → 运行时装配：替换 agent（重启 sidecar）。经 applyChain 串行执行。 */
function applyAuthAccount(account: AuthRuntimeAccount | null): Promise<void> {
  if (isQuitting) {
    return Promise.resolve()
  }
  const next = applyChain.then(async () => {
    try {
      await applyAuthAccountNow(account)
    } finally {
      // 无连接功能：连接器运行时已移除，无联动。
    }
  })
  applyChain = next.catch((error: unknown) => {
    logMainError("auth account application failed", error)
  })
  return next
}

/** 最近一次成功装配的账号：同凭证重复 apply 时短路，避免无谓的 sidecar 重启。 */
let appliedAccount: AuthRuntimeAccount | null = null
let appliedRuntimeKey: string | null = null
// agent 的当前团队作用域：由渲染层切 workspace 时经 setAgentTeam IPC 更新；agent 重建时据此设初值。
let activeAgentTeamName: string | undefined

async function applyAuthAccountNow(account: AuthRuntimeAccount | null): Promise<void> {
  if (isQuitting) {
    return
  }
  await browserManager.setProfileScope(account?.id)
  runtimeInitialized = true
  const runtimeVersionAtStart = agentRuntimeVersion
  const runtimeModels = await modelsStore.runtimeModels()
  const runtime = resolveAgentRuntime(account, runtimeModels.selected, runtimeModels.customModels)
  // 连接功能已移除：无 Link 运行时，agent 始终以本地模式启动（恒 null）。
  const linkRuntime = null
  // 冷启动 deep-link、模型事件与 auth 广播可能重复触发；运行时身份和配置版本均未变化时短路。
  if (
    runtime &&
    appliedRuntimeKey === runtime.key &&
    agent?.isReady() &&
    appliedAgentRuntimeVersion === agentRuntimeVersion &&
    account?.id === appliedAccount?.id
  ) {
    return
  }
  const previousAccountId = appliedAccount?.id
  appliedAccount = null
  appliedRuntimeKey = null
  // 旧 sidecar 必须在新 sidecar 启动前完成回收，避免共享 workspace/isolation 的两个运行时短暂并存。
  const previousAgent = agent
  agent = null
  chatService.setAgent(null)
  chatService.setRuntimeCapabilities(
    resolveRuntimeCapabilities({
      mode: account ? "oomol" : "local",
      localAgentAvailable: Boolean(runtime),
    }),
  )
  chatService.setAgentStatus(runtime ? { status: "starting" } : { status: "model_required" })
  sessionService.setAgent(null)

  if (previousAgent) {
    try {
      await agentRetirementPool.retire(previousAgent)
    } catch (error) {
      // 旧运行时未确认退出时不冒险启动第二个 sidecar；保持 appliedAccount 为空，允许后续重试。
      console.warn("[dweis] failed to retire previous agent runtime:", error)
      logMainError("failed to retire previous agent runtime", error)
      chatService.setAgentStatus({
        status: "error",
        message: `Failed to stop the previous OpenCode runtime: ${runtimeErrorMessage(error)}`,
      })
      return
    }
  }

  if (!runtime || isQuitting) {
    activeAgentTeamName = undefined
    await attentionService.clearAll().catch((error: unknown) => {
      console.warn("[dweis] failed to clear attention state during sign-out:", error)
    })
    if (!account) console.log("[dweis] local Agent requires a configured custom model")
    return
  }
  if (previousAccountId && previousAccountId !== account?.id) {
    activeAgentTeamName = undefined
    await attentionService.clearAll().catch((error: unknown) => {
      console.warn("[dweis] failed to clear attention state during account switch:", error)
    })
  }

  if (isQuitting) {
    return
  }
  const nextAgent = new AgentManager({
    browserControl: browserControlConnection,
    defaultModel: runtime.defaultModel,
    linkRuntime,
    modelAccess: runtime.modelAccess,
    opencodeBinPath,
    ooBinPath,
    wikiGraphCliPath,
    wikiGraphStateDir,
    bundledSkillsDir,
    bundledToolRuntimePath,
    rootDir: path.join(app.getPath("userData"), "agent"),
    customModels: runtimeModels.customModels,
    subagentModel: settingsStore.read().subagentModelId ?? undefined,
    subagentReasoningVariant: opencodeReasoningVariant(settingsService.current().subagentReasoningLevel ?? undefined),
    exploreModel: settingsStore.read().exploreModelId ?? undefined,
    exploreReasoningVariant: opencodeReasoningVariant(settingsService.current().exploreReasoningLevel ?? undefined),
    mcpServers: await runtimeMcpServers(),
    memoryDir: app.getPath("userData"),
    persona: settingsService.current().persona,
    toolConfig: { toolsConfigPath: await writeToolConfigFile(settingsService, modelCredentialStore) },
  })
  agent = nextAgent
  chatService.setAgent(nextAgent)
  sessionService.setAgent(nextAgent)
  try {
    await nextAgent.start()
  } catch (error) {
    // 启动失败不留僵尸 agent：清空引用并完成回收，下次登录可重试。
    await agentRetirementPool.retire(nextAgent)
    agent = null
    chatService.setAgent(null)
    chatService.setAgentStatus({ status: "error", message: runtimeErrorMessage(error) })
    sessionService.setAgent(null)
    throw error
  }
  if (isQuitting) {
    await agentRetirementPool.retire(nextAgent)
    if (agent === nextAgent) {
      agent = null
      chatService.setAgent(null)
      sessionService.setAgent(null)
    }
    return
  }
  appliedAccount = account
  appliedRuntimeKey = runtime.key
  appliedAgentRuntimeVersion = runtimeVersionAtStart
  chatService.startEventBridge()
  chatService.setAgentStatus({ status: "ready" })
  console.log("[dweis] agent sidecar ready at", nextAgent.url)
  if (agentRuntimeVersion !== runtimeVersionAtStart) {
    agentRefreshScheduler.schedule("runtime configuration changed during agent startup", 0)
  }
}

async function handleAgentTeamChanged(teamName: string | undefined): Promise<void> {
  const previousTeamName = activeAgentTeamName
  const nextTeamName = teamName?.trim() ? teamName.trim() : undefined
  activeAgentTeamName = nextTeamName
  try {
    await agent?.setTeamName(nextTeamName)
  } catch (error: unknown) {
    activeAgentTeamName = previousTeamName
    console.error("[dweis] failed to update agent workspace scope:", error)
    throw error
  }
}

function restartAgentForModelConfig(): void {
  if (isQuitting) {
    return
  }
  agentRefreshScheduler.schedule("model configuration changed", 0)
}

/** 模型变更后立即把最新自定义模型列表同步进 agent 内存快照（resolveModel 用最新列表）。 */
function syncAgentCustomModels(): Promise<void> {
  return modelsStore
    .runtimeModels()
    .then((runtime) => agent?.updateCustomModels(runtime.customModels))
    .catch((error: unknown) => {
      logMainError("failed to sync agent custom models", error)
    })
}

async function refreshAgentRuntime(_reason: string): Promise<void> {
  agentRuntimeVersion += 1
  const account = await authManager.activeRuntimeAccount()
  await applyAuthAccount(account)
  // 会话中途过期：装配登出态后主动广播“未登录”，渲染层据此切回本地 workspace。
  if (!account) await authManager.broadcastAuthState()
}
function resolveOoBin(): string {
  if (process.env["DWEIS_OO_BIN"]) {
    return process.env["DWEIS_OO_BIN"]
  }
  return resolveDevOoBin(appRoot)
}

function getBrandingResourcePath(fileName: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, fileName)
  }

  return path.join(appRoot, "resources", "branding", fileName)
}

// 仅放行安全的用户意图协议外开；其余（file:、自定义协议等）一律忽略。
function openExternalUrl(url: string): void {
  if (/^(https?|mailto|tel):/i.test(url)) {
    void shell.openExternal(url).catch((error: unknown) => {
      console.warn("[dweis] failed to open external URL:", error)
      logMainError("failed to open external URL", error, { url })
    })
  }
}

function sendAppCommand(command: AppCommand): void {
  showMainWindow()
  const target = mainWindow
  if (!target) {
    return
  }
  const send = (): void => target.webContents.send(APP_COMMAND_CHANNEL, command)
  if (target.webContents.isLoading()) {
    target.webContents.once("did-finish-load", send)
    return
  }
  send()
}

let applicationMenuIcons: {
  about: Electron.NativeImage
  checkForUpdates: Electron.NativeImage
  services: Electron.NativeImage
  settings: Electron.NativeImage
} | null = null

function macMenuSymbol(name: string): Electron.NativeImage {
  const image = nativeImage.createFromNamedImage(name).resize({ height: 16 })
  image.setTemplateImage(true)
  return image
}

function macApplicationMenuIcons(): typeof applicationMenuIcons {
  if (process.platform !== "darwin") {
    return null
  }
  // 菜单会在语言切换时重建；保留 NativeImage 强引用，避免 AppKit 后续重绘时图标丢失。
  applicationMenuIcons ??= {
    about: macMenuSymbol("info.circle"),
    checkForUpdates: macMenuSymbol("arrow.clockwise"),
    services: macMenuSymbol("link"),
    settings: macMenuSymbol("gearshape"),
  }
  return applicationMenuIcons
}

function installApplicationMenu(): void {
  const macIcons = macApplicationMenuIcons()
  const menu = Menu.buildFromTemplate(
    buildApplicationMenuTemplate({
      developmentMode: shouldShowDevelopmentMenu(),
      locale: activeLocale(),
      macIcons: macIcons ?? undefined,
      onCommand: sendAppCommand,
      platform: process.platform,
    }),
  )
  // macOS 会先为 Services role 放入系统图标；菜单构建后再替换，保留原生 Services 子菜单行为。
  if (macIcons) {
    const aboutItem = menu.getMenuItemById("app-about")
    const servicesItem = menu.getMenuItemById("app-services")
    if (aboutItem) aboutItem.icon = macIcons.about
    if (servicesItem) servicesItem.icon = macIcons.services
  }
  Menu.setApplicationMenu(menu)
}

function activeLocale(): AppLocale {
  return currentLocale ?? normalizeAppLocale(app.getLocale())
}

function shouldShowDevelopmentMenu(): boolean {
  return !app.isPackaged || process.env["DWEIS_ENABLE_DEV_MENU"] === "1"
}

function registerAppLocaleHandler(): void {
  ipcMain.on(APP_LOCALE_CHANNEL, (event, locale: unknown) => {
    if (!isTrustedIpcSender(event, windowBoundsIpcGuard)) {
      return
    }
    if (!isAppLocale(locale) || currentLocale === locale) {
      return
    }
    currentLocale = locale
    if (app.isReady()) {
      installApplicationMenu()
    }
    windowsTrayLifecycle?.setLocale(locale)
  })
}

function maybeRevealMainWindow(): void {
  if (!mainWindow || mainWindowRevealScheduled || !mainWindowReadyToShow || !uiReadyReceived) {
    return
  }
  mainWindowRevealScheduled = true
  // 最短展示时长：UI 就绪过早时也把 splash 留够时间，避免一闪而过。
  const waitMs = Math.max(0, splashShownAt + SPLASH_MIN_VISIBLE_MS - Date.now())
  setTimeout(() => {
    dismissSplashWindow()
    revealMainWindowWithFade()
  }, waitMs)
}

function revealMainWindowWithFade(): void {
  if (!mainWindow) {
    return
  }
  // 主窗口与 splash 同尺寸同位置：先透明再渐显，衔接成同一位置的「替换」过渡。
  try {
    mainWindow.setOpacity(0)
    mainWindow.show()
    const fadeIn = (opacity: number): void => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return
      }
      if (opacity >= 1) {
        mainWindow.setOpacity(1)
        return
      }
      mainWindow.setOpacity(opacity)
      setTimeout(() => fadeIn(opacity + 0.18), 24)
    }
    fadeIn(0.1)
  } catch {
    mainWindow.show()
  }
}

function createMainWindow(): void {
  installPermissionRequestHandler()
  // 冷启动先弹品牌启动画面（与主窗口同尺寸），渲染层 UI 就绪后淡出替换。
  mainWindowReadyToShow = false
  uiReadyReceived = false
  mainWindowRevealScheduled = false
  splashShownAt = Date.now()
  showSplashWindow()
  const isMac = process.platform === "darwin"
  const titleBarTheme = resolveWindowsTitleBarTheme(nativeTheme.shouldUseDarkColors)
  const nativeMaterial = nativeWindowMaterialForPlatform(process.platform)
  const backgroundColor = windowBackgroundColorForMaterial(titleBarTheme, nativeMaterial)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: branding.appName,
    icon: getBrandingResourcePath("icon.png"),
    backgroundColor,
    ...(nativeMaterial === "none" ? {} : { transparent: true }),
    titleBarStyle: "hidden",
    ...(isMac
      ? {
          trafficLightPosition: macTrafficLightPosition,
          vibrancy: "sidebar",
          visualEffectState: "followWindow",
        }
      : {}),
    ...(isMac
      ? {}
      : {
          ...nativeWindowFrameForPlatform(process.platform),
          titleBarOverlay: buildWindowsTitleBarOverlay(titleBarTheme),
        }),
    webPreferences: {
      preload: preloadPath,
      // 主窗口启用沙箱：preload 仅用 ipcRenderer / contextBridge / webUtils（以及 oomol
      // 连接适配器的 contextBridge），均为沙箱 preload 可用 API。零功能损失，却能在 preload
      // 被攻破时消除「拿到完整 Node 权限」的风险（对比默认 sandbox:false）。
      sandbox: true,
    },
  })
  browserManager.setMainWindow(mainWindow)
  settingsService.trackTitleBarOverlayWindow(mainWindow)

  mainWindow.once("ready-to-show", () => {
    mainWindowReadyToShow = true
    maybeRevealMainWindow()
  })
  mainWindow.on("focus", () => {
    updateService.handleWindowForegrounded()
    void attentionService.windowFocused().catch((error: unknown) => {
      console.warn("[dweis] failed to mark the focused task as viewed:", error)
    })
  })
  mainWindow.on("show", () => updateService.handleWindowForegrounded())
  mainWindow.on("hide", () => {
    void updateService.getAppUpdateState().then(handleAppUpdateStateChanged)
  })

  if (process.platform === "darwin" || process.platform === "win32") {
    mainWindow.on(
      "close",
      createHideOnCloseHandler({
        hide: () => mainWindow?.hide(),
        isQuitting: () => isQuitting,
      }),
    )
  }

  if (process.platform === "win32") {
    if (!windowsTrayLifecycle) {
      try {
        windowsTrayLifecycle = createWindowsTrayLifecycle({
          iconPath: getBrandingResourcePath("icon.ico"),
          locale: activeLocale(),
          onExit: () => {
            armAppQuit("user-quit")
            app.quit()
          },
          onInstallUpdate: () => {
            void updateService.installDownloadedAppUpdate().catch((error: unknown) => {
              console.warn("[dweis] failed to install update from Windows tray", error)
              logDiagnostic("update-service", "tray update install failed", { error }, "warn")
            })
          },
          onOpen: () => {
            if (mainWindow) {
              revealMainWindow(mainWindow)
            } else {
              createMainWindow()
            }
          },
        })
        void updateService.getAppUpdateState().then(handleAppUpdateStateChanged)
      } catch (error) {
        console.warn("[dweis] failed to initialize Windows tray lifecycle", error)
      }
    }
  }

  // 渲染层里的外链（如 Markdown 里的链接、授权 URL）走系统浏览器，绝不在应用窗口内导航。
  // 仅放行安全的用户意图协议（http/https/mailto/tel），其余忽略，避免诱导触发 file:// 或自定义协议。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: "deny" }
  })
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // 只放行 dev server 同源页面或打包后的 renderer 目录，避免任意本地页面继承 preload 权限。
    if (!isTrustedRendererUrl(url, viteDevServerUrl, rendererBaseUrl)) {
      event.preventDefault()
      openExternalUrl(url)
    }
  })
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return
    }
    console.error("[dweis] renderer failed to load:", { errorCode, errorDescription, validatedURL })
    // 渲染加载失败同样收起 splash，主窗口直接显示（不等待 ui-ready）。
    dismissSplashWindow()
    mainWindowRevealScheduled = true
    mainWindow?.show()
    logDiagnostic(
      "main-window",
      "renderer failed to load",
      {
        errorCode,
        errorDescription,
        url: validatedURL,
      },
      "error",
    )
  })
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[dweis] main window render process gone:", details)
    logDiagnostic("main-window", "main window render process gone", { details }, "error")
  })
  mainWindow.on("unresponsive", () => {
    console.warn("[dweis] main window became unresponsive")
    logDiagnostic("main-window", "main window became unresponsive", {}, "warn")
  })

  if (viteDevServerUrl) {
    void mainWindow.loadURL(viteDevServerUrl).catch((error: unknown) => {
      console.error("[dweis] failed to load renderer URL:", error)
      logMainError("failed to load renderer URL", error, { url: viteDevServerUrl })
    })
  } else {
    const rendererEntry = path.join(rendererDist, "index.html")
    void mainWindow.loadFile(rendererEntry).catch((error: unknown) => {
      console.error("[dweis] failed to load renderer file:", error)
      logMainError("failed to load renderer file", error, { path: rendererEntry })
    })
  }

  // 兜底：渲染层迟迟未发 ui-ready（渲染异常等）也强制切换，避免 splash 永久占屏。
  setTimeout(() => {
    if (!mainWindow || mainWindowRevealScheduled) {
      return
    }
    uiReadyReceived = true
    maybeRevealMainWindow()
  }, SPLASH_FALLBACK_MS)

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

function installPermissionRequestHandler(): void {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _requestingOrigin, details) => {
    return (
      permission === "media" &&
      webContents === mainWindow?.webContents &&
      details.isMainFrame &&
      details.mediaType === "audio" &&
      isTrustedRendererUrl(details.requestingUrl, viteDevServerUrl, rendererBaseUrl)
    )
  })
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      permission === "media" &&
        webContents === mainWindow?.webContents &&
        details.isMainFrame &&
        "mediaTypes" in details &&
        isAudioOnlyMediaRequest(details.mediaTypes) &&
        isTrustedRendererUrl(details.requestingUrl, viteDevServerUrl, rendererBaseUrl),
    )
  })
}

function showMainWindow(): void {
  if (!app.isReady()) {
    // open-url / second-instance 可能先于 ready 到达；窗口统一由 whenReady 创建。
    return
  }
  if (!mainWindow) {
    createMainWindow()
    return
  }
  revealMainWindow(mainWindow)
}

function handleAppUpdateStateChanged(state: AppUpdateState): void {
  const readyVersion = state.status.status === "downloaded" ? state.status.version : undefined
  windowsTrayLifecycle?.setUpdateReadyVersion(readyVersion)

  if (!readyVersion) {
    updateReadyNotification?.close()
    updateReadyNotification = null
    return
  }
  if (lastNotifiedUpdateVersion === readyVersion) return

  const window = mainWindow
  if (window?.isVisible() === true && window.isFocused()) {
    // The foreground renderer owns the one-time non-blocking reminder, avoiding duplicate native delivery.
    return
  }
  lastNotifiedUpdateVersion = readyVersion
  if (!Notification.isSupported()) {
    logDiagnostic("update-service", "update ready notification unsupported", { version: readyVersion }, "warn")
    return
  }

  const chinese = activeLocale() === "zh-CN"
  const notification = new Notification({
    body: chinese ? `打开 ${branding.appName} 即可选择合适的时间重启。` : `Open ${branding.appName} to restart when you're ready.`,
    groupId: "app-update",
    id: `app-update-${readyVersion}`,
    title: chinese ? `${branding.appName} ${readyVersion} 已准备好` : `${branding.appName} ${readyVersion} is ready`,
  })
  updateReadyNotification?.close()
  updateReadyNotification = notification
  notification.once("click", () => {
    logDiagnostic("update-service", "update ready notification clicked", { version: readyVersion }, "info")
    showMainWindow()
  })
  notification.once("show", () => {
    logDiagnostic("update-service", "update ready notification accepted", { version: readyVersion }, "info")
  })
  notification.once("failed", (_event, error) => {
    logDiagnostic("update-service", "update ready notification failed", { error, version: readyVersion }, "warn")
  })
  notification.once("close", () => {
    if (updateReadyNotification === notification) updateReadyNotification = null
  })
  notification.show()
}

async function handleDeepLink(url: string): Promise<boolean> {
  // 先聚焦窗口（登录回调的网络交换可能耗时数秒），再交给 auth 完成登录。
  showMainWindow()
  const handled = await authManager.completeBrowserLoginCallback(url)
  if (!handled) {
    console.log("[dweis] unrecognized deep link:", redactDeepLink(url))
  }
  return handled
}

/** 日志脱敏：deep link 的 query 可能携带 authID（可直接兑换凭证），只记 scheme/host/path。 */
function redactDeepLink(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return "<unparseable>"
  }
}

/** 把工具配置（AI 生成 / 网页搜索 + 密钥）写到 userData/tool-config.json（权限 600）。
 * 工具源码每次调用读该文件——配置变化即时生效（热加入），无需重启 agent。 */
async function writeToolConfigFile(
  settings: typeof settingsService,
  credentials: ModelCredentialStore,
): Promise<string | undefined> {
  const current = settings.current()
  const [generationKey, searchKey] = await Promise.all([
    current.generationConfig?.enabled ? credentials.get("tools:generation") : undefined,
    current.searchConfig?.enabled ? credentials.get("tools:search") : undefined,
  ])
  const config: Record<string, unknown> = {}
  if (current.generationConfig?.enabled && current.generationConfig.apiBase && current.generationConfig.modelName && generationKey) {
    config.generation = {
      enabled: true,
      apiBase: current.generationConfig.apiBase,
      modelName: current.generationConfig.modelName,
      apiKey: generationKey,
      ...(current.generationConfig.videoModelName ? { videoModelName: current.generationConfig.videoModelName } : {}),
    }
  }
  if (current.searchConfig?.enabled && searchKey) {
    config.search = { enabled: true, provider: current.searchConfig.provider, apiKey: searchKey }
  }
  const file = path.join(app.getPath("userData"), "tool-config.json")
  await writeFile(file, JSON.stringify(config), { mode: 0o600 })
  return file
}
