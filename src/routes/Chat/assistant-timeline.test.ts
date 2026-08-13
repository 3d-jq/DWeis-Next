import type { ChatMessage, ChatMessagePart } from "../../../electron/chat/common.ts"

import { describe, expect, it } from "vitest"
import {
  assistantMessagesFromTimelineBlocks,
  assistantTimelineBlocks,
  segmentAssistantTimeline,
  textFromTimelineBlocks,
  timelineHasVisibleOutcome,
} from "./assistant-timeline.ts"

function message(id: string, parts: ChatMessagePart[], finishReason?: string): ChatMessage {
  return { id, role: "assistant", parts, createdAt: 1, ...(finishReason ? { finishReason } : {}) }
}

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

function questionPart(partId: string): ChatMessagePart {
  return { ...toolPart(partId), tool: "question", status: "error", error: "The user dismissed this question" }
}

describe("assistantTimelineBlocks", () => {
  it("keeps tool and feedback text blocks in assistant message order", () => {
    const blocks = assistantTimelineBlocks([
      message("a1", [toolPart("tool-1"), textPart("text-1", "first feedback")]),
      message("a2", [toolPart("tool-2"), textPart("text-2", "second feedback")]),
    ])

    expect(
      blocks.map(({ message, block }) => ({
        messageId: message.id,
        kind: block.kind,
        partIds: block.kind === "tools" ? block.parts.map((part) => part.partId) : [block.part.partId],
      })),
    ).toEqual([
      { messageId: "a1", kind: "tools", partIds: ["tool-1"] },
      { messageId: "a1", kind: "text", partIds: ["text-1"] },
      { messageId: "a2", kind: "tools", partIds: ["tool-2"] },
      { messageId: "a2", kind: "text", partIds: ["text-2"] },
    ])
  })

  it("splits processing feedback before the last tool from final response after it", () => {
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("process-1", "I will inspect the page."), toolPart("tool-1")]),
      message("a2", [textPart("process-2", "The mobile page is blocked."), toolPart("tool-2")]),
      message("a3", [textPart("response-1", "The site blocks automated requests. Use a browser script instead.")]),
    ])
    const processBlocks = segments.filter((segment) => segment.kind === "process").flatMap((segment) => segment.blocks)
    const responseBlocks = segments
      .filter((segment) => segment.kind === "response")
      .flatMap((segment) => segment.blocks)

    expect(
      processBlocks.map(({ block }) => ({
        kind: block.kind,
        partIds: block.kind === "tools" ? block.parts.map((part) => part.partId) : [block.part.partId],
      })),
    ).toEqual([
      { kind: "text", partIds: ["process-1"] },
      { kind: "tools", partIds: ["tool-1"] },
      { kind: "text", partIds: ["process-2"] },
      { kind: "tools", partIds: ["tool-2"] },
    ])
    expect(responseBlocks.map(({ block }) => (block.kind === "text" ? block.part.partId : block.kind))).toEqual([
      "response-1",
    ])
    expect(textFromTimelineBlocks(responseBlocks)).toBe(
      "The site blocks automated requests. Use a browser script instead.",
    )
  })

  it("joins multiple response text blocks with blank lines", () => {
    const blocks = assistantTimelineBlocks([
      message("a1", [textPart("text-1", "First line")]),
      message("a2", [textPart("text-2", "Second line")]),
      message("a3", [textPart("text-3", "Third line")]),
    ])

    expect(textFromTimelineBlocks(blocks)).toBe("First line\n\nSecond line\n\nThird line")
  })

  it("ignores empty response text blocks", () => {
    const blocks = assistantTimelineBlocks([
      message("a1", [textPart("text-1", "First line")]),
      message("a2", [textPart("text-2", "")]),
      message("a3", [textPart("text-3", "Third line")]),
    ])

    expect(textFromTimelineBlocks(blocks)).toBe("First line\n\nThird line")
  })

  it("treats a text-only assistant message as final response", () => {
    const segments = segmentAssistantTimeline([message("a1", [textPart("response-1", "Done.")])])

    expect(segments.map((segment) => segment.kind)).toEqual(["response"])
    expect(
      segments.flatMap((segment) =>
        segment.blocks.map(({ block }) => (block.kind === "text" ? block.part.partId : block.kind)),
      ),
    ).toEqual(["response-1"])
  })

  it("folds an intermediate structured plan into process; only the final text stays visible", () => {
    const plan = [
      "## Selection plan",
      "",
      "| Product | Signal |",
      "| --- | --- |",
      "| Magnetic name tags | Strong |",
    ].join("\n")
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("plan", plan), toolPart("question")], "tool-calls"),
      message("a2", [textPart("progress", "I will collect the platform data now."), toolPart("search")], "tool-calls"),
      message("a3", [textPart("final", "The report is ready.")], "stop"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["process", "response"])
    expect(timelineHasVisibleOutcome(segments)).toBe(true)
  })

  it("keeps question context outside the process disclosure", () => {
    const segments = segmentAssistantTimeline([
      message(
        "a1",
        [textPart("context", "I need you to confirm the target Notion page."), questionPart("question")],
        "tool-calls",
      ),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["response", "process"])
    expect(textFromTimelineBlocks(segments[0]?.blocks ?? [])).toBe("I need you to confirm the target Notion page.")
  })

  it("does not hide a substantive answer followed by a trailing save tool", () => {
    const answer = "## Findings\n\n- First conclusion\n- Second conclusion"
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("answer", answer), toolPart("save")], "tool-calls"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["response", "process"])
  })

  it("treats Chinese bullet list with inline code as response (not process feedback)", () => {
    // 截图里的回归：mixed message 含 `• …` 中文项目符号 + 反引号 inline code，被错误折叠到 process。
    const plan = [
      "第 1 步：重写 EventManager",
      "",
      "按你的选择：",
      "",
      "• `EventArgs` 改名为 `BaseEventArgs`，放进 namespace `PixelFarmTD.Core`",
      "• `Subscribe<T>` 返回 `ISubscriptionToken`，`Token.Unsubscribe()` 精准取消",
      "• Legacy API 保留原签名",
    ].join("\n")
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("plan", plan), toolPart("write")], "tool-calls"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["response", "process"])
  })

  it("keeps a short stop response visible even when its message contains a tool", () => {
    const segments = segmentAssistantTimeline([
      message("a1", [toolPart("lookup"), textPart("answer", "Done. The page is ready.")], "stop"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["process", "response"])
  })

  it("folds intermediate stop text into process; only the final text stays visible", () => {
    // 中间 stop 消息（中间结果）不是最后输出，同样属于处理过程——对话只分
    // "处理过程 + 结果"两部分，中间文字不会把 process 段切开成多个状态条。
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("progress-1", "Checking data."), toolPart("tool-1")], "tool-calls"),
      message("a2", [textPart("interim", "## Interim result\n\nUseful result")], "stop"),
      message("a3", [textPart("progress-2", "Saving the result."), toolPart("tool-2")], "tool-calls"),
      message("a4", [textPart("final", "All saved.")], "stop"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["process", "response"])
    const processTextIds = segments
      .filter((segment) => segment.kind === "process")
      .flatMap((segment) => segment.blocks)
      .filter(({ block }) => block.kind === "text")
      .map(({ block }) => block.kind === "text" && block.part.partId)
    expect(processTextIds).toEqual(["progress-1", "interim", "progress-2"])
    expect(textFromTimelineBlocks(segments[1]?.blocks ?? [])).toBe("All saved.")
  })

  it("reconstructs process messages without unrelated response parts", () => {
    const source = message("a1", [textPart("progress", "Checking data."), toolPart("tool-1")], "tool-calls")
    const processBlocks =
      segmentAssistantTimeline([source, message("a2", [textPart("final", "Done.")], "stop")])[0]?.blocks ?? []

    expect(assistantMessagesFromTimelineBlocks(processBlocks)).toEqual([source])
  })

  it("treats the last plain text in a tool-calls message as the final response", () => {
    // 真实回合：最后一条消息 = 思考 + 正文 + 收尾工具，finish=tool-calls。
    // 正文（最后一段文字）独立成 response 保持可见；思考/工具/收尾工具全部收进单个
    // process 段（一回合一个状态条）。
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("progress", "现在检查一下实际生成的 CSS："), toolPart("grep")], "tool-calls"),
      message("a2", [textPart("answer", "已修复 ✅ 收起按钮已移除，只保留顶部那个。"), toolPart("bash")], "tool-calls"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["process", "response"])
    const trailingTool = segments[0]?.blocks.at(-1)?.block
    expect(trailingTool?.kind).toBe("tools")
    expect(textFromTimelineBlocks(segments[1]?.blocks ?? [])).toBe(
      "已修复 ✅ 收起按钮已移除，只保留顶部那个。",
    )
  })

  it("keeps an earlier process message folded even when a trailing tool follows the final text", () => {
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("progress", "让我先读一下文件。"), toolPart("read")], "tool-calls"),
      message("a2", [textPart("answer", "方案确认，现在动手。"), toolPart("edit")], "tool-calls"),
    ])
    const processBlocks = segments
      .filter((segment) => segment.kind === "process")
      .flatMap((segment) => segment.blocks)

    expect(processBlocks.map(({ block }) => (block.kind === "text" ? block.part.partId : block.kind))).toEqual([
      "progress",
      "tools",
      "tools",
    ])
  })

  it("keeps intermediate tool-message text in process while the last message has no text yet", () => {
    // live 稳定性：流式中最后一条消息还没出正文（只有工具），中间消息的过程叙述
    // 即使当前是"全局最后一段文字"也不能判成正文漏在「处理中」外面。
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("narrate", "让我先读一下文件。"), toolPart("read")], "tool-calls"),
      message("a2", [toolPart("bash")], "tool-calls"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["process"])
    expect(timelineHasVisibleOutcome(segments)).toBe(false)
  })

  it("folds intermediate narration with inline code into process; only the last text is the response", () => {
    // 用户真实回合：中间过程叙述带 inline code（`onCollapse`/`PanelHeader`）不应显示成正文，
    // 只有最后一段正文独立可见，其余思考/工具/文字全部收进单个 process 段。
    const segments = segmentAssistantTimeline([
      message("a1", [textPart("narrate-1", "Now remove `onCollapse` from the content"), toolPart("edit")], "tool-calls"),
      message(
        "a2",
        [
          textPart("narrate-2", "明白了，`PanelHeader` 里有一个收起按钮，让我去看看。"),
          toolPart("read"),
        ],
        "tool-calls",
      ),
      message("a3", [textPart("answer", "已修复 ✅ 只保留顶部那一个。"), toolPart("bash")], "tool-calls"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual(["process", "response"])
    const processTextIds = segments
      .filter((segment) => segment.kind === "process")
      .flatMap((segment) => segment.blocks)
      .filter(({ block }) => block.kind === "text")
      .map(({ block }) => block.kind === "text" && block.part.partId)
    expect(processTextIds).toEqual(["narrate-1", "narrate-2"])
    expect(textFromTimelineBlocks(segments[1]?.blocks ?? [])).toBe("已修复 ✅ 只保留顶部那一个。")
  })
})

it("keeps a question turn as a single process segment (no second status bar)", () => {
  // 用户真实场景：提问消息（思考+问题上下文+question 工具）+ 回答后模型继续的工具轮。
  // 问题上下文必须收进 process——否则独立成 response 段会把 process 切成两半，
  // 同回合出现两个状态条（两个"处理中"）。
  const segments = segmentAssistantTimeline([
    message(
      "a1",
      [textPart("context", "需要你确认目标页面。"), questionPart("question"), toolPart("tool-1")],
      "tool-calls",
    ),
    message("a2", [toolPart("tool-2")], "tool-calls"),
  ])

  expect(segments.map((segment) => segment.kind)).toEqual(["process"])
})

it("keeps tool errors inside the process segment (single status bar)", () => {
  // 工具出错（error 块）若独立成 response 段会把 process 切开 → 两个状态条。
  const segments = segmentAssistantTimeline([
    message("a1", [toolPart("tool-1"), errorPart("err-1"), toolPart("tool-2")], "tool-calls"),
    message("a2", [textPart("final", "Done.")], "stop"),
  ])
  // error 归 process 后，工具回合 + 错误保持单 process 段结构。
  const errorSegments = segmentAssistantTimeline([message("a3", [errorPart("err-1")])])
  expect(segments.map((segment) => segment.kind)).toEqual(["process", "response"])
  expect(errorSegments.map((segment) => segment.kind)).toEqual(["process"])
})

function errorPart(partId: string): ChatMessagePart {
  return { kind: "error", partId, errorText: "工具执行失败" }
}

it("keeps narration text before tools in an active turn (no live→settle jump)", () => {
  // live：中间消息 [叙述文字, 工具] 正在流式时是"最后消息"，若文字临时当正文、
  // 工具收尾并入正文前，后续消息到达后文字又收回 process → 文字/工具顺序跳变。
  const activeSegments = segmentAssistantTimeline(
    [message("m1", [textPart("narrate", "让我检查一下。"), toolPart("tool-1")], "tool-calls")],
    { active: true },
  )
  expect(activeSegments.map((segment) => segment.kind)).toEqual(["process"])
  const processBlocks = activeSegments[0]?.blocks ?? []
  expect(processBlocks.map(({ block }) => (block.kind === "text" ? "text" : block.kind))).toEqual([
    "text",
    "tools",
  ])

  // settled（回合结束）：同一结构下最后文字作为正文（收尾工具场景保留）——
  // 单消息无前置 process 段，工具独立成段且在文字之后（文字在工具前）。
  const settledSegments = segmentAssistantTimeline(
    [message("m1", [textPart("narrate", "让我检查一下。"), toolPart("tool-1")], "tool-calls")],
    { active: false },
  )
  expect(settledSegments.map((segment) => segment.kind)).toEqual(["response", "process"])
})
