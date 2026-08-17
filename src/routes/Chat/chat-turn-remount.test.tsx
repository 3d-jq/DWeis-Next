// @vitest-environment happy-dom

import type { ChatMessage } from "../../../electron/chat/common.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { ChatTurnView } from "./ChatTimeline.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

// React 19 要求显式声明 act 环境。
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// 显示测试只关心结构稳定性，mock 掉重型渲染组件（markdown/streamdown/附件/tooltip）。
vi.mock("@/components/ai-elements/message", () => ({
  Message: ({ children }: { children?: React.ReactNode }) => children,
  MessageContent: ({ children }: { children?: React.ReactNode }) => children,
  MessageActions: () => null,
  MessageResponse: () => null,
  MessageAction: () => null,
}))
vi.mock("@/components/ai-elements/message-image", () => ({ MarkdownImage: () => null }))
vi.mock("./ChatErrorNotice.tsx", () => ({ ChatErrorNotice: () => null }))
vi.mock("./ChatMessageActions.tsx", () => ({
  AssistantMessageActions: () => null,
  CopyMessageAction: () => null,
  MessageTimestamp: () => null,
}))
vi.mock("./ChatAttachments.tsx", () => ({ AttachmentList: () => null }))
vi.mock("./ContextMentionChips.tsx", () => ({ ContextMentionChips: () => null }))
vi.mock("./GeneratedArtifacts.tsx", () => ({ GeneratedArtifacts: () => null }))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: () => null,
  TooltipContent: () => null,
  TooltipTrigger: () => null,
  TooltipProvider: () => null,
}))
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children?: React.ReactNode }) => children,
  CollapsibleContent: ({ children }: { children?: React.ReactNode }) => children,
  CollapsibleTrigger: ({ children }: { children?: React.ReactNode }) => children,
}))
vi.mock("./LoadingShimmerText.tsx", () => ({ LoadingShimmerText: () => null }))

const EMPTY = new Map()

function turnWithReasoning() {
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
}

function renderTurn(props: { turnInFlight: boolean; isLatestTurn: boolean; activeAssistantMessageId?: string }) {
  const t = (key: string, vars?: Record<string, unknown>): string => translate("zh-CN", key as never, vars as never)
  return React.createElement(
    I18nContext.Provider,
    { value: { locale: "zh-CN", setLocale: () => undefined, t } },
    React.createElement(ChatTurnView, {
      activeSessionId: "s1",
      artifactGroups: [],
      artifactGroupsByMessageId: EMPTY,
      turnOutputRecordsByMessage: EMPTY,
      turnOutputRecord: null,
      turn: turnWithReasoning() as never,
      activity: null as never,
      activeAssistantMessageId: props.activeAssistantMessageId,
      turnInFlight: props.turnInFlight,
      isLatestTurn: props.isLatestTurn,
      smoothAssistantMessageId: undefined,
      onRecover: () => Promise.resolve(),
      onRetryFresh: () => Promise.resolve(),
      onArtifactsAvailable: () => undefined,
      onArtifactsOpen: () => undefined,
      onTurnOutputOpen: () => undefined,
      onViewBilling: () => undefined,
    }),
  )
}

describe("ChatTurnView UI stability on send", () => {
  it("keeps the reasoning row DOM node when a new message is sent (no remount)", () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    act(() => {
      root.render(renderTurn({ turnInFlight: false, isLatestTurn: true }))
    })
    const firstReasoning = host.querySelector('[role="button"][aria-expanded]')
    expect(firstReasoning).not.toBeNull()
    expect(host.textContent).toContain("深度思考")

    // 发消息后：旧回合从最新变历史，turnInFlight 全局翻转，active 消息 id 变成新回合的
    act(() => {
      root.render(renderTurn({ turnInFlight: true, isLatestTurn: false, activeAssistantMessageId: "new-id" }))
    })
    const secondReasoning = host.querySelector('[role="button"][aria-expanded]')
    // 同一 DOM 节点 = 未重挂载（"消失再出现"的抖动来自重挂载）
    expect(secondReasoning).toBe(firstReasoning)
    expect(host.textContent).toContain("深度思考")

    act(() => root.unmount())
  })
})
