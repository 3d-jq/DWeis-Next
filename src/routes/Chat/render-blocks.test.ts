import type { ChatMessagePart } from "../../../electron/chat/common.ts"

import { describe, expect, it } from "vitest"
import { renderBlocks, splitInlineThink } from "./render-blocks.ts"

function textPart(partId: string, text: string): ChatMessagePart {
  return { kind: "text", partId, text }
}

function toolPart(partId: string): ChatMessagePart {
  return {
    kind: "tool",
    partId,
    callId: partId,
    tool: "bash",
    status: "completed",
    input: {},
  }
}

function errorPart(partId: string, errorText: string): ChatMessagePart {
  return { kind: "error", partId, errorText }
}

function reasoningPart(partId: string, text: string): ChatMessagePart {
  return { kind: "reasoning", partId, text }
}

function statusPart(partId: string): ChatMessagePart {
  return { kind: "status", partId, statusType: "reconnecting", attempt: 2, maxAttempts: 5 }
}

function attachmentPart(partId: string): ChatMessagePart {
  return {
    kind: "attachment",
    partId,
    attachment: {
      id: partId,
      name: "generated.png",
      mime: "image/png",
      path: "/tmp/generated.png",
      size: 1024,
    },
  }
}

describe("renderBlocks", () => {
  it("ignores whitespace-only text parts so adjacent tools stay grouped", () => {
    const firstTool = toolPart("tool-1")
    const secondTool = toolPart("tool-2")

    const blocks = renderBlocks([textPart("space-1", "\n  "), firstTool, textPart("space-2", " \n\t"), secondTool])

    expect(blocks).toEqual([{ kind: "tools", key: "tool-1", parts: [firstTool, secondTool] }])
  })

  it("keeps a tool group key stable when another adjacent tool is appended", () => {
    const firstTool = toolPart("tool-1")
    const firstBlocks = renderBlocks([firstTool])
    const secondBlocks = renderBlocks([firstTool, toolPart("tool-2")])

    expect(firstBlocks[0]).toMatchObject({ kind: "tools", key: "tool-1" })
    expect(secondBlocks[0]).toMatchObject({ kind: "tools", key: "tool-1" })
  })

  it("keeps visible text as separators between tool groups", () => {
    const firstTool = toolPart("tool-1")
    const visibleText = textPart("text-1", "下一步")
    const secondTool = toolPart("tool-2")

    const blocks = renderBlocks([firstTool, visibleText, secondTool])

    expect(blocks).toEqual([
      { kind: "tools", key: "tool-1", parts: [firstTool] },
      { kind: "text", part: visibleText },
      { kind: "tools", key: "tool-2", parts: [secondTool] },
    ])
  })

  it("keeps error notices as standalone separators", () => {
    const firstTool = toolPart("tool-1")
    const error = errorPart("error-1", "Payment Required")
    const secondTool = toolPart("tool-2")

    const blocks = renderBlocks([firstTool, error, secondTool])

    expect(blocks).toEqual([
      { kind: "tools", key: "tool-1", parts: [firstTool] },
      { kind: "error", part: error },
      { kind: "tools", key: "tool-2", parts: [secondTool] },
    ])
  })

  it("keeps connection status notices as standalone separators", () => {
    const firstTool = toolPart("tool-1")
    const status = statusPart("status-1")
    const secondTool = toolPart("tool-2")

    const blocks = renderBlocks([firstTool, status, secondTool])

    expect(blocks).toEqual([
      { kind: "tools", key: "tool-1", parts: [firstTool] },
      { kind: "status", part: status },
      { kind: "tools", key: "tool-2", parts: [secondTool] },
    ])
  })

  it("keeps assistant attachments as standalone separators", () => {
    const firstTool = toolPart("tool-1")
    const attachment = attachmentPart("attachment-1")
    const answer = textPart("text-1", "Done")

    const blocks = renderBlocks([firstTool, attachment, answer])

    expect(blocks).toEqual([
      { kind: "tools", key: "tool-1", parts: [firstTool] },
      { kind: "attachment", part: attachment },
      { kind: "text", part: answer },
    ])
  })

  it("does not duplicate an attachment already previewed by assistant text", () => {
    const attachment = attachmentPart("attachment-1")
    const answer = textPart("text-1", "Generated image:\n\n![Preview](</tmp/generated.png>)")

    expect(renderBlocks([answer, attachment])).toEqual([{ kind: "text", part: answer }])
  })

  it("keeps attachments for plain path mentions and ordinary links", () => {
    const attachment = attachmentPart("attachment-1")
    expect(renderBlocks([textPart("text-1", "Saved at /tmp/generated.png"), attachment])).toHaveLength(2)
    expect(renderBlocks([textPart("text-2", "[Download](/tmp/generated.png)"), attachment])).toHaveLength(2)
  })

  it("leaves non-image assistant attachments to the artifact shelf", () => {
    const attachment = attachmentPart("attachment-1")
    attachment.attachment = { ...attachment.attachment!, mime: "application/pdf", name: "report.pdf" }

    expect(renderBlocks([attachment])).toEqual([])
  })

  it("renders reasoning as a collapsible reasoning block before the answer", () => {
    const reasoning = reasoningPart("reasoning-1", "Check the current state")
    const answer = textPart("text-1", "Done")

    const blocks = renderBlocks([reasoning, answer])

    expect(blocks).toEqual([
      { kind: "reasoning", part: reasoning },
      { kind: "text", part: answer },
    ])
  })

  it("keeps empty reasoning parts renderable so thinking stays expandable", () => {
    const reasoning = reasoningPart("reasoning-1", "")
    const answer = textPart("text-1", "Done")

    const blocks = renderBlocks([reasoning, answer])

    expect(blocks).toEqual([
      { kind: "reasoning", part: reasoning },
      { kind: "text", part: answer },
    ])
  })

  describe("splitInlineThink", () => {
    it("splits a complete <think> block out of the text", () => {
      expect(splitInlineThink("<think>用户问1+1，直接回答。</think>\n\n1+1=2。")).toEqual({
        reasoning: "用户问1+1，直接回答。",
        text: "\n\n1+1=2。",
      })
    })

    it("treats everything after an unclosed <think> as reasoning while streaming", () => {
      expect(splitInlineThink("前置说明<think>正在思考中")).toEqual({
        reasoning: "正在思考中",
        text: "前置说明",
      })
    })

    it("returns reasoning null when no think tag is present", () => {
      expect(splitInlineThink("普通回答")).toEqual({ reasoning: null, text: "普通回答" })
    })

    it("handles a think block at the start with no trailing answer", () => {
      expect(splitInlineThink("<think>only thinking</think>")).toEqual({
        reasoning: "only thinking",
        text: "",
      })
    })
  })

  it("splits a MiniMax inline <think> block into reasoning + answer blocks", () => {
    const blocks = renderBlocks([textPart("text-1", "<think>用户问1+1，直接回答。</think>\n\n1+1=2。")])

    expect(blocks).toEqual([
      { kind: "reasoning", part: { kind: "reasoning", partId: "text-1:think", text: "用户问1+1，直接回答。" } },
      { kind: "text", part: { kind: "text", partId: "text-1", text: "\n\n1+1=2。" } },
    ])
  })

  it("renders only the reasoning block while the MiniMax <think> is still streaming", () => {
    const blocks = renderBlocks([textPart("text-1", "<think>正在思考中")])

    expect(blocks).toEqual([
      { kind: "reasoning", part: { kind: "reasoning", partId: "text-1:think", text: "正在思考中" } },
    ])
  })

  it("merges multiple reasoning parts in one message into a single reasoning block", () => {
    // 模型（如 MiniMax 高档思考）一个回复可能发多个思考段 → 逐个渲染会出现多个"思考过程"块。
    const blocks = renderBlocks([
      reasoningPart("r1", "先分析"),
      reasoningPart("r2", "再设计"),
      textPart("text-1", "回答内容"),
      reasoningPart("r3", "收尾思考"),
    ])

    expect(blocks).toEqual([
      { kind: "reasoning", part: { kind: "reasoning", partId: "r1", text: "先分析再设计收尾思考" } },
      { kind: "text", part: textPart("text-1", "回答内容") },
    ])
  })

  it("drops the duplicate <think> from text when reasoning parts already exist", () => {
    // MiniMax 同时发 reasoning parts 和带 <think> 的 text（同内容）→ 只留正文，思考不重复。
    const blocks = renderBlocks([
      reasoningPart("r1", "先分析"),
      textPart("text-1", "<think>先分析</think>\n\n回答内容"),
    ])

    expect(blocks).toEqual([
      { kind: "reasoning", part: { kind: "reasoning", partId: "r1", text: "先分析" } },
      { kind: "text", part: { kind: "text", partId: "text-1", text: "\n\n回答内容" } },
    ])
  })
})
