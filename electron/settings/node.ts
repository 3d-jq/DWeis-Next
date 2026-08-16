import type { DWeisReasoningLevel } from "../agent/reasoning.ts"
import type { WindowsTitleBarTheme } from "../window/title-bar-overlay.ts"
import type { GenerationConfig, SearchConfig, SubagentModelChoice } from "./common.ts"
import type {
  AppSettings,
  CompletionNotificationCondition,
  OperatingMode,
  Persona,
  SettingsService,
  ThemeSource,
} from "./common.ts"
import type { SettingsStore } from "./store.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { app, BrowserWindow, nativeTheme } from "electron"
import { DWEIS_REASONING_LEVELS } from "../agent/reasoning.ts"
import {
  defaultDataDirectory,
  migrateUserDataDirectory,
  validateDataDirectoryTarget,
  writeDataDirectoryRecord,
} from "../data-directory.ts"
import {
  buildWindowsTitleBarOverlay,
  nativeWindowMaterialForPlatform,
  resolveWindowsTitleBarTheme,
  shouldApplyWindowsTitleBarTheme,
  windowBackgroundColorForMaterial,
} from "../window/title-bar-overlay.ts"
import { DEFAULT_APP_SETTINGS, SettingsService as SettingsServiceName } from "./common.ts"

export interface SettingsServiceDeps {
  onSettingsChanged?: (settings: AppSettings) => Promise<void> | void
  store: SettingsStore
  /** 工具密钥（生成 API key / 搜索 token）安全存储：safeStorage 密文落盘，不落 settings.json。 */
  toolCredentialStore?: {
    get: (scope: string) => Promise<string | null>
    set: (scope: string, secret: string | null) => Promise<void>
  }
}

