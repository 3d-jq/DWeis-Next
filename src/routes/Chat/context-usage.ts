import type { ChatMessage, ChatMessagePart, ChatTokenUsage } from "../../../electron/chat/common.ts"
import type { ModelCatalog } from "../../../electron/models/common.ts"
import type { SkillInventory } from "../../../electron/skills/common.ts"
import type { MemoryContent } from "../../../electron/memory/common.ts"

import { compactionThresholdTokens, contextLimitTokens } from "../../../electron/models/limits.ts"
import { estimateTokens } from "@/lib/token-estimate"

export interface ContextUsageInfo {
  usedTokens: number
  contextWindowTokens?: number
  inputLimitTokens?: number
  limitTokens?: number
  limitKind?: "compaction" | "context"
  maxOutputTokens?: number
  compactionThresholdTokens?: number
  percent?: number
  /** 最近一轮的 prompt 缓存命中率（0–100）；无缓存数据时为 undefined。 */
  cacheHitRate?: number
  /** 上下文窗口占用明细（估算）：消息/工具/技能/系统提示/记忆/其他。 */
  breakdown?: ContextUsageBreakdown
}

/** 上下文占用明细（token 估算，chars/4 口径与 opencode 一致）。 */
export interface ContextUsageBreakdown {
  messages: number
  tools: number
  skills: number
  systemPrompt: number
  memory: number
  /** 无法归类的部分（已压缩历史、模型解析开销等）= usage 总量 − 各桶之和。 */
  other: number
  /** 各桶之和 + other ≈ 该轮实际 prompt token（input + cache.read + cache.write）。 */
  total: number
}

export interface ContextUsageBudget {
  contextWindowTokens?: number
  inputLimitTokens?: number
  contextLimitTokens?: number
  maxOutputTokens?: number
  compactionThresholdTokens?: number
}

function positiveNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

export function contextTokensFromUsage(usage: ChatTokenUsage): number {
  const total = positiveNumber(usage.total)
  if (total > 0) {
    return total
  }
  return (
    positiveNumber(usage.input) +
    positiveNumber(usage.output) +
    positiveNumber(usage.cache.read) +
    positiveNumber(usage.cache.write)
  )
}

/**
 * prompt 缓存命中率（0–100）。
 *
 * provider 语义分两种：
 * - Anthropic 风格：usage.input 已包含缓存读取/写入（input >= cache.read），分母直接用 input；
 * - DeepSeek/OpenAI 兼容风格：usage.input 是未命中部分（cache.read 可能大于 input，cache.write 常为 0），
 *   分母 = 命中 + 未命中 = cache.read + input（+ write 若有）。
 * 按 read 与 input 的大小关系自动判别。无缓存数据时返回 undefined。
 */
export function cacheHitRateFromUsage(usage: ChatTokenUsage | undefined): number | undefined {
  if (!usage) {
    return undefined
  }
  const read = positiveNumber(usage.cache.read)
  if (read <= 0) {
    return undefined
  }
  const input = positiveNumber(usage.input)
  const written = positiveNumber(usage.cache.write)
  const denominator = input >= read ? input : read + input + written
  if (denominator <= 0) {
    return undefined
  }
  // floor 而非 round：99.5% 显示 100% 会让用户误以为完全命中，实际仍有未命中部分。
  return Math.floor((read / denominator) * 100)
}

export function latestContextTokenUsage(messages: ChatMessage[]): ChatTokenUsage | undefined {
  return messages.findLast((message) => message.role === "assistant" && message.tokenUsage)?.tokenUsage
}

export function selectedModelContextBudget(catalog: ModelCatalog | null): ContextUsageBudget | undefined {
  if (!catalog) {
    return undefined
  }
  const model =
    catalog.selected.kind === "custom"
      ? catalog.customModels.find((item) => item.id === catalog.selected.id)
      : catalog.builtins.find((item) => item.id === catalog.selected.id)
  if (!model) {
    return undefined
  }
  const contextLimit = contextLimitTokens({
    contextWindow: model.contextWindow,
    inputTokenLimit: model.inputTokenLimit,
  })
  const threshold = compactionThresholdTokens({
    contextWindow: model.contextWindow,
    inputTokenLimit: model.inputTokenLimit,
    maxOutputTokens: model.maxOutputTokens,
  })
  return {
    ...(model.contextWindow ? { contextWindowTokens: model.contextWindow } : {}),
    ...(model.inputTokenLimit ? { inputLimitTokens: model.inputTokenLimit } : {}),
    ...(contextLimit ? { contextLimitTokens: contextLimit } : {}),
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(threshold !== undefined ? { compactionThresholdTokens: threshold } : {}),
  }
}

export function selectedModelContextWindow(catalog: ModelCatalog | null): number | undefined {
  return selectedModelContextBudget(catalog)?.contextLimitTokens
}

