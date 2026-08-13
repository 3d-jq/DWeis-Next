import type { SessionPromptAsyncData } from "@opencode-ai/sdk/v2/client"
import type { AgentManager } from "../agent/manager.ts"
import type { MemoryContent } from "./common.ts"

import { DWEIS_GENERAL_SUBAGENT_NAME } from "../agent/mode.ts"

/** 后台记忆审查（借鉴 Hermes background review）：每完成 N 轮对话，审查最近对话并决定是否写入 MEMORY.md。 */

const REVIEW_INTERVAL_MIN = 1
const REVIEW_INTERVAL_MAX = 50
const TRANSCRIPT_MESSAGE_LIMIT = 20
const TRANSCRIPT_CHAR_LIMIT = 6000
const MIN_TRANSCRIPT_CHARS = 20
const REVIEW_TIMEOUT_MS = 90_000
const REVIEW_POLL_MS = 300

/** 审查提示词：用户个人事实写入 USER.md（scope=user），协作期望/项目背景写入 MEMORY.md（scope=agent）。 */
const MEMORY_REVIEW_SYSTEM_PROMPT = `You are a background memory reviewer for a desktop AI assistant. Review the conversation transcript below and decide whether anything is worth saving to persistent memory.

Save when:
1. The user revealed something about themselves — persona, desires, preferences, or personal details worth remembering.
2. The user expressed expectations about how the assistant should behave — work style, tone, formatting, or collaboration preferences.

Do NOT save:
- Transient turn details (what was asked, one-off requests, code from the task).
- Facts already present in the current memory below.

Where to save:
- Guiding principle: USER.md describes WHO the user is — identity, background, habits, preferences, personal details. MEMORY.md describes HOW to work with them — collaboration expectations, project context, conventions, task progress.
- Personal facts about the user (preferences, background, personal details) go to the user profile: call the memory tool with action=write and scope=user. Keep the existing user profile entries, add the new facts, and stay within its 1375 character limit.
- Expectations about how you should behave and ongoing project context go to your memory: call the memory tool with action=write and scope=agent. Keep the existing entries, add the new facts, and stay within the 2200 character limit.

The memory tool REPLACES the whole file, so always pass the FULL merged content (existing entries + new facts), condensing or dropping stale details when near the limit.
If nothing is worth saving, reply with exactly: Nothing to save.
Use ONLY the memory tool. Do not use any other tool.`

export interface MemoryReviewerDeps {
  /** 当前 AgentManager（可能随登录/刷新变化，随时为 null）。 */
  getAgent: () => AgentManager | null
  /** 是否有正在进行的生成：忙时跳过审查，绝不与用户任务抢注意力。 */
  hasActiveGeneration: () => boolean
  /** 读取当前记忆内容（MEMORY.md 的 agent 段 + USER.md 的用户档案）。 */
  getMemory: () => Promise<MemoryContent>
  /** 实时读取自动记忆配置（开关 + 间隔）。 */
  getConfig: () => { enabled: boolean; interval: number }
}

/**
 * 每轮对话正常完成后计数，达到间隔阈值时在后台起临时审查会话，
 * 由 general subagent 用 memory 工具写入 MEMORY.md。全程 best-effort：
 * 忙时跳过、失败静默、in-flight 防重入、临时会话用完即删。
 */
export class MemoryReviewer {
  private readonly deps: MemoryReviewerDeps
  private readonly turnCounts = new Map<string, number>()
  private reviewing = false

  public constructor(deps: MemoryReviewerDeps) {
    this.deps = deps
  }

  /** 一轮生成正常完成（用户停止/错误路径不经过这里）。 */
  public onTurnCompleted(input: { sessionId: string; messageId?: string }): void {
    const { enabled, interval } = this.deps.getConfig()
    if (!enabled) {
      return
    }
    const clampedInterval = Math.min(Math.max(Math.trunc(interval) || REVIEW_INTERVAL_MIN, REVIEW_INTERVAL_MIN), REVIEW_INTERVAL_MAX)
    const count = (this.turnCounts.get(input.sessionId) ?? 0) + 1
    this.turnCounts.set(input.sessionId, count)
    if (count % clampedInterval !== 0) {
      return
    }
    // 触发审查：后台执行，不阻塞事件循环。
    void this.review(input.sessionId)
  }

  private async review(sessionId: string): Promise<void> {
    if (this.reviewing || this.deps.hasActiveGeneration()) {
      return
    }
    const agent = this.deps.getAgent()
    if (!agent) {
      return
    }
    this.reviewing = true
    let session: { id: string } | null = null
    try {
      const transcript = await this.buildTranscript(agent, sessionId)
      if (transcript.length < MIN_TRANSCRIPT_CHARS) {
        return
      }
      const { agent: memoryText, user: userText } = await this.deps.getMemory()
      session = await agent.createSession("[dweis] memory review")
      const body: NonNullable<SessionPromptAsyncData["body"]> = {
        agent: DWEIS_GENERAL_SUBAGENT_NAME,
        // 审查会话只放行 memory 工具（tools map 为权限覆盖语义）。
        tools: { memory: true },
        system: MEMORY_REVIEW_SYSTEM_PROMPT,
        parts: [
          {
            type: "text",
            text:
              `Current memory (MEMORY.md):\n${memoryText.trim() || "(empty)"}\n\n` +
              `Current user profile (USER.md):\n${userText.trim() || "(empty)"}\n\n` +
              `Conversation transcript:\n${transcript}`,
          },
        ],
      }
      const result = await agent.client.session.promptAsync({ sessionID: session.id, ...body })
      assertOpencodeSuccess(result, "session.promptAsync")
      const deadline = Date.now() + REVIEW_TIMEOUT_MS
      while (Date.now() < deadline) {
        const messages = await agent.getMessages(session.id)
        const assistant = [...messages].reverse().find((message) => message.role === "assistant")
        if (assistant && typeof assistant.completedAt === "number") {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, REVIEW_POLL_MS))
      }
    } catch (error) {
      // 后台审查 best-effort：失败静默，不影响用户对话。
      console.warn("[dweis] memory review failed:", error)
    } finally {
      if (session) {
        await agent?.deleteSession(session.id).catch((error: unknown) => {
          console.warn("[dweis] cleanup memory review session failed:", error)
        })
      }
      this.reviewing = false
    }
  }

  /** 取最近 ≤20 条消息的 user/assistant 文本，截断到 6000 字符。 */
  private async buildTranscript(agent: AgentManager, sessionId: string): Promise<string> {
    const messages = await agent.getMessages(sessionId)
    const lines: string[] = []
    for (const message of messages.slice(-TRANSCRIPT_MESSAGE_LIMIT)) {
      const text = message.parts
        .filter((part) => part.kind === "text" && typeof part.text === "string")
        .map((part) => part.text as string)
        .join("")
        .trim()
      if (!text) {
        continue
      }
      const role = message.role === "user" ? "User" : "Assistant"
      lines.push(`${role}: ${text}`)
    }
    const joined = lines.join("\n\n")
    return joined.length > TRANSCRIPT_CHAR_LIMIT ? joined.slice(-TRANSCRIPT_CHAR_LIMIT) : joined
  }
}

/** OpenCode SDK 默认不 throw，而是返回 `{ error }`；审查调用在边界统一转成异常。 */
function assertOpencodeSuccess(result: { error?: unknown }, operation: string): void {
  if (result.error !== undefined) {
    throw new Error(`${operation} failed: ${JSON.stringify(result.error)}`)
  }
}
