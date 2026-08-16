import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { logStoreReadFailure } from "../store-diagnostics.ts"

export interface PersistedSettings {
  themeSource?: string
  /** 内置浏览器是否可用；缺失时默认开启。 */
  browserEnabled?: boolean
  /** 完成通知显示条件；缺失时仅在应用后台显示。 */
  completionNotificationCondition?: string
  /** 原生完成通知是否允许播放系统声音；缺失时默认开启。 */
  notificationSoundEnabled?: boolean
  /** 支持的平台是否在应用图标显示未读任务数；缺失时默认开启。 */
  unreadBadgeEnabled?: boolean
  /** 知识库仍为 Beta 功能；缺失或非 true 时默认关闭。 */
  knowledgeBaseBetaEnabled?: boolean
  /** Active runtime profile; "unselected" records an intentional return to the welcome chooser. */
  operatingMode?: string
  /** Whether the optional self-managed setup reminder was dismissed. */
  selfManagedSetupDismissed?: boolean
  /** 更新渠道（"stable" | "beta"）；缺失/非法按未设置处理（见 update/channel.ts）。 */
  updateChannel?: string
  /** 数据根目录（绝对路径）；缺失时使用默认 ~/DWeisNext（见 data-directory.ts）。 */
  dataDirectory?: string
  /** 子代智能体使用的模型（{kind, id}）；缺失时跟随主模型。 */
  subagentModelId?: { kind: "custom"; id: string } | null
  /** 子代智能体推理强度（"low"|"medium"|"high"|"max"）；缺失/null 时跟随主会话。 */
  subagentReasoningLevel?: string | null
  /** 只读探索子代理使用的模型；缺失时跟随主模型。 */
  exploreModelId?: { kind: "custom"; id: string } | null
  /** 只读探索子代理推理强度；缺失/null 时跟随主会话。 */
  exploreReasoningLevel?: string | null
  /** 自动记忆审查开关；缺失时默认开启。 */
  autoMemoryReview?: boolean
  /** 自动记忆审查间隔（轮数）；缺失时默认 10。 */
  autoMemoryReviewInterval?: number
  /** 人群模式（"work" | "code"）；缺失时默认 work。 */
  persona?: string
  /** AI 生成（图片/视频）工具配置；apiKey 单独存 ModelCredentialStore。 */
  generationConfig?: { apiBase?: string; modelName?: string; videoModelName?: string; enabled?: boolean } | null
  /** 网页搜索工具配置；apiKey 单独存 ModelCredentialStore。 */
  searchConfig?: { provider?: string; enabled?: boolean } | null
}

/** 设置持久化到 userData/settings.json。仅存非密配置（主题、通知、Beta 开关等），不存凭证（R8）。 */
export class SettingsStore {
  private readonly file: string

  public constructor(dir: string) {
    this.file = path.join(dir, "settings.json")
  }

  public read(): PersistedSettings {
    try {
      return JSON.parse(readFileSync(this.file, "utf-8")) as PersistedSettings
    } catch (error) {
      logStoreReadFailure("settings", this.file, error)
      return {}
    }
  }

  /** 原子写（tmp + rename，对齐 auth.json）：updateChannel 决定更新源，截断损坏会静默回落 stable。 */
  public write(settings: PersistedSettings): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp-${process.pid}`
    try {
      // mode 0600：settings.json 可能含工具密钥等敏感配置，仅当前用户可读写。
      writeFileSync(tmp, JSON.stringify(settings, null, 2), { encoding: "utf-8", mode: 0o600 })
      renameSync(tmp, this.file)
    } catch (error) {
      rmSync(tmp, { force: true })
      throw error
    }
  }
}