export function buildContextUsageInfo(messages: ChatMessage[], catalog: ModelCatalog | null): ContextUsageInfo | null {
  const budget = selectedModelContextBudget(catalog)
  const usage = latestContextTokenUsage(messages)
  const usedTokens = usage ? contextTokensFromUsage(usage) : 0
  if (!budget?.contextLimitTokens && usedTokens === 0) {
    return null
  }
  const limitTokens = budget?.compactionThresholdTokens ?? budget?.contextLimitTokens
  const percent =
    limitTokens === undefined
      ? undefined
      : limitTokens <= 0
        ? usedTokens > 0
          ? 100
          : 0
        : Math.min(100, Math.max(0, Math.round((usedTokens / limitTokens) * 100)))
  const cacheHitRate = cacheHitRateFromUsage(usage)
  return {
    usedTokens,
    ...(cacheHitRate === undefined ? {} : { cacheHitRate }),
    ...(budget?.contextWindowTokens ? { contextWindowTokens: budget.contextWindowTokens } : {}),
    ...(budget?.inputLimitTokens ? { inputLimitTokens: budget.inputLimitTokens } : {}),
    ...(limitTokens === undefined ? {} : { limitTokens }),
    ...(budget?.maxOutputTokens ? { maxOutputTokens: budget.maxOutputTokens } : {}),
    ...(budget?.compactionThresholdTokens !== undefined
      ? { compactionThresholdTokens: budget.compactionThresholdTokens, limitKind: "compaction" as const }
      : limitTokens !== undefined
        ? { limitKind: "context" as const }
        : {}),
    ...(percent === undefined ? {} : { percent }),
  }
}

export function formatTokenCount(value: number): string {
  // 直接用完整数字（千分位），不用 K/M 缩写。
  return Math.max(0, Math.round(value)).toLocaleString("en-US")
}

/* ===== 上下文占用明细（估算） ===== */

// 工具桶常量：opencode 内置工具（bash/read/write/edit/grep/glob/list/webfetch/todo/task/skill/patch）
// + Wanta 附加工具（memory/browser_*）的 description+schema 总长近似。MCP 服务器工具按每服务器常量。
const BUILTIN_TOOLS_TOKEN_ESTIMATE = 1200
const MCP_SERVER_TOOLS_TOKEN_ESTIMATE = 400
// 系统提示桶常量：agent prompt（DWEIS_SYSTEM_PROMPT ≈ 8KB）+ 每轮 tail
// （env/workspace 身份/artifact 契约/process 契约 ≈ 2KB）+ 技能块（另计）。
const SYSTEM_PROMPT_BASE_TOKEN_ESTIMATE = 2600
// 附件近似：按文件大小换算，图片每 100KB ≈ 500 token，最低 200 token。
const ATTACHMENT_TOKEN_PER_100KB = 500

function estimateMessagePart(part: ChatMessagePart): number {
  switch (part.kind) {
    case "text":
    case "reasoning":
      return estimateTokens(part.text ?? "")
    case "tool":
      return estimateTokens(`${JSON.stringify(part.input ?? {})} ${part.output ?? ""}`)
    case "attachment":
      if (part.attachment?.size && part.attachment.size > 0) {
        return Math.max(200, Math.round((part.attachment.size / 100_000) * ATTACHMENT_TOKEN_PER_100KB))
      }
      return 200
    default:
      return 0
  }
}

function estimateMessages(messages: ChatMessage[]): number {
  let total = 0
  for (const message of messages) {
    for (const part of message.parts) {
      total += estimateMessagePart(part)
    }
  }
  return total
}

function estimateSkills(inventory: SkillInventory | null): number {
  if (!inventory) {
    return 0
  }
  // 复现 opencode <available_skills> 块：<name>/<description>/<location>，location 用常量路径近似。
  const lines = inventory.groups.map((group) => `${group.name}/${group.description ?? ""}/…`)
  return estimateTokens(lines.join("\n"))
}

function estimateMemory(memory: MemoryContent | null): number {
  if (!memory) {
    return 0
  }
  const agent = memory.agent.trim()
  const user = memory.user.trim()
  if (!agent && !user) {
    return 0
  }
  const block = ["## Persistent memory", agent ? `### Your memory\n${agent}` : "", user ? `### User profile\n${user}` : ""]
    .filter(Boolean)
    .join("\n")
  return estimateTokens(block)
}

/**
 * 上下文占用明细估算。opencode 不提供按构成拆分的实测 token，此处按 chars/4 口径估算各桶；
 * other = 该轮实际 prompt token（contextTokensFromUsage：total 或 input+output+cache）− 各桶之和，
 * 覆盖已压缩历史与估算误差。
 */
export function buildContextUsageBreakdown(
  messages: ChatMessage[],
  options: { mcpServerCount?: number; memory: MemoryContent | null; skillInventory: SkillInventory | null; usage: ChatTokenUsage | undefined },
): ContextUsageBreakdown {
  const messagesTokens = estimateMessages(messages)
  const toolsTokens = BUILTIN_TOOLS_TOKEN_ESTIMATE + (options.mcpServerCount ?? 0) * MCP_SERVER_TOOLS_TOKEN_ESTIMATE
  const skillsTokens = estimateSkills(options.skillInventory)
  const memoryTokens = estimateMemory(options.memory)
  // 系统提示桶只算基础 agent prompt + tail 固定块；技能块与记忆块是其中一部分，已独立成桶。
  const systemPromptTokens = SYSTEM_PROMPT_BASE_TOKEN_ESTIMATE
  const known = messagesTokens + toolsTokens + skillsTokens + systemPromptTokens + memoryTokens
  // contextTokensFromUsage 已包含 cache.read/cache.write（total 分支或 input+output+cache 分支），
  // 不能再额外加 cache.read，否则缓存读取 token 重复计、other/total 虚高。
  const usageTotal = options.usage ? contextTokensFromUsage(options.usage) : 0
  const other = Math.max(0, usageTotal - known)
  return {
    messages: messagesTokens,
    tools: toolsTokens,
    skills: skillsTokens,
    systemPrompt: systemPromptTokens,
    memory: memoryTokens,
    other,
    total: known + other,
  }
}