export class SettingsServiceImpl
  extends ConnectionService<SettingsService>
  implements IConnectionService<SettingsService>
{
  private readonly deps: SettingsServiceDeps
  private lastAppliedWindowsTitleBarTheme: WindowsTitleBarTheme | null = null
  private nativeThemeListenerInstalled = false
  /** 启用了 titleBarOverlay 的窗口（当前只有主窗口）：nativeTheme 变化时只更新这些窗口，
   *  避免对启动画面等无 overlay 的窗口调 setTitleBarOverlay 抛 "Titlebar overlay is not enabled"。 */
  private readonly titleBarOverlayWindows = new Set<BrowserWindow>()

  public constructor(deps: SettingsServiceDeps) {
    super(SettingsServiceName)
    this.deps = deps
  }

  /** 登记启用 titleBarOverlay 的窗口（主窗口创建时调用；重建/关闭时替换或自动移除）。 */
  public trackTitleBarOverlayWindow(window: BrowserWindow | null): void {
    this.titleBarOverlayWindows.clear()
    if (window && !window.isDestroyed()) {
      this.titleBarOverlayWindows.add(window)
      window.once("closed", () => this.titleBarOverlayWindows.delete(window))
    }
  }

  private readonly handleNativeThemeUpdated = (): void => {
    this.applyWindowsTitleBarOverlay()
  }

  /** 从持久化读取当前设置（含默认值兜底）。 */
  public current(): AppSettings {
    const persisted = this.deps.store.read()
    const themeSource: ThemeSource =
      persisted.themeSource === "light" || persisted.themeSource === "dark"
        ? persisted.themeSource
        : DEFAULT_APP_SETTINGS.themeSource
    const completionNotificationCondition: CompletionNotificationCondition =
      persisted.completionNotificationCondition === "never" ||
      persisted.completionNotificationCondition === "background" ||
      persisted.completionNotificationCondition === "always"
        ? persisted.completionNotificationCondition
        : DEFAULT_APP_SETTINGS.completionNotificationCondition
    return {
      autoMemoryReview: booleanSetting(persisted.autoMemoryReview, DEFAULT_APP_SETTINGS.autoMemoryReview),
      autoMemoryReviewInterval: numberSetting(
        persisted.autoMemoryReviewInterval,
        DEFAULT_APP_SETTINGS.autoMemoryReviewInterval,
      ),
      browserEnabled: booleanSetting(persisted.browserEnabled, DEFAULT_APP_SETTINGS.browserEnabled),
      completionNotificationCondition,
      dataDirectory: app.getPath("userData"),
      dataDirectoryDefault: defaultDataDirectory(),
      knowledgeBaseBetaEnabled: booleanSetting(
        persisted.knowledgeBaseBetaEnabled,
        DEFAULT_APP_SETTINGS.knowledgeBaseBetaEnabled,
      ),
      notificationSoundEnabled: booleanSetting(
        persisted.notificationSoundEnabled,
        DEFAULT_APP_SETTINGS.notificationSoundEnabled,
      ),
      operatingMode:
        persisted.operatingMode === "self-managed" || persisted.operatingMode === "unselected"
          ? persisted.operatingMode
          : DEFAULT_APP_SETTINGS.operatingMode,
      persona: persisted.persona === "work" || persisted.persona === "code" ? persisted.persona : "work",
      selfManagedSetupDismissed: booleanSetting(
        persisted.selfManagedSetupDismissed,
        DEFAULT_APP_SETTINGS.selfManagedSetupDismissed,
      ),
      subagentModelId: validSubagentModelChoice(persisted.subagentModelId),
      subagentReasoningLevel: validSubagentReasoningLevel(persisted.subagentReasoningLevel),
      exploreModelId: validSubagentModelChoice(persisted.exploreModelId),
      exploreReasoningLevel: validSubagentReasoningLevel(persisted.exploreReasoningLevel),
      generationConfig: persisted.generationConfig
        ? {
            apiBase: persisted.generationConfig.apiBase?.trim() || "",
            modelName: persisted.generationConfig.modelName?.trim() || "",
            ...(persisted.generationConfig.videoModelName
              ? { videoModelName: persisted.generationConfig.videoModelName.trim() }
              : {}),
            enabled: persisted.generationConfig.enabled !== false,
          }
        : null,
      searchConfig: persisted.searchConfig
        ? {
            provider: (["tavily", "exa", "brave", "serper"] as const).includes(
              persisted.searchConfig.provider as SearchConfig["provider"],
            )
              ? (persisted.searchConfig.provider as SearchConfig["provider"])
              : "tavily",
            enabled: persisted.searchConfig.enabled !== false,
          }
        : null,
      themeSource,
      unreadBadgeEnabled: booleanSetting(persisted.unreadBadgeEnabled, DEFAULT_APP_SETTINGS.unreadBadgeEnabled),
    }
  }

  public getSettings(): Promise<AppSettings> {
    return Promise.resolve(this.current())
  }

  /** 启动时把持久化的 themeSource 应用到 nativeTheme（窗口背景一致）。 */
  public applyStartupTheme(): void {
    nativeTheme.themeSource = this.current().themeSource
    this.installNativeThemeListener()
    this.applyWindowsTitleBarOverlay()
  }

  public setThemeSource(source: ThemeSource): Promise<void> {
    nativeTheme.themeSource = source
    this.applyWindowsTitleBarOverlay()
    this.deps.store.write({ ...this.deps.store.read(), themeSource: source })
    return Promise.resolve()
  }

  public setBrowserEnabled(enabled: boolean): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), browserEnabled: enabled })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setPersona(persona: Persona): Promise<void> {
    const normalized: Persona = persona === "work" || persona === "code" ? persona : DEFAULT_APP_SETTINGS.persona
    this.deps.store.write({ ...this.deps.store.read(), persona: normalized })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setAutoMemoryReview(enabled: boolean): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), autoMemoryReview: enabled })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setAutoMemoryReviewInterval(interval: number): Promise<void> {
    const normalized = Math.min(Math.max(Math.trunc(interval) || 1, 1), 50)
    this.deps.store.write({ ...this.deps.store.read(), autoMemoryReviewInterval: normalized })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setKnowledgeBaseBetaEnabled(enabled: boolean): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), knowledgeBaseBetaEnabled: enabled })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setCompletionNotificationCondition(condition: CompletionNotificationCondition): Promise<void> {
    const normalized: CompletionNotificationCondition =
      condition === "never" || condition === "background" || condition === "always"
        ? condition
        : DEFAULT_APP_SETTINGS.completionNotificationCondition
    this.deps.store.write({ ...this.deps.store.read(), completionNotificationCondition: normalized })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setNotificationSoundEnabled(enabled: boolean): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), notificationSoundEnabled: enabled })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setOperatingMode(mode: OperatingMode): Promise<void> {
    if (mode !== "self-managed" && mode !== "unselected") {
      return Promise.reject(new Error("Unsupported operating mode."))
    }
    this.deps.store.write({ ...this.deps.store.read(), operatingMode: mode })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setSelfManagedSetupDismissed(dismissed: boolean): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), selfManagedSetupDismissed: dismissed })
    this.settingsChanged()
    return Promise.resolve()
  }

  public setUnreadBadgeEnabled(enabled: boolean): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), unreadBadgeEnabled: enabled })
    this.settingsChanged()
    return Promise.resolve()
  }

  /** 把数据根目录迁移到新位置：复制现有数据并记录路径，重启后生效（见 data-directory.ts）。 */
  public async setDataDirectory(targetPath: string): Promise<void> {
    const target = validateDataDirectoryTarget(targetPath)
    const source = app.getPath("userData")
    await migrateUserDataDirectory(source, target)
    writeDataDirectoryRecord(target)
    this.deps.store.write({ ...this.deps.store.read(), dataDirectory: target })
    this.settingsChanged()
  }

  /** 设置子代智能体使用的模型（null = 跟随主模型），重启 agent 后生效。 */
  public setSubagentModelId(modelId: SubagentModelChoice | null): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), subagentModelId: validSubagentModelChoice(modelId) })
    this.settingsChanged()
    return Promise.resolve()
  }

  /** 设置子代智能体推理强度（null = 跟随主会话），重启 agent 后生效。 */
  public setSubagentReasoningLevel(level: DWeisReasoningLevel | null): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), subagentReasoningLevel: validSubagentReasoningLevel(level) })
    this.settingsChanged()
    return Promise.resolve()
  }

  /** 设置只读探索子代理使用的模型（null = 跟随主模型），重启 agent 后生效。 */
  public setExploreModelId(modelId: SubagentModelChoice | null): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), exploreModelId: validSubagentModelChoice(modelId) })
    this.settingsChanged()
    return Promise.resolve()
  }

  /** 设置只读探索子代理推理强度（null = 跟随主会话），重启 agent 后生效。 */
  public setExploreReasoningLevel(level: DWeisReasoningLevel | null): Promise<void> {
    this.deps.store.write({ ...this.deps.store.read(), exploreReasoningLevel: validSubagentReasoningLevel(level) })
    this.settingsChanged()
    return Promise.resolve()
  }

  /** 设置 AI 生成（图片/视频）工具配置（apiKey 走 setToolSecret）。 */
  public setGenerationConfig(config: GenerationConfig | null): Promise<void> {
    this.deps.store.write({
      ...this.deps.store.read(),
      generationConfig: config
        ? {
            apiBase: config.apiBase,
            modelName: config.modelName,
            ...(config.videoModelName ? { videoModelName: config.videoModelName } : {}),
            enabled: config.enabled,
          }
        : null,
    })
    this.settingsChanged()
    return Promise.resolve()
  }

  /** 设置网页搜索工具配置（apiKey 走 setToolSecret）。 */
  public setSearchConfig(config: SearchConfig | null): Promise<void> {
    this.deps.store.write({
      ...this.deps.store.read(),
      searchConfig: config ? { provider: config.provider, enabled: config.enabled } : null,
    })
    this.settingsChanged()
    return Promise.resolve()
  }

  /** 保存工具密钥（safeStorage 密文）；null 清除。 */
  public async setToolSecret(scope: "generation" | "search", secret: string | null): Promise<void> {
    await this.deps.toolCredentialStore?.set(scope, secret)
  }

  /** 读取工具密钥明文（设置页回显用）。 */
  public async getToolSecret(scope: "generation" | "search"): Promise<string | null> {
    return (await this.deps.toolCredentialStore?.get(scope)) ?? null
  }

  public override dispose(): void {
    nativeTheme.off("updated", this.handleNativeThemeUpdated)
    this.nativeThemeListenerInstalled = false
    super.dispose()
  }

  private installNativeThemeListener(): void {
    if (this.nativeThemeListenerInstalled) {
      return
    }

    nativeTheme.on("updated", this.handleNativeThemeUpdated)
    this.nativeThemeListenerInstalled = true
  }

  private settingsChanged(): void {
    const settings = this.current()
    void this.send("settingsChanged", settings).catch((error: unknown) => {
      console.warn("[dweis] settings broadcast failed:", error)
    })
    void Promise.resolve(this.deps.onSettingsChanged?.(settings)).catch((error: unknown) => {
      console.warn("[dweis] settings change handler failed:", error)
    })
  }

  private applyWindowsTitleBarOverlay(): void {
    if (process.platform !== "win32") {
      return
    }

    const windows = [...this.titleBarOverlayWindows].filter((window) => !window.isDestroyed())
    if (windows.length === 0) {
      return
    }

    const nextTheme = resolveWindowsTitleBarTheme(nativeTheme.shouldUseDarkColors)
    if (!shouldApplyWindowsTitleBarTheme(this.lastAppliedWindowsTitleBarTheme, nextTheme)) {
      return
    }

    const overlay = buildWindowsTitleBarOverlay(nextTheme)
    const material = nativeWindowMaterialForPlatform(process.platform)
    const backgroundColor = windowBackgroundColorForMaterial(nextTheme, material)
    for (const window of windows) {
      window.setBackgroundColor(backgroundColor)
      window.setTitleBarOverlay(overlay)
    }
    this.lastAppliedWindowsTitleBarTheme = nextTheme
  }
}

function booleanSetting(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

/** 正整数设置兜底：非法（非数/非整数/越界）回落默认值。 */
function numberSetting(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 50) {
    return fallback
  }
  return value
}

/** 校验子代智能体模型选择；非法值回落为 null（跟随主模型）。 */
function validSubagentModelChoice(
  value: { kind?: string; id?: string } | null | undefined,
): SubagentModelChoice | null {
  if (value && value.kind === "custom" && typeof value.id === "string" && value.id) {
    return { kind: "custom", id: value.id }
  }
  return null
}

/** 校验子代智能体推理强度；非法值回落为 null（跟随主会话）。 */
function validSubagentReasoningLevel(value: unknown): DWeisReasoningLevel | null {
  return DWEIS_REASONING_LEVELS.includes(value as DWeisReasoningLevel) ? (value as DWeisReasoningLevel) : null
}
