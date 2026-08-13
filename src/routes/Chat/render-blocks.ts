import type { ChatMessagePart } from "../../../electron/chat/common.ts"

export type RenderBlock =
  | { kind: "text"; part: ChatMessagePart }
  | { kind: "reasoning"; part: ChatMessagePart }
  | { kind: "error"; part: ChatMessagePart }
  | { kind: "status"; part: ChatMessagePart }
  | { kind: "attachment"; part: ChatMessagePart }
  | { kind: "tools"; key: string; parts: ChatMessagePart[] }

export function isRenderablePart(part: ChatMessagePart): boolean {
  return (
    part.kind === "tool" ||
    part.kind === "error" ||
    part.kind === "status" ||
    (part.kind === "attachment" && Boolean(part.attachment?.mime.toLowerCase().startsWith("image/"))) ||
    (part.kind === "text" && Boolean(part.text?.trim())) ||
    // reasoning 空文本也渲染：思考中推理块显示"思考中"扫光并可展开，实时看已流出的推理内容。
    part.kind === "reasoning"
  )
}

function textRendersAttachment(parts: ChatMessagePart[], attachmentPath: string): boolean {
  if (!attachmentPath.trim()) {
    return false
  }
  const escapedPath = attachmentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const imagePattern = new RegExp(
    String.raw`!\[[^\]]*\]\(\s*(?:<${escapedPath}>|${escapedPath})(?:\s+["'][^"']*["'])?\s*\)`,
    "u",
  )
  return parts.some((part) => {
    if (part.kind !== "text" || !part.text?.includes(attachmentPath)) {
      return false
    }
    return imagePattern.test(part.text)
  })
}

export function renderBlocks(parts: ChatMessagePart[]): RenderBlock[] {
  const blocks: RenderBlock[] = []
  // 消息是否已有推理 part：有则 text 里的 <think> 是同内容重复（只留正文，防思考重复跳变）。
  const hasReasoningParts = parts.some((candidate) => candidate.kind === "reasoning")
  let pendingTools: ChatMessagePart[] = []
  // 合并同消息所有推理 part 为单个推理块：模型（如 MiniMax 高档思考）一个回复可能发多个思考段，
  // 逐个渲染会出现多个"思考过程"块。合并块插回首个推理 part 的位置（保持思考在前、正文在后）。
  let pendingReasoning: ChatMessagePart | null = null
  let reasoningInsertIndex = -1
  const flushTools = () => {
    if (pendingTools.length === 0) {
      return
    }
    blocks.push({ kind: "tools", key: pendingTools[0]?.partId ?? "tools", parts: pendingTools })
    pendingTools = []
  }
  const appendReasoning = (part: ChatMessagePart) => {
    if (!pendingReasoning) {
      pendingReasoning = part
      reasoningInsertIndex = blocks.length
    } else {
      pendingReasoning = { ...pendingReasoning, text: `${pendingReasoning.text ?? ""}${part.text ?? ""}` }
    }
  }
  const flushReasoning = () => {
    if (!pendingReasoning) {
      return
    }
    const block: RenderBlock = { kind: "reasoning", part: pendingReasoning }
    if (reasoningInsertIndex >= 0 && reasoningInsertIndex < blocks.length) {
      blocks.splice(reasoningInsertIndex, 0, block)
    } else {
      blocks.push(block)
    }
    pendingReasoning = null
    reasoningInsertIndex = -1
  }
  for (const part of parts) {
    if (!isRenderablePart(part)) {
      continue
    }
    if (part.kind === "attachment" && part.attachment && textRendersAttachment(parts, part.attachment.path)) {
      continue
    }
    if (part.kind === "tool") {
      pendingTools.push(part)
      continue
    }
    flushTools()
    if (part.kind === "reasoning") {
      appendReasoning(part)
    } else if (part.kind === "error") {
      blocks.push({ kind: "error", part })
    } else if (part.kind === "status") {
      blocks.push({ kind: "status", part })
    } else if (part.kind === "attachment") {
      blocks.push({ kind: "attachment", part })
    } else if (part.kind === "text") {
      // MiniMax 把思考用 <think>...</think> 内联在正文（从不发 reasoning_content）：
      // 拆出推理块（折叠）+ 正文。未闭合（流式中）时 <think> 之后都是思考，思考可实时显示。
      const split = splitInlineThink(part.text ?? "")
      if (split.reasoning === null) {
        blocks.push({ kind: "text", part })
      } else if (hasReasoningParts) {
        // 消息已有 reasoning parts（思考已单独表示）：text 里的 <think> 是同内容重复，
        // 只保留正文，避免思考内容重复出现（流式跳变）。
        if (split.text.trim()) {
          blocks.push({ kind: "text", part: { ...part, text: split.text } })
        }
      } else {
        if (split.reasoning.trim()) {
          appendReasoning({ kind: "reasoning", partId: `${part.partId}:think`, text: split.reasoning })
        }
        if (split.text.trim()) {
          blocks.push({ kind: "text", part: { ...part, text: split.text } })
        }
      }
    }
  }
  flushTools()
  flushReasoning()
  return blocks
}

/** 提取正文里内联的 <think>...</think> 思考块；无标签返回 reasoning=null。 */
export function splitInlineThink(text: string): { reasoning: string | null; text: string } {
  const thinkStart = text.indexOf("<think>")
  if (thinkStart === -1) {
    return { reasoning: null, text }
  }
  const thinkEnd = text.indexOf("</think>", thinkStart)
  if (thinkEnd === -1) {
    // 流式中标签未闭合：<think> 之后的内容都是思考（回答只在闭合后出现）。
    return { reasoning: text.slice(thinkStart + "<think>".length), text: text.slice(0, thinkStart) }
  }
  const reasoning = text.slice(thinkStart + "<think>".length, thinkEnd)
  const rest = text.slice(0, thinkStart) + text.slice(thinkEnd + "</think>".length)
  return { reasoning, text: rest }
}
