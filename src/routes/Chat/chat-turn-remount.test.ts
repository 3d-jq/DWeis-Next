import type { ChatMessage } from "../../../electron/chat/common.ts"

import { describe, expect, it } from "vitest"
import { chatTurnViewPropsEqual } from "./chat-turn-view-props.ts"

const EMPTY = new Map()
const EMPTY_GROUPS: never[] = []
const noopRecover = (): Promise<void> => Promise.resolve()
const noop = (): undefined => undefined
const sharedTurn = (() => {
  const user: ChatMessage = {
    id: "u1",
    role: "user",
    createdAt: 1,
    parts: [{ kind: "text", partId: "up1", text: "帮我看看" }],
  }
  const assistant: ChatMessage = {
    id: "a1",
    role: "assistant",
    createdAt: 2,
    parts: [
      { kind: "reasoning", partId: "r1", text: "先分析需求\n再设计方案" },
      { kind: "text", partId: "t1", text: "结果正文" },
    ],
  }
  return { id: "turn-1", user, assistants: [assistant] }
})()

function props(overrides: Partial<Parameters<typeof chatTurnViewPropsEqual>[0]> = {}) {
  return {
    activeSessionId: "s1",
    artifactGroups: EMPTY_GROUPS,
    artifactGroupsByMessageId: EMPTY,
    turnOutputRecordsByMessage: EMPTY,
    turnOutputRecord: null,
    turn: sharedTurn,
    activity: null,
    activeAssistantMessageId: undefined,
    turnInFlight: false,
    isLatestTurn: true,
    smoothAssistantMessageId: undefined,
    onRecover: noopRecover,
    onRetryFresh: noopRecover,
    onArtifactsAvailable: noop,
    onArtifactsOpen: noop,
    onTurnOutputOpen: noop,
    onViewBilling: noop,
    ...overrides,
  } as never
}

describe("chatTurnViewPropsEqual (send stability)", () => {
  it("skips re-render for a historical turn when a new message is sent (turnInFlight/isLatestTurn flip)", () => {
    const before = props({ turnInFlight: false, isLatestTurn: true })
    const after = props({ turnInFlight: true, isLatestTurn: false })
    expect(chatTurnViewPropsEqual(before, after)).toBe(true)
  })

  it("skips re-render for an already-historical turn when turnInFlight flips", () => {
    const before = props({ turnInFlight: false, isLatestTurn: false })
    const after = props({ turnInFlight: true, isLatestTurn: false })
    expect(chatTurnViewPropsEqual(before, after)).toBe(true)
  })

  it("re-renders the latest turn when turnInFlight changes (live status matters)", () => {
    const before = props({ turnInFlight: false, isLatestTurn: true })
    const after = props({ turnInFlight: true, isLatestTurn: true })
    expect(chatTurnViewPropsEqual(before, after)).toBe(false)
  })

  it("ignores a global active message id that does not belong to this turn", () => {
    const before = props({ activeAssistantMessageId: undefined })
    const after = props({ activeAssistantMessageId: "new-message-id" })
    // 新回合的消息 id 不属于旧回合 → 投影后仍相等，跳过重渲染
    expect(chatTurnViewPropsEqual(before, after)).toBe(true)
  })

  it("re-renders when the active message belongs to this turn", () => {
    const before = props({ activeAssistantMessageId: undefined })
    const after = props({ activeAssistantMessageId: "a1" })
    expect(chatTurnViewPropsEqual(before, after)).toBe(false)
  })
})
