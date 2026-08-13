import type {
  AgentMode,
  ChatAttachment,
  ChatMessage,
  ChatPermissionReply,
  ChatPermissionRequest,
  ChatQuestionRequest,
  CustomCommand,
  ReasoningLevel,
} from "../chat/common.ts"
import type { ModelChoice } from "../models/common.ts"
import type { RuntimeCustomModel } from "../models/store.ts"
import type { LinkRuntime, ModelAccess } from "../runtime/agent-runtime.ts"
import type { SubagentModelChoice } from "../settings/common.ts"
import type { Persona } from "../settings/common.ts"
import type { GenerateSessionTitleRequest, SessionInfo } from "../session/common.ts"
import type { GeneratedSessionTitle } from "./session-title-generator.ts"
import type { Config, FilePartInput, SessionPromptAsyncData, TextPartInput } from "@opencode-ai/sdk/v2/client"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"

import { randomBytes } from "node:crypto"
import { access, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { ActivityMetrics } from "../activity-metrics.ts"
import { atomicWriteText } from "../atomic-file.ts"
import { branding } from "../branding.ts"
import { resolveUserCommandPath } from "../command-path.ts"
import { logDiagnostic } from "../diagnostics-log.ts"
import { connectorBaseUrl, llmBaseUrl } from "../domain.ts"
import { DEFAULT_BUILTIN_MODEL_ID, isBuiltinModelId, resolveBuiltinModel } from "../models/builtin.ts"
import { planAttachmentInputs } from "./attachment-input.ts"
import { buildOpencodeConfig, customProviderId, DWEIS_MODEL_ID, DWEIS_PROVIDER_ID } from "./config.ts"
import { normalizeMessage, normalizePermissionRequest, normalizeQuestionRequest } from "./event-translator.ts"
import { normalizeDWeisAgentMode, DWEIS_BUILD_AGENT_NAME } from "./mode.ts"
import { buildDWeisPersonaSystem } from "./system-prompt.ts"
import { writeOoIdentitySettings } from "./oo-identity.ts"
import { buildAgentLinkEnv } from "./oo.ts"
import { managedPythonEnvironmentPath, managedPythonExecutable } from "./python-environment.ts"
import type { DWeisReasoningVariant } from "./reasoning.ts"
import { DWEIS_REASONING_VARIANT_LEVELS, opencodeReasoningVariant } from "./reasoning.ts"
import { generateSessionTitle as generateTitle } from "./session-title-generator.ts"
import { OpencodeSidecar } from "./sidecar.ts"
import { ensureWikiGraphCommandBin } from "./wikigraph-bin.ts"
import { ensureAgentWorkspace } from "./workspace.ts"

export type { GeneratedSessionTitle } from "./session-title-generator.ts"

export interface AgentManagerOptions {
  browserControl?: () => Promise<AgentBrowserControlConnection | undefined>
  linkRuntime: LinkRuntime | null
  modelAccess: ModelAccess
  /** opencode 二进制绝对路径。 */
  opencodeBinPath: string
  /** The oo binary is resolved and injected only when a Link runtime is configured. */
  ooBinPath?: string
  /** DWeis-owned WikiGraph CLI entrypoint used by the sidecar PATH `wg` shim. */
  wikiGraphCliPath?: string
  wikiGraphStateDir?: string
  listOpenConnectorAuthorizedServices?: (signal?: AbortSignal) => Promise<string[]>
  /** 内置 skill 源目录（resources/skills 或打包 Resources/skills）；启动时拷进 .opencode/skill/。 */
  bundledSkillsDir?: string
  /** 构建期合并的自定义工具 runtime；启动时拷进 .opencode/runtime/tool.js。 */
  bundledToolRuntimePath?: string
  /** App 私有根目录（userData 下）：workspace / oo-store / isolation 都在其下。 */
  rootDir: string
  /** 自定义 OpenAI-compatible 模型配置。apiKey 只进入 sidecar env config，不落到 OpenCode 文件。 */
  customModels?: RuntimeCustomModel[]
  /** sidecar 启动默认模型；本地 runtime 必须解析为 custom model。 */
  defaultModel?: ModelChoice
  /** 子代智能体（general subagent）使用的模型；缺省时跟随默认模型。 */
  subagentModel?: SubagentModelChoice
  /** 子代智能体推理强度（variant）；仅 subagent 配独立模型时生效。 */
  subagentReasoningVariant?: DWeisReasoningVariant
  /** 只读探索子代理（explore subagent）使用的模型；缺省时跟随默认模型。 */
  exploreModel?: SubagentModelChoice
  /** 只读探索子代理推理强度（variant）。 */
  exploreReasoningVariant?: DWeisReasoningVariant
  /** 用户配置的工具（AI 生成 / 网页搜索）：注入 sidecar env 指向配置文件。 */
  toolConfig?: AgentToolConfig
  /** MCP server 配置（opencode 原生格式），缺省时不注入。 */
  mcpServers?: Config["mcp"]
  /** 持久记忆文件目录（userData 根）：MEMORY.md / USER.md 每轮注入 system prompt，记忆工具经 DWEIS_MEMORY_DIR 读写。 */
  memoryDir?: string
  /** 关闭 sidecar Basic Auth（默认开，随机口令）。 */
  disableServerAuth?: boolean
  /** 人群模式（work=办公 / code=编码）；缺省 work。每轮经 body.system 热注入人设段。 */
  persona?: Persona
}

export interface AgentBrowserControlConnection {
  token: string
  url: string
}

function normalizeTeamName(teamName: string | undefined): string | undefined {
  const normalized = teamName?.trim()
  return normalized ? normalized : undefined
}

function requireOoBinPath(ooBinPath: string | undefined): string {
  if (!ooBinPath) throw new Error("The Link runtime requires the oo binary path.")
  return ooBinPath
}

function normalizeKnowledgeBaseIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function sameStringArray(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (!left) return right.length === 0
  return left.length === right.length && left.every((item, index) => item === right[index])
}

export function buildManagedSkillRuntimeEnv(nodeBin: string = process.execPath): Record<string, string> {
  return {
    ELECTRON_RUN_AS_NODE: "1",
    DWEIS_NODE_BIN: nodeBin,
  }
}

export interface AgentToolConfig {
  /** 工具配置文件路径（DWeis userData/tool-config.json，权限 600）：工具运行时读取，热加入无需重启。 */
  toolsConfigPath?: string
}

/** 当前轮产物目录标记文件：主进程每轮写入 {artifactDir}，sidecar 的 generate_image 工具经
 * DWEIS_TURN_ARTIFACT_PATH 读取，模型不传 outputPath 时默认写当前轮目录（全局单 sidecar、轮次串行）。 */
export function turnArtifactMarkerPath(storeDir: string): string {
  return path.join(storeDir, "turn-artifact-dir.json")
}

export interface AgentSidecarEnvOptions {
  browserControl?: AgentBrowserControlConnection
  commandPath: string
  linkRuntime: LinkRuntime | null
  /** 持久记忆目录：memory 工具经此定位 MEMORY.md / USER.md。 */
  memoryDir?: string
  ooBinPath?: string
  storeDir: string
  teamName?: string
  teamScopePath: string
  /** 用户配置的工具（AI 生成 / 网页搜索）：注入 sidecar env 指向配置文件。 */
  toolConfig?: AgentToolConfig
}

export function buildAgentSidecarEnv({
  browserControl,
  commandPath,
  linkRuntime,
  memoryDir,
  ooBinPath,
  storeDir,
  teamName,
  teamScopePath,
  toolConfig,
}: AgentSidecarEnvOptions): Record<string, string> {
  const ooEnv = linkRuntime
    ? buildAgentLinkEnv({
        linkRuntime,
        teamName,
        teamScopePath,
        storeDir,
        ooBinPath: requireOoBinPath(ooBinPath),
      })
    : { DWEIS_TEAM_SCOPE_PATH: teamScopePath }
  return {
    ...ooEnv,
    ...buildManagedSkillRuntimeEnv(),
    PATH: commandPath,
    DWEIS_BROWSER_CONTROL_TOKEN: browserControl?.token ?? "",
    DWEIS_BROWSER_CONTROL_URL: browserControl?.url ?? "",
    DWEIS_MEMORY_DIR: memoryDir ?? "",
    // 工具配置：AI 生成（图片/视频）与网页搜索（工具源码每次调用读配置文件，热加入无需重启）。
    ...(toolConfig?.toolsConfigPath ? { DWEIS_TOOLS_CONFIG_PATH: toolConfig.toolsConfigPath } : {}),
    // 当前轮产物目录标记：generate_image 默认输出写当前轮目录（模型不传 outputPath 时）。
    DWEIS_TURN_ARTIFACT_PATH: turnArtifactMarkerPath(storeDir),
  }
}

export interface TeamScopePersistenceOptions {
  currentName: string | undefined
  nextName: string | undefined
  writeScope: (teamName: string | undefined) => Promise<void>
}

export async function persistTeamScopeUpdate({
  currentName,
  nextName,
  writeScope,
}: TeamScopePersistenceOptions): Promise<void> {
  try {
    await writeScope(nextName)
  } catch (error) {
    try {
      await writeScope(currentName)
    } catch (rollbackError) {
      console.warn("[dweis] failed to rollback agent team scope:", rollbackError)
      logDiagnostic(
        "agent",
        "failed to rollback agent team scope",
        { error: rollbackError, teamName: currentName },
        "warn",
      )
      throw new AggregateError([error, rollbackError], "Failed to persist and rollback agent team scope.")
    }
    throw error
  }
}

export interface SendMessageResult {
  sessionId: string
  messages: unknown
}

interface OpencodeResult<T = unknown> {
  data?: T
  error?: unknown
}

function opencodeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** OpenCode SDK 默认不 throw，而是返回 `{ error }`；所有调用统一在边界转成异常。 */
function assertOpencodeSuccess<T>(result: OpencodeResult<T>, operation: string): asserts result is { data?: T } {
  if (result.error !== undefined) {
    throw new Error(`${operation} failed: ${opencodeErrorMessage(result.error)}`)
  }
}

export interface PromptStreamingOptions {
  system?: string
  /** 稳定段（团队技能/权限规则等，会话内不随轮次变化）——前置以最大化前缀缓存命中。 */
  stableSystem?: string
  attachments?: ChatAttachment[]
  mode?: AgentMode
  model?: ModelChoice
  teamName?: string
  reasoningLevel?: ReasoningLevel
  artifactDir?: string
  outputProjectRoot?: string
  processDir?: string
  messageId?: string
  signal?: AbortSignal
}

export type AgentEventConnectionStatus =
  | { status: "reconnecting"; attempt: number; maxAttempts: number; message?: string }
  | { status: "reconnected"; attempt: number; maxAttempts: number; message?: string }
  | { status: "failed"; attempt: number; maxAttempts: number; message?: string }
  | { status: "runtime_restarting"; attempt: number; maxAttempts: number; message?: string }
  | { status: "runtime_recovered"; attempt: number; maxAttempts: number; message?: string }
  | { status: "runtime_failed"; attempt: number; maxAttempts: number; message?: string }

export interface RawSession {
  id: string
  title?: string
  parentID?: string
  parentId?: string
  parent_id?: string
  time?: { created?: number; updated?: number }
}

const eventStreamMaxReconnectAttempts = 5
const eventStreamRestartInitialDelayMs = 500
const eventStreamRestartMaxDelayMs = 5_000
const runtimeRestartMaxAttempts = 5
const runtimeRestartInitialDelayMs = 1_000
const runtimeRestartMaxDelayMs = 10_000
const authorizedServicesCacheTtlMs = 30_000
const authorizedServicesPromptBudgetMs = 750
const structuredParseTimeoutMs = 90_000
const structuredParsePollMs = 300

interface AgentEventSubscriber {
  onEvent: (event: { type: string; data?: Record<string, unknown>; properties?: Record<string, unknown> }) => void
  onConnectionStatus?: (status: AgentEventConnectionStatus) => void
}

function toSessionInfo(session: RawSession): SessionInfo {
  return {
    id: session.id,
    title: session.title ?? "新会话",
    createdAt: session.time?.created ?? 0,
    updatedAt: session.time?.updated ?? session.time?.created ?? 0,
  }
}

export function isUserVisibleSession(session: RawSession): boolean {
  return !(session.parentID || session.parentId || session.parent_id)
}

/** Agent 内核管理器：编排 OpenCode sidecar + 非编码 agent + 自定义连接器工具。electron-free，便于 headless 测试。 */
export class AgentManager {
  private options: AgentManagerOptions
  private sidecar: OpencodeSidecar | null = null
  // 启动中（尚未就绪、还没赋给 sidecar）的实例：它已 spawn opencode，dispose 必须能回收它，
  // 否则"启动期间退出/重启"会漏掉这个正在拉起的 opencode，形成新的残留孤儿。
  private startingSidecar: OpencodeSidecar | null = null
  private eventStreamAbort: AbortController | null = null
  private eventSubscriber: AgentEventSubscriber | null = null
  private eventLoopRestartFailures = 0
  private disposed = false
  private runtimeRecovery: Promise<void> | null = null
  private started = false
  private eventLoopStopped = false
  private teamName: string | undefined
  private teamScopePath: string | undefined
  private teamUpdateChain: Promise<void> = Promise.resolve()
  private sessionTeamNames = new Map<string, string>()
  private sessionKnowledgeBaseIds = new Map<string, string[]>()
  private authorizedServicesCache = new Map<string, { loadedAt: number; services: string[] }>()
  private authorizedServicesLoadControllers = new Map<string, AbortController>()
  private authorizedServicesLoads = new Map<string, Promise<string[]>>()
  private persona: Persona = "work"
  private readonly eventMetrics = new ActivityMetrics((snapshot) => {
    logDiagnostic("performance", "opencode event activity", { ...snapshot }, "trace")
  })

  public constructor(options: AgentManagerOptions) {
    this.options = options
    this.persona = options.persona ?? "work"
    this.teamName = options.linkRuntime?.kind === "oomol" ? normalizeTeamName(options.linkRuntime.teamName) : undefined
  }

  /**
   * 模型配置变更后即时同步内存快照（不必等 sidecar 重启生效）。
   * 避免"刚添加/删除/切换模型，resolveModel 仍用旧列表 → Selected custom model is no longer available"；
   * opencode 侧 provider 配置在重启（agentRefreshScheduler）后刷新。
   */
  public updateCustomModels(customModels: RuntimeCustomModel[]): void {
    this.options.customModels = customModels
  }

  public get client(): OpencodeClient {
    if (!this.sidecar) {
      throw new Error("AgentManager not started")
    }
    return this.sidecar.client
  }

  public get url(): string {
    return this.sidecar?.url ?? ""
  }

  public isReady(): boolean {
    return this.started
  }

  /** 热切换人群模式：下一轮 promptStreaming 起按新 persona 注入人设段，无需重启 sidecar。 */
  public setPersona(persona: Persona): void {
    if (persona === this.persona) {
      return
    }
    this.persona = persona
    logDiagnostic("agent", "persona changed", { persona }, "info")
  }

  /** 更新 Link 工具使用的团队工作区，不重启 sidecar，避免刷新会话列表。 */
  public async setTeamName(teamName?: string): Promise<void> {
    const nextTeamName = normalizeTeamName(teamName)
    await this.queueTeamUpdate(async () => {
      if (nextTeamName === this.teamName) {
        return
      }
      const previousTeamName = this.teamName
      await persistTeamScopeUpdate({
        currentName: previousTeamName,
        nextName: nextTeamName,
        writeScope: (name) => this.writeTeamState(name),
      })
      this.teamName = nextTeamName
    })
  }

  /** 记录单个 OpenCode session 的 Link 团队身份，供并发工具调用按 session 隔离读取。 */
  public async setSessionTeamName(sessionId: string, teamName?: string): Promise<void> {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) {
      throw new Error("Session id is required")
    }
    const nextTeamName = normalizeTeamName(teamName) ?? ""
    await this.queueTeamUpdate(async () => {
      if (this.sessionTeamNames.get(normalizedSessionId) === nextTeamName) {
        return
      }
      this.sessionTeamNames.set(normalizedSessionId, nextTeamName)
      await this.writeTeamScope(this.teamName)
    })
  }

  public async clearSessionTeamName(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) {
      return
    }
    await this.queueTeamUpdate(async () => {
      if (!this.sessionTeamNames.delete(normalizedSessionId)) {
        return
      }
      await this.writeTeamScope(this.teamName)
    })
  }

  /** 记录本轮选中的知识库；提示词按 OpenCode sessionID 注入对应 archive URI。 */
  public async setSessionKnowledgeBaseIds(sessionId: string, knowledgeBaseIds: readonly string[]): Promise<void> {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) throw new Error("Session id is required")
    const normalizedIds = normalizeKnowledgeBaseIds(knowledgeBaseIds)
    await this.queueTeamUpdate(async () => {
      if (sameStringArray(this.sessionKnowledgeBaseIds.get(normalizedSessionId), normalizedIds)) return
      if (normalizedIds.length > 0) this.sessionKnowledgeBaseIds.set(normalizedSessionId, normalizedIds)
      else this.sessionKnowledgeBaseIds.delete(normalizedSessionId)
      await this.writeTeamScope(this.teamName)
    })
  }

  public async clearSessionKnowledgeBaseIds(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) return
    await this.queueTeamUpdate(async () => {
      if (!this.sessionKnowledgeBaseIds.delete(normalizedSessionId)) return
      await this.writeTeamScope(this.teamName)
    })
  }

  /** task 子会话使用独立 sessionID，必须显式继承父会话选中的知识库。 */
  public async inheritSessionKnowledgeBaseIds(parentSessionId: string, childSessionId: string): Promise<void> {
    const normalizedParentId = parentSessionId.trim()
    const normalizedChildId = childSessionId.trim()
    if (!normalizedParentId || !normalizedChildId || normalizedParentId === normalizedChildId) return
    await this.queueTeamUpdate(async () => {
      const parentIds = this.sessionKnowledgeBaseIds.get(normalizedParentId) ?? []
      if (sameStringArray(this.sessionKnowledgeBaseIds.get(normalizedChildId), parentIds)) return
      if (parentIds.length > 0) this.sessionKnowledgeBaseIds.set(normalizedChildId, [...parentIds])
      else this.sessionKnowledgeBaseIds.delete(normalizedChildId)
      await this.writeTeamScope(this.teamName)
    })
  }

  public async removeKnowledgeBaseAccess(knowledgeBaseId: string): Promise<void> {
    const normalizedId = knowledgeBaseId.trim()
    if (!normalizedId) return
    await this.queueTeamUpdate(async () => {
      let changed = false
      for (const [sessionId, ids] of this.sessionKnowledgeBaseIds) {
        const next = ids.filter((id) => id !== normalizedId)
        if (next.length === ids.length) continue
        changed = true
        if (next.length > 0) this.sessionKnowledgeBaseIds.set(sessionId, next)
        else this.sessionKnowledgeBaseIds.delete(sessionId)
      }
      if (changed) await this.writeTeamScope(this.teamName)
    })
  }

  private async queueTeamUpdate(update: () => Promise<void>): Promise<void> {
    const task = this.teamUpdateChain.then(update, update)
    this.teamUpdateChain = task.catch((error: unknown) => {
      logDiagnostic("agent", "agent team scope update failed", { error }, "warn")
    })
    await task
  }

  public async start(): Promise<void> {
    this.disposed = false
    await this.prepareWorkspace()
    await this.startSidecar()
  }

  private async prepareWorkspace(): Promise<void> {
    const { bundledSkillsDir, bundledToolRuntimePath, rootDir } = this.options
    const workspaceDir = path.join(rootDir, "workspace")
    const teamScopePath = path.join(rootDir, "team-scope.json")

    await ensureAgentWorkspace(workspaceDir, bundledSkillsDir, bundledToolRuntimePath, {
      bundledOoSkills: this.options.linkRuntime?.kind === "oomol",
      connectors: this.options.linkRuntime !== null,
    })
    this.teamScopePath = teamScopePath
    await this.writeTeamState(this.teamName)
  }

  private async startSidecar(): Promise<void> {
    const {
      linkRuntime,
      modelAccess,
      opencodeBinPath,
      ooBinPath,
      rootDir,
      disableServerAuth,
      customModels,
      defaultModel,
      mcpServers,
      subagentModel,
      wikiGraphCliPath,
      wikiGraphStateDir,
    } = this.options
    const workspaceDir = path.join(rootDir, "workspace")
    const isolationDir = path.join(rootDir, "isolation")
    const storeDir = path.join(rootDir, "oo-store")
    const teamScopePath = this.teamScopePath ?? path.join(rootDir, "team-scope.json")

    const config = buildOpencodeConfig({
      customModels,
      defaultModel,
      mcpServers,
      subagentModel,
      subagentReasoningVariant: this.options.subagentReasoningVariant,
      exploreModel: this.options.exploreModel,
      exploreReasoningVariant: this.options.exploreReasoningVariant,
      linkRuntime,
      modelAccess,
    })
    const baseCommandPath = await resolveUserCommandPath({
      preferredDirectories: linkRuntime && ooBinPath ? [path.dirname(ooBinPath)] : [],
    })
    const wikiGraphBinDir =
      wikiGraphCliPath && wikiGraphStateDir
        ? await ensureWikiGraphCommandBin({
            binDir: path.join(rootDir, "bin"),
            nodeBin: process.execPath,
            stateDir: wikiGraphStateDir,
            wikiGraphCliPath,
          })
        : undefined
    const commandPath = wikiGraphBinDir ? `${wikiGraphBinDir}${path.delimiter}${baseCommandPath}` : baseCommandPath
    const browserControl = await this.options.browserControl?.()
    const env = buildAgentSidecarEnv({
      browserControl,
      commandPath,
      linkRuntime,
      memoryDir: this.options.memoryDir,
      ooBinPath,
      storeDir,
      teamName: this.teamName,
      teamScopePath,
      toolConfig: this.options.toolConfig,
    })

    const sidecar = new OpencodeSidecar({
      opencodeBinPath,
      workspaceDir,
      config,
      env,
      isolationDir,
      serverPassword: disableServerAuth ? undefined : randomBytes(24).toString("hex"),
      onExit: (info) => this.handleSidecarExit(info),
    })
    // 启动期间也要能被 dispose 回收（此实例已 spawn opencode）：先登记为 startingSidecar，
    // start 结束后再清掉。仅在 sidecar 完全就绪后才赋值 this.sidecar 并标记 ready，避免 client 在启动期被访问。
    this.startingSidecar = sidecar
    try {
      await sidecar.start()
    } finally {
      if (this.startingSidecar === sidecar) {
        this.startingSidecar = null
      }
    }
    // 启动过程中若已 dispose（退出/重启在启动期插入），此 sidecar 已拉起 opencode，就地回收后返回，
    // 绝不再赋值/标记 ready。OpencodeSidecar.dispose 幂等，与 dispose() 里对 startingSidecar 的回收互不冲突。
    if (this.disposed) {
      await sidecar.dispose()
      return
    }
    this.sidecar = sidecar
    this.started = true
  }

  private handleSidecarExit(info: { code?: number | null; error?: Error; signal?: NodeJS.Signals | null }): void {
    if (this.disposed) {
      return
    }
    this.started = false
    this.sidecar = null
    this.eventStreamAbort?.abort()
    this.eventStreamAbort = null
    const message = info.error
      ? info.error.message
      : `opencode serve exited${info.code === undefined ? "" : ` with code ${info.code}`}${
          info.signal ? ` (${info.signal})` : ""
        }`
    console.warn("[dweis] opencode sidecar exited unexpectedly:", message)
    this.runtimeRecovery ??= this.recoverRuntime(message).finally(() => {
      this.runtimeRecovery = null
    })
  }

  private async recoverRuntime(reason: string): Promise<void> {
    let lastMessage = reason
    for (let attempt = 1; attempt <= runtimeRestartMaxAttempts; attempt += 1) {
      if (this.disposed) {
        return
      }
      this.eventSubscriber?.onConnectionStatus?.({
        status: "runtime_restarting",
        attempt,
        maxAttempts: runtimeRestartMaxAttempts,
        message: lastMessage,
      })
      try {
        await this.prepareWorkspace()
        await this.startSidecar()
        this.eventSubscriber?.onConnectionStatus?.({
          status: "runtime_recovered",
          attempt,
          maxAttempts: runtimeRestartMaxAttempts,
        })
        this.restartEventLoop()
        return
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : String(error)
        console.warn("[dweis] opencode sidecar restart failed:", { attempt, error })
        if (attempt < runtimeRestartMaxAttempts) {
          await sleep(Math.min(runtimeRestartInitialDelayMs * 2 ** (attempt - 1), runtimeRestartMaxDelayMs))
        }
      }
    }
    this.eventSubscriber?.onConnectionStatus?.({
      status: "runtime_failed",
      attempt: runtimeRestartMaxAttempts,
      maxAttempts: runtimeRestartMaxAttempts,
      message: lastMessage,
    })
  }

  /** 订阅 OpenCode 全局 SSE 事件流。回调收到原始 OpenCode 事件 {type, properties}。返回停止函数。 */
  public subscribe(
    onEvent: (event: { type: string; data?: Record<string, unknown>; properties?: Record<string, unknown> }) => void,
    onConnectionStatus?: (status: AgentEventConnectionStatus) => void,
  ): () => void {
    this.eventLoopStopped = false
    this.eventSubscriber = { onEvent, onConnectionStatus }
    this.eventLoopRestartFailures = 0
    this.restartEventLoop()
    return () => {
      this.eventLoopStopped = true
      this.eventSubscriber = null
      this.eventStreamAbort?.abort()
      this.eventStreamAbort = null
    }
  }

  private restartEventLoop(): void {
    const subscriber = this.eventSubscriber
    if (!subscriber || this.eventLoopStopped || !this.started || this.disposed) {
      return
    }
    this.eventStreamAbort?.abort()
    const controller = new AbortController()
    this.eventStreamAbort = controller
    void this.runEventLoop(subscriber, controller)
  }

  private async runEventLoop(subscriber: AgentEventSubscriber, controller: AbortController): Promise<void> {
    let reconnectFailures = 0
    let reconnecting = false
    let reconnectFailedAnnounced = false
    let restartMessage = "OpenCode event stream disconnected; reconnecting."
    try {
      const subscription = await this.client.event.subscribe(undefined, {
        signal: controller.signal,
        onSseError: (error) => {
          if (this.eventLoopStopped || controller.signal.aborted) {
            return
          }
          reconnectFailures += 1
          reconnecting = true
          const message = error instanceof Error ? error.message : String(error)
          if (reconnectFailures <= eventStreamMaxReconnectAttempts) {
            subscriber.onConnectionStatus?.({
              status: "reconnecting",
              attempt: reconnectFailures,
              maxAttempts: eventStreamMaxReconnectAttempts,
              message,
            })
          }
          if (reconnectFailures >= eventStreamMaxReconnectAttempts && !reconnectFailedAnnounced) {
            reconnectFailedAnnounced = true
            subscriber.onConnectionStatus?.({
              status: "failed",
              attempt: reconnectFailures,
              maxAttempts: eventStreamMaxReconnectAttempts,
              message,
            })
          }
        },
        onSseEvent: () => {
          if ((!reconnecting && !reconnectFailedAnnounced) || this.eventLoopStopped || controller.signal.aborted) {
            return
          }
          subscriber.onConnectionStatus?.({
            status: "reconnected",
            attempt: reconnectFailures,
            maxAttempts: eventStreamMaxReconnectAttempts,
          })
          reconnectFailures = 0
          reconnecting = false
          reconnectFailedAnnounced = false
          this.eventLoopRestartFailures = 0
        },
      })
      const stream = (
        subscription as {
          stream: AsyncIterable<{ type: string; data?: Record<string, unknown>; properties?: Record<string, unknown> }>
        }
      ).stream
      for await (const event of stream) {
        if (this.eventLoopStopped) {
          break
        }
        this.eventLoopRestartFailures = 0
        // OpenCode 每十秒发送一次保活；它不承载业务状态，不应触发周期性诊断写盘。
        if (event.type !== "server.heartbeat") {
          this.eventMetrics.record(event.type)
        }
        try {
          subscriber.onEvent(event)
        } catch (error) {
          console.error("[dweis] opencode event handling failed:", error)
          logDiagnostic(
            "opencode-event-stream",
            "opencode event handling failed",
            {
              error,
              eventType: event.type,
            },
            "error",
          )
        }
      }
      if (!this.eventLoopStopped && !controller.signal.aborted) {
        console.warn("[dweis] opencode event stream ended without error")
        logDiagnostic("opencode-event-stream", "opencode event stream ended without error", {}, "warn")
      }
    } catch (error) {
      if (!this.eventLoopStopped && !controller.signal.aborted) {
        console.error("[dweis] opencode event stream ended:", error)
        logDiagnostic("opencode-event-stream", "opencode event stream ended", { error }, "error")
        restartMessage = error instanceof Error ? error.message : String(error)
      }
    } finally {
      const shouldRestart =
        this.eventStreamAbort === controller &&
        !this.eventLoopStopped &&
        !this.disposed &&
        this.started &&
        this.eventSubscriber === subscriber &&
        !controller.signal.aborted
      if (this.eventStreamAbort === controller) {
        this.eventStreamAbort = null
      }
      if (shouldRestart) {
        this.scheduleEventLoopRestart(subscriber, restartMessage)
      }
    }
  }

  private scheduleEventLoopRestart(subscriber: AgentEventSubscriber, message: string): void {
    const nextAttempt = this.eventLoopRestartFailures + 1
    if (nextAttempt > eventStreamMaxReconnectAttempts) {
      this.eventLoopRestartFailures = eventStreamMaxReconnectAttempts
      subscriber.onConnectionStatus?.({
        status: "failed",
        attempt: eventStreamMaxReconnectAttempts,
        maxAttempts: eventStreamMaxReconnectAttempts,
        message,
      })
      return
    }
    this.eventLoopRestartFailures = nextAttempt
    const delayMs = Math.min(
      eventStreamRestartInitialDelayMs * 2 ** Math.max(0, nextAttempt - 1),
      eventStreamRestartMaxDelayMs,
    )
    subscriber.onConnectionStatus?.({
      status: "reconnecting",
      attempt: nextAttempt,
      maxAttempts: eventStreamMaxReconnectAttempts,
      message,
    })
    const timer = setTimeout(() => {
      if (
        this.eventLoopStopped ||
        this.disposed ||
        !this.started ||
        this.eventSubscriber !== subscriber ||
        this.eventStreamAbort
      ) {
        return
      }
      this.restartEventLoop()
    }, delayMs)
    timer.unref?.()
  }

  public async listSessions(): Promise<SessionInfo[]> {
    if (!this.started) {
      return []
    }
    const result = await this.client.session.list()
    assertOpencodeSuccess(result, "session.list")
    const sessions = (result.data ?? []) as RawSession[]
    return sessions
      .filter(isUserVisibleSession)
      .map(toSessionInfo)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  public async createSession(title?: string): Promise<SessionInfo> {
    const result = await this.client.session.create(title ? { title } : {})
    assertOpencodeSuccess(result, "session.create")
    if (!result.data) throw new Error("session.create failed: no data")
    return toSessionInfo(result.data as RawSession)
  }

  public async renameSession(id: string, title: string): Promise<void> {
    const result = await this.client.session.update({ sessionID: id, title })
    assertOpencodeSuccess(result, "session.update")
  }

  public async deleteSession(id: string): Promise<void> {
    const result = await this.client.session.delete({ sessionID: id })
    assertOpencodeSuccess(result, "session.delete")
  }

  public generateSessionTitle(input: GenerateSessionTitleRequest): Promise<GeneratedSessionTitle> {
    return generateTitle(input, (choice) => this.resolveSessionTitleTarget(choice))
  }
  private resolveSessionTitleTarget(choice: ModelChoice | undefined): {
    apiKey: string
    baseUrl: string
    modelID: string
  } {
    const effectiveChoice = choice ?? this.options.defaultModel
    if (this.options.modelAccess.kind !== "oomol") {
      const customModel = this.resolveLocalCustomModel(effectiveChoice)
      return { apiKey: customModel.apiKey, baseUrl: customModel.baseUrl, modelID: customModel.modelName }
    }
    const resolved = this.resolveModel(effectiveChoice)
    if (effectiveChoice?.kind !== "custom") {
      return { apiKey: this.options.modelAccess.sessionToken, baseUrl: llmBaseUrl, modelID: resolved.modelID }
    }
    const customModel = this.options.customModels?.find((item) => item.id === effectiveChoice.id)
    if (!customModel) {
      throw new Error("Selected custom model is no longer available.")
    }
    return { apiKey: customModel.apiKey, baseUrl: customModel.baseUrl, modelID: resolved.modelID }
  }

  public async getMessages(sessionId: string): Promise<ChatMessage[]> {
    if (!this.started) {
      return []
    }
    const result = await this.client.session.messages({ sessionID: sessionId })
    assertOpencodeSuccess(result, "session.messages")
    const raw = (result.data ?? []) as Array<{ info?: unknown; parts?: unknown }>
    const messages: ChatMessage[] = []
    for (const item of raw) {
      const normalized = normalizeMessage(item)
      if (normalized) {
        messages.push(normalized)
      }
    }
    return messages
      .map((message, index) => ({ index, message }))
      .sort((left, right) => left.message.createdAt - right.message.createdAt || left.index - right.index)
      .map((item) => item.message)
  }

  public async getPendingQuestions(sessionId: string): Promise<ChatQuestionRequest[]> {
    return this.getPendingQuestionsForSessions([sessionId])
  }

  public async getPendingQuestionsForSessions(sessionIds: readonly string[]): Promise<ChatQuestionRequest[]> {
    if (!this.started) {
      return []
    }
    const requestedSessionIds = new Set(sessionIds)
    if (requestedSessionIds.size === 0) return []
    const result = await this.client.question.list()
    assertOpencodeSuccess(result, "question.list")
    const raw = Array.isArray(result.data) ? result.data : []
    return raw
      .map(normalizeQuestionRequest)
      .filter((request): request is ChatQuestionRequest => Boolean(request))
      .filter((request) => requestedSessionIds.has(request.sessionId))
  }

  public async answerQuestion(_sessionId: string, requestId: string, answers: string[][]): Promise<void> {
    const result = await this.client.question.reply({
      requestID: requestId,
      answers,
    })
    assertOpencodeSuccess(result, "question.reply")
  }

  public async rejectQuestion(_sessionId: string, requestId: string): Promise<void> {
    const result = await this.client.question.reject({ requestID: requestId })
    assertOpencodeSuccess(result, "question.reject")
  }

  public async getPendingPermissions(sessionId: string): Promise<ChatPermissionRequest[]> {
    return this.getPendingPermissionsForSessions([sessionId])
  }

  public async getPendingPermissionsForSessions(sessionIds: readonly string[]): Promise<ChatPermissionRequest[]> {
    if (!this.started) {
      return []
    }
    const requestedSessionIds = new Set(sessionIds)
    if (requestedSessionIds.size === 0) return []
    const result = await this.client.permission.list()
    assertOpencodeSuccess(result, "permission.list")
    const raw = Array.isArray(result.data) ? result.data : []
    return raw
      .map(normalizePermissionRequest)
      .filter((request): request is ChatPermissionRequest => Boolean(request))
      .filter((request) => requestedSessionIds.has(request.sessionId))
  }

  public async answerPermission(_sessionId: string, requestId: string, reply: ChatPermissionReply): Promise<void> {
    const result = await this.client.permission.reply({ requestID: requestId, reply })
    assertOpencodeSuccess(result, "permission.reply")
  }

  /**
   * 非阻塞发送：立即返回，内容经事件流推送。
   * R4：默认每轮把"账号存在已授权 Link provider"的事实注入系统提示末尾（body.system 经实测追加
   * 在 agent.prompt 之后），不列 provider 名，避免可用性上下文变成工具使用诱导。稳定前缀
   * （人格/工具/契约）留在 agent.prompt 以利缓存。
   */
  public async promptStreaming(sessionId: string, text: string, options: PromptStreamingOptions = {}): Promise<void> {
    if (options.signal?.aborted) {
      return
    }
    // 缓存友好顺序：稳定段（persona/memory/稳定规则）前置，易变段（授权/动态
    // context/产物目录）后置——DeepSeek/OpenAI 隐式前缀缓存命中更长前缀。
    // mergeSystemPrompts 对 undefined 段保留固定占位，避免段缺失导致后续位移。
    const tail = mergeSystemPrompts(
      buildDWeisPersonaSystem(this.persona),
      await buildMemorySystem(this.options.memoryDir),
      options.stableSystem,
      this.options.linkRuntime?.kind === "oomol" ? buildWorkspaceIdentitySystem(options.teamName) : undefined,
      await this.buildAuthorizedSystem(options.teamName, options.signal),
      options.system,
      buildArtifactSystem(options.artifactDir, options.outputProjectRoot),
      buildProcessSystem(options.processDir),
    )
    if (options.signal?.aborted) {
      return
    }
    const abortPrompt = (): void => {
      void this.abort(sessionId).catch((error) => {
        console.warn("[dweis] abort prompt after signal failed:", error)
      })
    }
    options.signal?.addEventListener("abort", abortPrompt, { once: true })
    try {
      if (options.signal?.aborted) {
        return
      }
      const variant = this.resolveReasoningVariant(options.model, options.reasoningLevel)
      const attachmentCapabilities = this.resolveAttachmentCapabilities(options.model)
      const body: NonNullable<SessionPromptAsyncData["body"]> = {
        agent: normalizeDWeisAgentMode(options.mode),
        ...(options.messageId ? { messageID: options.messageId } : {}),
        model: this.resolveModel(options.model),
        ...(tail ? { system: tail } : {}),
        ...(variant ? { variant } : {}),
        parts: await buildPromptParts(text, options.attachments, attachmentCapabilities),
      }
      const result = await this.client.session.promptAsync(
        { sessionID: sessionId, ...body },
        { signal: options.signal },
      )
      if (options.signal?.aborted) {
        return
      }
      assertOpencodeSuccess(result, "session.promptAsync")
    } finally {
      options.signal?.removeEventListener("abort", abortPrompt)
    }
  }

  /**
   * 非流式结构化解析：在临时会话里让 AI 生成回答，轮询等待完成后返回最后一条
   * assistant 文本。用于把自然语言解析成结构化数据（如自动化任务触发规则）；
   * AI 不可用 / 超时 / 中断时返回 null。
   */
  public async parseStructuredText(system: string, text: string, signal?: AbortSignal): Promise<string | null> {
    if (!this.started) {
      return null
    }
    const session = await this.createSession("[dweis] structured parse")
    try {
      const body: NonNullable<SessionPromptAsyncData["body"]> = {
        agent: DWEIS_BUILD_AGENT_NAME,
        model: this.resolveModel(this.options.defaultModel),
        ...(system ? { system } : {}),
        parts: [{ type: "text", text }],
      }
      const result = await this.client.session.promptAsync({ sessionID: session.id, ...body }, { signal })
      if (signal?.aborted) {
        return null
      }
      assertOpencodeSuccess(result, "session.promptAsync")
      const deadline = Date.now() + structuredParseTimeoutMs
      while (!signal?.aborted && Date.now() < deadline) {
        const messages = await this.getMessages(session.id)
        const assistant = [...messages].reverse().find((message) => message.role === "assistant")
        if (assistant && typeof assistant.completedAt === "number") {
          const answer = assistant.parts
            .filter((part) => part.kind === "text" && typeof part.text === "string")
            .map((part) => part.text as string)
            .join("\n")
            .trim()
          return answer.length > 0 ? answer : null
        }
        await new Promise((resolve) => setTimeout(resolve, structuredParsePollMs))
      }
      return null
    } finally {
      await this.deleteSession(session.id).catch((error: unknown) => {
        console.warn("[dweis] cleanup parse session failed:", error)
      })
    }
  }

  /** R4：构建注入系统提示末尾的已授权 Link 可用性提示（无已授权则 undefined）。 */
  public async buildAuthorizedSystem(teamName?: string, signal?: AbortSignal): Promise<string | undefined> {
    if (!this.options.linkRuntime) return undefined
    const services = await this.authorizedServicesForPrompt(teamName, signal)
    if (services.length === 0) {
      return undefined
    }
    return (
      `Some Link providers are already authorized for the active workspace. ` +
      `This is availability awareness only: it is not a recommendation to use Link tools and does not indicate that any provider fits the current task. ` +
      `For questions about which providers are connected, use list_apps. When, and only when, the user's request needs private/account-specific SaaS data or actions, use Link tools to discover the appropriate action; search results include whether a provider is authenticated. ` +
      `Ignore this note for direct answers, local files, commands, concrete URLs, webpage fetching, and general web browsing.`
    )
  }

  /** 提示词关键路径只等待很短预算；过期值可立即复用，刷新在后台完成。 */
  private async authorizedServicesForPrompt(teamName?: string, signal?: AbortSignal): Promise<string[]> {
    const cacheKey =
      this.options.linkRuntime?.kind === "openconnector"
        ? `openconnector:${this.options.linkRuntime.baseUrl}`
        : `oomol:${connectorBaseUrl}:team:${normalizeTeamName(teamName) ?? ""}`
    const cached = this.authorizedServicesCache.get(cacheKey)
    if (cached && Date.now() - cached.loadedAt < authorizedServicesCacheTtlMs) {
      return cached.services
    }
    let load = this.authorizedServicesLoads.get(cacheKey)
    if (!load) {
      const controller = new AbortController()
      load = this.listAuthorizedServices(teamName, controller.signal).then((services) => {
        if (!this.disposed && this.authorizedServicesLoads.get(cacheKey) === load) {
          this.authorizedServicesCache.set(cacheKey, { loadedAt: Date.now(), services })
        }
        return services
      })
      this.authorizedServicesLoadControllers.set(cacheKey, controller)
      this.authorizedServicesLoads.set(cacheKey, load)
      const finishLoad = () => {
        if (this.authorizedServicesLoads.get(cacheKey) === load) {
          this.authorizedServicesLoads.delete(cacheKey)
          this.authorizedServicesLoadControllers.delete(cacheKey)
        }
      }
      void load.then(finishLoad, finishLoad)
    }
    if (cached) {
      return cached.services
    }
    return settleWithinPromptBudget(load, authorizedServicesPromptBudgetMs, signal)
  }

  /** 直查 connector /v1/apps，返回已授权（active）service 名清单（R4 动态系统提示用）。 */
  public async listAuthorizedServices(teamName?: string, signal?: AbortSignal): Promise<string[]> {
    if (!this.started || !this.options.linkRuntime) {
      return []
    }
    if (this.options.linkRuntime.kind === "openconnector") {
      return this.options.listOpenConnectorAuthorizedServices?.(signal) ?? []
    }
    const normalizedTeamName = normalizeTeamName(teamName)
    const requestSignal = signalWithTimeout(signal, 15_000)
    try {
      const response = await fetch(`${connectorBaseUrl}/v1/apps`, {
        headers: {
          Authorization: `Bearer ${this.options.linkRuntime.sessionToken}`,
          ...(normalizedTeamName ? { "x-oo-organization-name": normalizedTeamName } : {}),
        },
        signal: requestSignal.signal,
      })
      if (!response.ok) {
        console.warn("[dweis] authorized service lookup failed:", response.status, response.statusText)
        logDiagnostic(
          "agent",
          "authorized service lookup failed",
          {
            status: response.status,
            statusText: response.statusText,
          },
          "warn",
        )
        return []
      }
      const payload = (await response.json()) as { data?: Array<{ service?: string; status?: string }> }
      const apps = payload.data ?? []
      return apps.filter((a) => a.status === "active" && a.service).map((a) => a.service as string)
    } catch (error) {
      if (!signal?.aborted) {
        console.warn("[dweis] authorized service lookup failed:", error)
        logDiagnostic("agent", "authorized service lookup failed", { error }, "warn")
      }
      return []
    } finally {
      requestSignal.cleanup()
    }
  }

  public async abort(sessionId: string): Promise<void> {
    const result = await this.client.session.abort({ sessionID: sessionId })
    assertOpencodeSuccess(result, "session.abort")
  }

  /** 撤销到指定消息（该消息及之后被回滚；opencode /undo 即 session.revert）。 */
  public async revertToMessage(sessionId: string, messageId: string): Promise<void> {
    if (!this.started) {
      return
    }
    const result = await this.client.session.revert({ sessionID: sessionId, messageID: messageId })
    assertOpencodeSuccess(result, "session.revert")
  }

  /** 恢复被撤销的变更（opencode /redo 即 session.unrevert）。 */
  public async unrevertSession(sessionId: string): Promise<void> {
    if (!this.started) {
      return
    }
    const result = await this.client.session.unrevert({ sessionID: sessionId })
    assertOpencodeSuccess(result, "session.unrevert")
  }

  /** 用户直接执行 shell 命令并写入会话（opencode 的 shell 直执行；结果对 agent 上下文可见）。 */
  public async runShellCommand(sessionId: string, command: string): Promise<void> {
    if (!this.started) {
      return
    }
    const result = await this.client.session.shell({ sessionID: sessionId, command, agent: "build" })
    assertOpencodeSuccess(result, "session.shell")
  }

  /** 扫描 agent workspace 的自定义斜杠命令（.opencode/command/*.md，Claude Code 风格 frontmatter）。 */
  public async getCustomCommands(): Promise<CustomCommand[]> {
    if (!this.started) {
      return []
    }
    const commandDir = path.join(this.options.rootDir, "workspace", ".opencode", "command")
    let entries: string[]
    try {
      entries = await readdir(commandDir)
    } catch {
      return []
    }
    const commands: CustomCommand[] = []
    for (const entry of entries.filter((name) => name.endsWith(".md")).sort()) {
      try {
        const content = await readFile(path.join(commandDir, entry), "utf8")
        const parsed = parseCommandFrontmatter(content)
        if (parsed) {
          commands.push(parsed)
        }
      } catch {
        // 单个命令文件不可读则跳过，不影响其余命令。
      }
    }
    return commands
  }

  /**
   * 触发 AI 压缩：sidecar 总结会话历史并替换为摘要（opencode 的 /compact 即此调用）。
   * model 缺省时用 defaultModel；压缩需要当前模型做总结。
   */
  public async summarizeSession(sessionId: string, model?: ModelChoice): Promise<void> {
    if (!this.started) {
      return
    }
    const resolved = this.resolveModel(model)
    const result = await this.client.session.summarize({
      sessionID: sessionId,
      providerID: resolved.providerID,
      modelID: resolved.modelID,
    })
    assertOpencodeSuccess(result, "session.summarize")
  }

  public async createArtifactDir(sessionId: string, projectRoot?: string): Promise<string> {
    const artifactDir = projectRoot
      ? await this.createProjectArtifactDir(sessionId, projectRoot)
      : await this.createTurnDir("artifacts", sessionId)
    await this.rememberTurnArtifactDir(artifactDir)
    return artifactDir
  }

  /** 把当前轮产物目录写入标记文件：generate_image 工具调用时读取，默认输出写这里。失败仅告警不阻塞轮次。 */
  private async rememberTurnArtifactDir(artifactDir: string): Promise<void> {
    try {
      const markerPath = turnArtifactMarkerPath(path.join(this.options.rootDir, "oo-store"))
      await mkdir(path.dirname(markerPath), { recursive: true })
      await writeFile(markerPath, JSON.stringify({ artifactDir }), {
        encoding: "utf-8",
        mode: 0o600,
      })
    } catch (error) {
      console.warn("[dweis] failed to write turn artifact marker", error instanceof Error ? error.message : error)
    }
  }

  public artifactSessionDir(sessionId: string, projectRoot?: string): string {
    if (projectRoot) {
      return path.resolve(projectRoot, ".dweis", "artifacts", sanitizeArtifactPathSegment(sessionId))
    }
    return this.sessionTurnRoot("artifacts", sessionId)
  }

  public async createProcessDir(sessionId: string): Promise<string> {
    return this.createTurnDir("process", sessionId)
  }

  private async createTurnDir(kind: "artifacts" | "process", sessionId: string): Promise<string> {
    const root = this.sessionTurnRoot(kind, sessionId)
    await mkdir(root, { recursive: true })
    return createUniqueTurnDir(root)
  }

  private async createProjectArtifactDir(sessionId: string, projectRoot: string): Promise<string> {
    const requestedProjectRoot = path.resolve(projectRoot)
    const requestedProjectStat = await lstat(requestedProjectRoot)
    if (!requestedProjectStat.isDirectory() || requestedProjectStat.isSymbolicLink()) {
      throw new Error("Project artifact root is not a directory.")
    }
    const resolvedProjectRoot = await realpath(requestedProjectRoot)
    const resolvedProjectStat = await lstat(resolvedProjectRoot)
    if (!resolvedProjectStat.isDirectory() || resolvedProjectStat.isSymbolicLink()) {
      throw new Error("Project artifact root is not a directory.")
    }
    const sessionRoot = await ensureProjectArtifactSessionRoot(resolvedProjectRoot, sessionId)
    return createUniqueTurnDir(sessionRoot)
  }

  private sessionTurnRoot(kind: "artifacts" | "process", sessionId: string): string {
    const root = path.resolve(this.options.rootDir, kind)
    const dir = path.resolve(root, sanitizeArtifactPathSegment(sessionId))
    if (!pathInside(root, dir)) {
      throw new Error("Invalid session directory segment.")
    }
    return dir
  }

  /** 阻塞发送（headless 验证用）：发送并返回该会话全部消息。 */
  public async sendMessage(text: string, sessionId?: string, system?: string): Promise<SendMessageResult> {
    let id = sessionId
    if (!id) {
      id = (await this.createSession(branding.appName)).id
    }
    const prompted = await this.client.session.prompt({
      sessionID: id,
      agent: normalizeDWeisAgentMode(undefined),
      model: { providerID: DWEIS_PROVIDER_ID, modelID: DWEIS_MODEL_ID },
      ...(system ? { system } : {}),
      parts: [{ type: "text", text }],
    })
    assertOpencodeSuccess(prompted, "session.prompt")
    const messageResult = await this.client.session.messages({ sessionID: id })
    assertOpencodeSuccess(messageResult, "session.messages")
    const messages = messageResult.data
    return { sessionId: id, messages }
  }

  private async writeTeamScope(teamName: string | undefined): Promise<void> {
    if (!this.teamScopePath) {
      return
    }
    const content = JSON.stringify({
      teamName: teamName ?? "",
      sessionKnowledgeBaseIds: Object.fromEntries(this.sessionKnowledgeBaseIds),
      sessionTeams: Object.fromEntries(this.sessionTeamNames),
    })
    await atomicWriteText(this.teamScopePath, content)
  }

  private async writeTeamState(teamName: string | undefined): Promise<void> {
    const previousTeamName = this.teamName
    await this.writeOoIdentity(teamName)
    try {
      await this.writeTeamScope(teamName)
    } catch (error) {
      try {
        await this.writeOoIdentity(previousTeamName)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Failed to persist and rollback agent team state.")
      }
      throw error
    }
  }

  private async writeOoIdentity(teamName: string | undefined): Promise<void> {
    await writeOoIdentitySettings(path.join(this.options.rootDir, "oo-store", "config"), teamName)
  }

  /**
   * 销毁 agent：同步摘掉事件流与引用，返回 sidecar 进程树回收的 Promise。
   * 退出路径应 await（确保 opencode 及其工具子进程被连根回收后再退出主进程，
   * 否则残留孤儿会被 macOS 判为"正在后台运行"）；重启路径可 fire-and-forget。
   */
  public dispose(): Promise<void> {
    this.disposed = true
    this.eventLoopStopped = true
    this.eventStreamAbort?.abort()
    this.eventStreamAbort = null
    this.eventSubscriber = null
    this.started = false
    this.eventMetrics.dispose()
    this.authorizedServicesCache.clear()
    for (const controller of this.authorizedServicesLoadControllers.values()) {
      controller.abort(new Error("Agent manager was disposed."))
    }
    this.authorizedServicesLoadControllers.clear()
    this.authorizedServicesLoads.clear()
    // 同时回收"启动中"的实例：退出/重启可能正卡在 startSidecar 的 await 上，此时 this.sidecar 仍为
    // null，但 startingSidecar 已 spawn opencode，必须一并连根回收，否则它会成为漏网孤儿。
    const sidecar = this.sidecar ?? this.startingSidecar
    this.sidecar = null
    this.startingSidecar = null
    return sidecar?.dispose() ?? Promise.resolve()
  }

  private resolveModel(choice: ModelChoice | undefined): { providerID: string; modelID: string } {
    const effectiveChoice = choice ?? this.options.defaultModel
    if (this.options.modelAccess.kind !== "oomol") {
      const customModel = this.resolveLocalCustomModel(effectiveChoice)
      return { providerID: customProviderId(customModel.id), modelID: customModel.modelName }
    }
    if (!effectiveChoice || effectiveChoice.kind === "builtin") {
      const modelID =
        effectiveChoice && isBuiltinModelId(effectiveChoice.id) ? effectiveChoice.id : DEFAULT_BUILTIN_MODEL_ID
      return resolveBuiltinModel(modelID).runtime
    }
    const model = this.options.customModels?.find((item) => item.id === effectiveChoice.id)
    if (!model) {
      throw new Error("Selected custom model is no longer available.")
    }
    return { providerID: customProviderId(model.id), modelID: model.modelName }
  }

  private resolveReasoningVariant(
    choice: ModelChoice | undefined,
    level: ReasoningLevel | undefined,
  ): string | undefined {
    const variant = opencodeReasoningVariant(level)
    if (!variant) {
      return undefined
    }
    const effectiveChoice = choice ?? this.options.defaultModel
    if (this.options.modelAccess.kind !== "oomol") {
      const model = this.resolveLocalCustomModel(effectiveChoice)
      return clampReasoningVariant(variant, model.reasoningVariants)
    }
    if (effectiveChoice?.kind === "custom") {
      const model = this.options.customModels?.find((item) => item.id === effectiveChoice.id)
      return clampReasoningVariant(variant, model?.reasoningVariants)
    }
    const modelID =
      effectiveChoice && isBuiltinModelId(effectiveChoice.id) ? effectiveChoice.id : DEFAULT_BUILTIN_MODEL_ID
    const model = resolveBuiltinModel(modelID)
    return clampReasoningVariant(variant, model.capabilities.reasoningVariants)
  }

  private resolveAttachmentCapabilities(choice: ModelChoice | undefined): { images: boolean; pdf: boolean } {    const effectiveChoice = choice ?? this.options.defaultModel
    if (this.options.modelAccess.kind !== "oomol") {
      const model = this.resolveLocalCustomModel(effectiveChoice)
      return { images: model.supportsImages === true, pdf: false }
    }
    if (effectiveChoice?.kind === "custom") {
      const model = this.options.customModels?.find((item) => item.id === effectiveChoice.id)
      return { images: model?.supportsImages === true, pdf: false }
    }
    const modelID =
      effectiveChoice && isBuiltinModelId(effectiveChoice.id) ? effectiveChoice.id : DEFAULT_BUILTIN_MODEL_ID
    const capabilities = resolveBuiltinModel(modelID).capabilities
    return { images: capabilities.supportsImages, pdf: capabilities.supportsPdf }
  }

  private resolveLocalCustomModel(choice: ModelChoice | undefined): RuntimeCustomModel {
    const modelId = choice?.kind === "custom" ? choice.id : this.options.defaultModel?.id
    const model = this.options.customModels?.find((item) => item.id === modelId)
    if (model) {
      return model
    }
    if (choice?.kind === "custom") {
      throw new Error("Selected custom model is no longer available.")
    }
    throw new Error("A custom model is required for the local Agent runtime.")
  }
}

