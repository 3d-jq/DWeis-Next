import type { ChatMessage, ChatMessagePart } from "../../../electron/chat/common.ts"
import type { RenderBlock } from "./render-blocks.ts"

import { renderBlocks } from "./render-blocks.ts"

export interface AssistantTimelineBlock {
  message: ChatMessage
  block: RenderBlock
}

export type AssistantTimelineSegmentKind = "process" | "response"

export interface AssistantTimelineSegment {
  kind: AssistantTimelineSegmentKind
  key: string
  blocks: AssistantTimelineBlock[]
}

export function assistantTimelineBlocks(messages: ChatMessage[]): AssistantTimelineBlock[] {
  return messages.flatMap((message) => renderBlocks(message.parts).map((block) => ({ message, block })))
}

function textBelongsToProcess(
  message: ChatMessage,
  part: ChatMessagePart,
  isFinalTextBlock: boolean,
  hasProcessBlocks: boolean,
  activeTurn: boolean,
): boolean {
  const text = part.text?.trim() ?? ""
  if (!text) {
    return false
  }
  // 纯文本回合（没有思考/工具）：所有文字都是正文，不折叠。
  if (!hasProcessBlocks) {
    return false
  }
  // 结果 = 最后一段文字；其余文字（中间叙述/中间结果/过程说明，无论 markdown 结构）
  // 都是处理过程，完成后随状态条收起——对话只分"处理过程 + 结果"两部分。
  // 提问消息里的问题上下文也收进处理过程（问题卡片已展示上下文；若独立成 response 段
  // 会把 process 切成两半 → 同回合出现两个状态条/两个处理中）。
  // 活跃回合中"最后消息带工具"的文字是过程叙述（模型还在干活），不算结果——否则 live
  // 时它临时当正文、工具被收尾并入正文前，后续消息到达后文字又收回 process → 顺序/位置
  // 跳变。回合结束后（activeTurn=false）最后文字才按正文处理（收尾工具场景保留）。
  if (isFinalTextBlock && !(activeTurn && message.parts.some((part) => part.kind === "tool"))) {
    return false
  }
  return true
}

function blockSegmentKind(
  item: AssistantTimelineBlock,
  isFinalTextBlock: boolean,
  hasProcessBlocks: boolean,
  activeTurn: boolean,
): AssistantTimelineSegmentKind {
  switch (item.block.kind) {
    case "tools":
      return "process"
    case "text":
      return textBelongsToProcess(item.message, item.block.part, isFinalTextBlock, hasProcessBlocks, activeTurn)
        ? "process"
        : "response"
    case "status":
    case "error":
      // 状态（重试/运行无输出/连接失败等）与工具错误都是处理过程的一部分，
      // 归 process 折叠区（状态条标题会显示 error/stopped 状态）；若独立成 response
      // 段会把 process 切开 → 同回合两个状态条/两个处理中。
      return "process"
    case "reasoning":
      return "process"
    case "attachment":
      // 图片等附件是面向用户的结果，保持正文区可见。
      return "response"
  }
}

function blockKey(item: AssistantTimelineBlock): string {
  return `${item.message.id}:${item.block.kind === "tools" ? item.block.key : item.block.part.partId}`
}

export function segmentAssistantTimeline(
  messages: ChatMessage[],
  options: { active?: boolean } = {},
): AssistantTimelineSegment[] {
  const { active = false } = options
  const blocks = assistantTimelineBlocks(messages)
  // 纯文本回合（无思考/工具）的所有文字都是正文；有处理过程的回合才折叠中间文字。
  const hasProcessBlocks = blocks.some(({ block }) => block.kind === "tools" || block.kind === "reasoning")
  // 正文 = 最后一条 assistant 消息里的最后一段文字。不能按"全局最后一段文字"判定：
  // live 流式中中间消息的过程叙述（如 "Now remove `onCollapse`..."）在那一刻也是
  // "全局最后一段"，会被误判成正文漏在「处理中」状态条外、把 process 段切成多个状态条；
  // 只有当最后一条消息里有文字时它才是真正的正文输出。
  const lastAssistantMessageId = messages.at(-1)?.id
  let lastTextBlockIndex = -1
  for (let index = 0; index < blocks.length; index += 1) {
    const item = blocks[index]
    if (item && item.block.kind === "text" && item.message.id === lastAssistantMessageId) {
      lastTextBlockIndex = index
    }
  }
  const segments: AssistantTimelineSegment[] = []
  // 正文之后的收尾工具（最后消息里文字后的 tool，如"已修复✅...现在重新打包："+ bash）
  // 并入正文前面的最后一个 process 段——一回合最多一个状态条，避免第二个条/横线。
  let lastProcessSegment: AssistantTimelineSegment | null = null
  for (let index = 0; index < blocks.length; index += 1) {
    const item = blocks[index]
    if (!item) {
      continue
    }
    const kind = blockSegmentKind(item, index === lastTextBlockIndex, hasProcessBlocks, active)
    if (kind === "process" && lastTextBlockIndex >= 0 && index > lastTextBlockIndex && lastProcessSegment) {
      lastProcessSegment.blocks.push(item)
      continue
    }
    const current = segments.at(-1)
    if (current?.kind === kind) {
      current.blocks.push(item)
    } else {
      segments.push({ kind, key: blockKey(item), blocks: [item] })
    }
    if (segments.at(-1)?.kind === "process") {
      lastProcessSegment = segments.at(-1) ?? null
    }
  }
  return segments
}

export function assistantMessagesFromTimelineBlocks(blocks: AssistantTimelineBlock[]): ChatMessage[] {
  const selectedParts = new Map<string, ChatMessagePart[]>()
  const messages = new Map<string, ChatMessage>()
  for (const { message, block } of blocks) {
    messages.set(message.id, message)
    const parts = selectedParts.get(message.id) ?? []
    if (block.kind === "tools") {
      parts.push(...block.parts)
    } else {
      parts.push(block.part)
    }
    selectedParts.set(message.id, parts)
  }
  return [...messages.values()].map((message) => ({ ...message, parts: selectedParts.get(message.id) ?? [] }))
}

export function timelineHasVisibleOutcome(segments: AssistantTimelineSegment[]): boolean {
  return segments.some(
    (segment) =>
      segment.kind === "response" &&
      segment.blocks.some(({ block }) => block.kind === "text" || block.kind === "attachment"),
  )
}

export function textFromTimelineBlocks(blocks: AssistantTimelineBlock[]): string {
  return blocks
    .filter(({ block }) => block.kind === "text")
    .map(({ block }) => (block.kind === "text" ? (block.part.text ?? "") : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim()
}
