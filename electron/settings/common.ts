import type { DWeisReasoningLevel } from "../agent/reasoning.ts"
import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

export type ThemeSource = "system" | "light" | "dark"
export type CompletionNotificationCondition = "never" | "background" | "always"
export type OperatingMode = "self-managed" | "unselected"
/** 人群模式：work=办公（文档/信息搜集/对话导向），code=编码导向。 */
export type Persona = "work" | "code"

/** 子代智能体模型选择（本地自定义模型）。 */
export type SubagentModelChoice = { kind: "custom"; id: string }

/** AI 生成（图片/视频）工具配置：用户自定义生成模型（OpenAI 兼容 images API）。apiKey 不落 settings.json，走 ModelCredentialStore（safeStorage 密文）。 */
export interface GenerationConfig {
  apiBase: string
  modelName: string
  /** 视频生成模型（可选；支持视频生成的 API 时使用）。 */
  videoModelName?: string
  enabled: boolean
}

/** 网页搜索工具配置：第三方搜索 provider（apiKey 走 ModelCredentialStore）。 */
export interface SearchConfig {
  provider: "tavily" | "exa" | "brave" | "serper"
  enabled: boolean
}

export interface AppSettings {
  browserEnabled: boolean
  completionNotificationCondition: CompletionNotificationCondition
  themeSource: ThemeSource
  knowledgeBaseBetaEnabled: boolean
  notificationSoundEnabled: boolean
  operatingMode: OperatingMode | null
  selfManagedSetupDismissed: boolean
  unreadBadgeEnabled: boolean
  /** 当前生效的数据根目录（绝对路径，见 data-directory.ts）。 */
  dataDirectory: string | null
  /** 数据根目录默认值（用户主目录/DWeisNext，只读派生，见 data-directory.ts）。 */
  dataDirectoryDefault: string
  /** 子代智能体（general subagent）使用的模型；null 表示跟随主模型。 */
  subagentModelId: SubagentModelChoice | null
  /** 子代智能体推理强度；null 表示跟随主会话（subagent 配独立模型时生效）。 */
  subagentReasoningLevel: DWeisReasoningLevel | null
  /** 只读探索子代理（explore subagent）使用的模型；null 表示跟随主模型。 */
  exploreModelId: SubagentModelChoice | null
  /** 只读探索子代理推理强度；null 表示跟随主会话。 */
  exploreReasoningLevel: DWeisReasoningLevel | null
  /** 自动记忆审查：每完成 N 轮对话，后台审查是否值得写入 MEMORY.md。 */
  autoMemoryReview: boolean
  /** 自动记忆审查间隔（轮数，1–50）。 */
  autoMemoryReviewInterval: number
  /** 人群模式：work=办公人设（默认），code=编码人设。 */
  persona: Persona
  /** AI 生成（图片/视频）工具配置；null 表示未配置（agent 无生成工具）。apiKey 存 ModelCredentialStore。 */
  generationConfig: GenerationConfig | null
  /** 网页搜索工具配置；null 表示未配置（agent 用默认 webfetch）。apiKey 存 ModelCredentialStore。 */
  searchConfig: SearchConfig | null
}

/** 对齐 Codex：仅后台完成通知，通知声音与应用图标未读红标默认开启。 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  browserEnabled: true,
  completionNotificationCondition: "background",
  knowledgeBaseBetaEnabled: false,
  notificationSoundEnabled: true,
  operatingMode: "self-managed" as OperatingMode,
  selfManagedSetupDismissed: false,
  themeSource: "system",
  unreadBadgeEnabled: true,
  dataDirectory: null,
  dataDirectoryDefault: "",
  subagentModelId: null,
  subagentReasoningLevel: null,
  exploreModelId: null,
  exploreReasoningLevel: null,
  autoMemoryReview: true,
  autoMemoryReviewInterval: 10,
  persona: "work",
  generationConfig: null,
  searchConfig: null,
}

export type SettingsService = typeof SettingsService
export const SettingsService = serviceName("settings-service") as ServiceName<{
  ServerEvents: {
    settingsChanged: AppSettings
  }
  ClientInvokes: {
    getSettings(): Promise<AppSettings>
    /** 同步 Electron nativeTheme.themeSource。 */
    setThemeSource(source: ThemeSource): Promise<void>
    setBrowserEnabled(enabled: boolean): Promise<void>
    setKnowledgeBaseBetaEnabled(enabled: boolean): Promise<void>
    setCompletionNotificationCondition(condition: CompletionNotificationCondition): Promise<void>
    setNotificationSoundEnabled(enabled: boolean): Promise<void>
    setOperatingMode(mode: OperatingMode): Promise<void>
    setSelfManagedSetupDismissed(dismissed: boolean): Promise<void>
    setUnreadBadgeEnabled(enabled: boolean): Promise<void>
    /** 把数据根目录迁移到新位置（复制现有数据），重启后生效。 */
    setDataDirectory(path: string): Promise<void>
    /** 设置子代智能体使用的模型；null 表示跟随主模型。 */
    setSubagentModelId(modelId: SubagentModelChoice | null): Promise<void>
    /** 设置子代智能体推理强度；null 表示跟随主会话。 */
    setSubagentReasoningLevel(level: DWeisReasoningLevel | null): Promise<void>
    /** 设置只读探索子代理使用的模型；null 表示跟随主模型。 */
    setExploreModelId(modelId: SubagentModelChoice | null): Promise<void>
    /** 设置只读探索子代理推理强度；null 表示跟随主会话。 */
    setExploreReasoningLevel(level: DWeisReasoningLevel | null): Promise<void>
    /** 设置 AI 生成（图片/视频）工具配置；null 关闭。apiKey 经 setToolSecret 单独保存。 */
    setGenerationConfig(config: GenerationConfig | null): Promise<void>
    /** 设置网页搜索工具配置；null 关闭。apiKey 经 setToolSecret 单独保存。 */
    setSearchConfig(config: SearchConfig | null): Promise<void>
    /** 保存工具密钥（generation 图片/视频 API key、search 搜索 token），safeStorage 密文落盘。 */
    setToolSecret(scope: "generation" | "search", secret: string | null): Promise<void>
    /** 读取工具密钥明文（仅设置页回显用，一次一读不缓存）。 */
    getToolSecret(scope: "generation" | "search"): Promise<string | null>
    /** 自动记忆审查开关。 */
    setAutoMemoryReview(enabled: boolean): Promise<void>
    /** 自动记忆审查间隔（轮数）。 */
    setAutoMemoryReviewInterval(interval: number): Promise<void>
    /** 设置人群模式（work=办公 / code=编码）。 */
    setPersona(persona: Persona): Promise<void>
  }
}>