export function buildWorkspaceIdentitySystem(teamName?: string): string {
  const normalizedTeamName = normalizeTeamName(teamName)
  if (!normalizedTeamName) {
    throw new Error("Team workspace identity is unavailable")
  }
  return `Current-turn Link workspace: team ${JSON.stringify(normalizedTeamName)}; raw oo selector: --organization ${JSON.stringify(normalizedTeamName)}.`
}

async function buildPromptParts(
  text: string,
  attachments: ChatAttachment[] | undefined,
  capabilities: { images: boolean; pdf: boolean },
): Promise<Array<TextPartInput | FilePartInput>> {
  const parts: Array<TextPartInput | FilePartInput> = []
  for (const input of await planAttachmentInputs(attachments, capabilities)) {
    if (input.kind === "internal-text") {
      parts.push({
        type: "text",
        text: input.text,
        synthetic: true,
        metadata: {
          dweisPurpose: input.purpose,
          dweisVisibility: "internal",
        },
      })
      continue
    }
    parts.push({
      type: "file",
      mime: input.mime,
      filename: input.name,
      url: pathToFileUrl(input.path),
      source: {
        type: "file",
        path: input.path,
        text: { value: input.name, start: 0, end: input.name.length },
      },
    })
  }
  parts.push({ type: "text", text })
  return parts
}

function signalWithTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const abort = (): void => {
    controller.abort(signal?.reason)
  }
  if (signal?.aborted) {
    abort()
  } else {
    signal?.addEventListener("abort", abort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener("abort", abort)
    },
  }
}

function settleWithinPromptBudget(
  request: Promise<string[]>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string[]> {
  return new Promise((resolve) => {
    let completed = false
    const settle = (services: string[]): void => {
      if (completed) {
        return
      }
      completed = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      resolve(services)
    }
    const abort = (): void => settle([])
    const timer = setTimeout(() => {
      settle([])
    }, timeoutMs)
    timer.unref?.()
    if (signal?.aborted) {
      settle([])
    } else {
      signal?.addEventListener("abort", abort, { once: true })
    }
    void request.then(
      (services) => settle(services),
      () => settle([]),
    )
  })
}

/**
 * 推理档位钳制：用户所选档位超出模型支持范围时，降到模型支持的最高档（不超过用户档位）。
 * 直接丢弃 variant（undefined）会让模型回到默认思考模式——部分模型（如 deepseek-v4-flash-0731
 * 只支持到 high）在默认模式下把思考内联进正文（无 reasoning part），思考"裸露"。降到支持档
 * 保持思考走专用通道；模型支持范围全高于用户档位时用其最低档兜底；模型未声明支持范围时原样透传。
 */
function clampReasoningVariant(
  variant: DWeisReasoningVariant,
  supported: readonly DWeisReasoningVariant[] | undefined,
): string | undefined {
  if (!supported || supported.length === 0) {
    return variant
  }
  if (supported.includes(variant)) {
    return variant
  }
  const userIndex = DWEIS_REASONING_VARIANT_LEVELS.indexOf(variant)
  let fallback: string | undefined
  for (const candidate of DWEIS_REASONING_VARIANT_LEVELS) {
    if (!supported.includes(candidate)) {
      continue
    }
    fallback ??= candidate
    if (DWEIS_REASONING_VARIANT_LEVELS.indexOf(candidate) <= userIndex) {
      fallback = candidate
    }
  }
  return fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

export function buildArtifactSystem(artifactDir: string | undefined, outputProjectRoot?: string): string | undefined {
  if (!artifactDir) {
    return undefined
  }
  const projectPublication = outputProjectRoot
    ? [
        `- This turn belongs to a folder project. ${branding.appName} will publish final deliverables from this managed directory into the visible project directory: ${outputProjectRoot}`,
        `- Use descriptive user-facing file and directory names. Preserve any project-relative output layout explicitly requested by the user inside this managed directory; ${branding.appName} will reproduce that layout in the project.`,
        `- Do not write a second copy directly into the project directory. ${branding.appName} performs the checked, collision-safe publication after the turn completes.`,
        "- In the final response, refer to deliverables by their user-facing names or requested project-relative locations. Do not present the managed artifact path as the final project location.",
      ]
    : []
  return [
    "Artifact output contract for this turn:",
    `- Use this exact directory for files you create, convert, export, download, or modify as user-facing deliverables: ${artifactDir}`,
    "- Do not create files just because this artifact directory is provided.",
    ...projectPublication,
    "- For edits to an existing local project, modify the requested project files in place; even when this artifact directory is inside the project, use it only for exported deliverables, generated assets, converted files, reports, or packaged outputs.",
    `- ${branding.appName} indexes the directory recursively and determines the artifact type from the actual files. Do not create a manifest or describe files that do not exist.`,
    "- Treat HTML reports, images, PDFs, charts, spreadsheets, presentations, archives, and documents as user-facing deliverables.",
    "- For image sets, save every final image in display order with stable padded names such as 001.jpg and 002.jpg.",
    "- Image preview and artifact persistence are separate outputs, and both are required for every final generated image whenever the source can be materialized. Preserve a useful inline preview whenever an image provider or tool returns a viewable image, even when that preview is remote, data-backed, or temporary.",
    `- Persist every final generated image into this directory. If a tool returns only a remote, data-backed, or temporary preview, keep the preview reference intact so ${branding.appName} can materialize the same image during turn finalization. Do not describe it as a saved local file until persistence succeeds.`,
    "- When the final deliverable is one to four image files and inline viewing helps the user, include Markdown image references in the final response using their absolute local paths, for example ![short title](</absolute/path/image.png>).",
    `- If only a provider-backed image preview is available, keep that preview visible in the final response instead of omitting it. ${branding.appName} will materialize supported preview sources and independently report persistence failures.`,
    "- When there are many images, such as crawled or downloaded image sets, do not inline every image in the final response. Summarize the set and rely on the artifact browser.",
    "- Do not reuse output folders from earlier turns or other chats.",
    "- If you reuse a script from an earlier turn, copy or update it before running and replace every embedded output path with this turn's artifact directory. Never run a prior-turn script while it still targets an earlier output directory.",
    "- Do not write deliverables to Desktop, Downloads, the OpenCode workspace, or prior output directories unless the user explicitly requested that exact destination.",
    outputProjectRoot
      ? `- When you finish, summarize the deliverable contents and names in prose; ${branding.appName} will surface the checked final project locations after publication.`
      : "- When you finish, summarize the deliverable contents and report generated file paths in prose or inline code, not fenced code blocks; fenced blocks are only for code or multi-line text.",
    "- Do not open generated files with system commands unless the user explicitly asks you to open them externally; the app is responsible for surfacing artifacts in the UI.",
  ].join("\n")
}

function buildProcessSystem(processDir: string | undefined): string | undefined {
  if (!processDir) {
    return undefined
  }
  const pythonEnvironmentDir = managedPythonEnvironmentPath(processDir)
  const pythonExecutable = managedPythonExecutable(processDir)
  const createPythonEnvironment =
    process.platform === "win32"
      ? `py -3 -m venv ${JSON.stringify(pythonEnvironmentDir)}`
      : `python3 -m venv ${JSON.stringify(pythonEnvironmentDir)}`
  return [
    "Intermediate process file contract for this turn:",
    `- Use this exact directory for temporary scripts, raw service responses, debug logs, scratch data, and other implementation files that help you complete the task but are not the user-facing deliverable: ${processDir}`,
    "- Do not put final deliverables in this process directory.",
    "- Do not put process files in the artifact directory unless the user explicitly asked for source code or scripts as the deliverable.",
    "- When a task needs third-party Python modules, create and use this task-private virtual environment instead of the system Python:",
    `  - Create it when needed: ${createPythonEnvironment}`,
    `  - Install direct requirements for temporary work with: ${JSON.stringify(pythonExecutable)} -m pip install <package ...>`,
    "  - Creating this exact environment and immediately installing through its exact interpreter may be separate commands or one `&&` chain; harmless file-descriptor redirection does not change the task boundary.",
    "  - Direct requirements with no explicit source override are normally approved automatically regardless of package popularity. Ordinary extras and version constraints are accepted. Other flags are accepted only when they preserve this exact Python executable and virtual-environment target without changing the package source, requirements input, or installation destination; do not add a version constraint unless the task needs one.",
    "  - Do not use pip or pip3 directly, --user, --break-system-packages, sudo, alternative indexes, local paths, URLs, or requirements files.",
    "- When a task needs third-party Node.js modules only for temporary processing, install direct packages with no explicit source override in this process directory using an explicit target such as `cd <process-directory> && npm install <package ...>`. Package popularity does not affect approval, and package runners may be used when they are the shortest reliable path. Do not use global installation, custom registries, Git/URL/local sources, or user config.",
    "- Prefer short, descriptive filenames such as create_presentation.js, transform_data.py, raw-input.json, or render-log.txt.",
    "- Do not mention process files in the final response unless the user asks for implementation details, debugging details, or source files.",
  ].join("\n")
}

function mergeSystemPrompts(...parts: Array<string | undefined>): string | undefined {
  // undefined 段保留空占位（位置固定）——否则某段缺失会让后续所有段前移，
  // 破坏稳定前缀的缓存命中；连续空段折叠成单个分隔符，语义不受影响。
  const merged = parts
    .map((part) => part?.trim() ?? "")
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return merged || undefined
}

/**
 * 持久记忆注入段（借鉴 Hermes builtin memory）：每轮读盘 MEMORY.md / USER.md，
 * 拼成 "## Persistent memory" 段追加到 system prompt 末尾。写入后下一轮自动生效，
 * 无需重启 sidecar。两个文件都为空或读取失败时返回 undefined（记忆故障不阻塞对话）。
 */
export async function buildMemorySystem(memoryDir?: string): Promise<string | undefined> {
  if (!memoryDir) {
    return undefined
  }
  try {
    const [agent, user] = await Promise.all([
      readFile(path.join(memoryDir, "MEMORY.md"), "utf-8").catch(() => ""),
      readFile(path.join(memoryDir, "USER.md"), "utf-8").catch(() => ""),
    ])
    const agentText = agent.trim()
    const userText = user.trim()
    if (!agentText && !userText) {
      return undefined
    }
    const lines = [
      "## Persistent memory",
      "The following persistent memory is injected every turn. Update it with the memory tool when important facts change; when the file is full, consolidate by merging and dropping stale details before writing.",
    ]
    if (agentText) {
      lines.push("", "### Your memory", agentText)
    }
    if (userText) {
      lines.push("", "### User profile", userText)
    }
    return lines.join("\n")
  } catch {
    return undefined
  }
}

function pathToFileUrl(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).toString()
}

function sanitizeArtifactPathSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)
  return cleaned || "session"
}

