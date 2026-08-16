import type { ChatMessage, ChatMessagePart } from "../../electron/chat/common.ts"

import { describe, expect, it } from "vitest"
import { setPart, setReasoningPart, setTextPart } from "./chat-message-state.ts"

function baseMessages(): ChatMessage[] {
  return [{ id: "m1", role: "assistant", parts: [], createdAt: 1 }]
}

function toolPart(): ChatMessagePart {
  return {
    kind: "tool",
    partId: "tool-1",
    callId: "c1",
    tool: "bash",
    status: "running",
    input: {},
  }
}

describe("text/reasoning before tools ordering", () => {
  it("keeps text before tools even when the tool event arrives first", () => {
    // live 流式：tool 事件先到（settle 窗口没等到 text），text 后到。
    // 必须对齐 opencode 最终顺序（真实数据 65/65 都是 text 在前），否则消息完成
    // reload 重排 → 文字/工具顺序跳变。
    const messages = setTextPart(setPart(baseMessages(), "m1", toolPart()), {
      sessionId: "s1",
      messageId: "m1",
      partId: "text-1",
      text: "先输出文字再调工具",
    })

    expect(messages[0]?.parts.map((part) => part.kind)).toEqual(["text", "tool"])
  })

  it("keeps reasoning before tools too", () => {
    const messages = setReasoningPart(setPart(baseMessages(), "m1", toolPart()), {
      sessionId: "s1",
      messageId: "m1",
      partId: "r1",
      text: "思考",
    })

    expect(messages[0]?.parts.map((part) => part.kind)).toEqual(["reasoning", "tool"])
  })

  it("keeps text before multiple tools and preserves update position", () => {
    const withTool = setPart(baseMessages(), "m1", toolPart())
    const withTwoTools = setPart(withTool, "m1", { ...toolPart(), partId: "tool-2" })
    const withText = setTextPart(withTwoTools, {
      sessionId: "s1",
      messageId: "m1",
      partId: "text-1",
      text: "叙述",
    })
    expect(withText[0]?.parts.map((part) => part.kind)).toEqual(["text", "tool", "tool"])

    // 后续 delta 更新原位置，不改变顺序。
    const updated = setTextPart(withText, { sessionId: "s1", messageId: "m1", partId: "text-1", text: "叙述补充" })
    expect(updated[0]?.parts.map((part) => part.kind)).toEqual(["text", "tool", "tool"])
    expect(updated[0]?.parts[0]).toMatchObject({ kind: "text", text: "叙述补充" })
  })
})