async function pathExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  )
}

async function createUniqueTurnDir(root: string): Promise<string> {
  // 可读时间命名（本地时间）：2026-08-08_15-30-45；同秒冲突追加 -2/-3 序号。
  // 原用 毫秒时间戳-UUID，完全不可读，看不出是哪一轮。UUID 无意义已去除。
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  let resolvedDir = path.resolve(root, stamp)
  let suffix = 2
  while (await pathExists(resolvedDir)) {
    resolvedDir = path.resolve(root, `${stamp}-${suffix}`)
    suffix += 1
  }
  if (!pathInside(root, resolvedDir)) {
    throw new Error("Invalid turn directory segment.")
  }
  await mkdir(resolvedDir)
  return resolvedDir
}

async function ensurePlainDirectory(parent: string, name: string): Promise<string> {
  const directory = path.join(parent, name)
  try {
    await mkdir(directory)
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      throw error
    }
  }
  const directoryStat = await lstat(directory)
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("Project artifact path contains a non-directory or symbolic link.")
  }
  return directory
}

async function ensureProjectArtifactSessionRoot(projectRoot: string, sessionId: string): Promise<string> {
  const dweisRoot = await ensurePlainDirectory(projectRoot, ".dweis")
  const artifactsRoot = await ensurePlainDirectory(dweisRoot, "artifacts")
  const sessionRoot = await ensurePlainDirectory(artifactsRoot, sanitizeArtifactPathSegment(sessionId))
  const resolvedSessionRoot = await realpath(sessionRoot)
  if (!pathInside(projectRoot, resolvedSessionRoot)) {
    throw new Error("Project artifact directory resolves outside the project.")
  }
  return resolvedSessionRoot
}

function pathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** 解析 Claude Code 风格命令文件 frontmatter：`---\nname: X\ndescription: Y\n---\n模板正文`。 */
function parseCommandFrontmatter(content: string): CustomCommand | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return null
  }
  const meta = match[1]
  const template = match[2]?.trim()
  if (!template) {
    return null
  }
  const name = meta.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  if (!name) {
    return null
  }
  const description = meta.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  return { name, description, template }
}
