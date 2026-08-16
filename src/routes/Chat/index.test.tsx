// @vitest-environment happy-dom

import type { ChatMessage } from "../../../electron/chat/common.ts"
import type { ChatSendResult } from "@/components/app-shell/app-shell-model"
import type { UserFacingError } from "@/lib/user-facing-error"

// React 19 要求显式声明 act 环境，否则 happy-dom 下每次渲染都会警告。
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ChatArea } from "./index.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

// 重子组件桩：ChatArea 是容器，测试聚焦其四条渲染路径（空态/时间线/引导/启动错误），
// 子组件以哨兵文本代替，避免拉入 Composer/Timeline 的深层依赖。
vi.mock("./ChatComposer.tsx", () => ({
  ChatComposer: () => "stub:composer",
}))
vi.mock("./ChatTimeline.tsx", () => ({
  ChatTimeline: () => "stub:timeline",
}))
vi.mock("./FullAccessConfirmDialog.tsx", () => ({
  FullAccessConfirmDialog: () => null,
}))
// ChatArea 内含 PlanSummaryPanel（useChatService 读计划文件）：mock AppContext 避免缺 Provider。
vi.mock("@/components/AppContext", () => ({
  useChatService: () => ({
    invoke: vi.fn(async () => null),
    serverEvents: { on: vi.fn(() => () => undefined) },
  }),
}))

const i18n = {
  locale: "zh-CN" as const,
  setLocale: () => undefined,
  t: (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("zh-CN", key, vars),
}

function noop(): void {
  // 测试桩回调
}

const startupError: UserFacingError = {
  area: "agent",
  kind: "agent_unavailable",
  severity: "destructive",
  titleKey: "error.agent.title",
  descriptionKey: "error.agent.description",
}

interface ChatAreaOverrides {
  bootstrapping?: boolean
  emptyTitle?: string
  messages?: ChatMessage[]
  showEmptyState?: boolean
  startupError?: UserFacingError | null
}

async function renderChatArea(overrides: ChatAreaOverrides = {}) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <I18nContext.Provider value={i18n}>
        <ChatArea
          activeSessionId="session-1"
          composerDraftKey="draft-1"
          composerFocusRequest={0}
          messages={overrides.messages ?? []}
          knowledgeBaseIds={[]}
          knowledgeEnabled={false}
          knowledgeError={null}
          knowledgeItems={[]}
          knowledgeLoading={false}
          permissionMode="default"
          pendingPermissions={[]}
          pendingQuestions={[]}
          status="ready"
          activity={null}
          showEmptyState={overrides.showEmptyState ?? true}
          bootstrapping={overrides.bootstrapping ?? false}
          startupError={overrides.startupError ?? null}
          error={null}
          emptyTitle={overrides.emptyTitle}
          historyScope="test"
          submitDisabled={false}
          willQueueMessage={false}
          initialSendPending={false}
          queueHeld={false}
          queuedMessages={[]}
          placeholder="输入消息…"
          questionDrafts={{
            read: () => null,
            remove: () => undefined,
            write: () => undefined,
          }}
          onSend={vi.fn(async (): Promise<ChatSendResult> => ({ delivery: "sent", status: "accepted" }))}
          onPermissionModeChange={noop}
          onAnswerQuestion={vi.fn(async () => undefined)}
          onAnswerPermission={vi.fn(async () => undefined)}
          onRejectQuestion={vi.fn(async () => undefined)}
          onStop={noop}
          onQueuedMessageMove={noop}
          onQueuedMessageRemove={noop}
          onQueuedMessageResume={noop}
          onRecover={vi.fn(async () => undefined)}
          onRetryFresh={vi.fn(async () => undefined)}
          onArtifactsOpen={noop}
          onArtifactsAvailable={noop}
          onTurnOutputOpen={noop}
          onTurnOutputAvailable={noop}
          onSelectKnowledgeBase={noop}
        />
      </I18nContext.Provider>,
    )
  })
  return { host, root }
}

describe("ChatArea 渲染路径", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("空态路径：无消息时渲染居中空态标题与输入区，不渲染时间线", async () => {
    const { host, root } = await renderChatArea({ emptyTitle: "开始对话" })

    const emptyTitle = host.querySelector("h2")
    expect(emptyTitle?.textContent).toContain("开始对话")
    expect(host.textContent).toContain("stub:composer")
    expect(host.textContent).not.toContain("stub:timeline")

    act(() => root.unmount())
  })

  it("时间线路径：有消息时渲染时间线与输入区", async () => {
    const { host, root } = await renderChatArea({
      messages: [{ id: "m-1", role: "user", parts: [], createdAt: 0 }],
      showEmptyState: false,
    })

    expect(host.textContent).toContain("stub:timeline")
    expect(host.textContent).toContain("stub:composer")

    act(() => root.unmount())
  })

  it("引导路径：bootstrapping 时渲染骨架屏且不渲染输入区", async () => {
    const { host, root } = await renderChatArea({ bootstrapping: true })

    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(host.textContent).not.toContain("stub:composer")
    expect(host.textContent).not.toContain("stub:timeline")

    act(() => root.unmount())
  })

  it("启动错误路径：渲染错误提示且不渲染输入区与时间线", async () => {
    const { host, root } = await renderChatArea({ startupError })

    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull()
    expect(host.textContent).not.toContain("stub:composer")
    expect(host.textContent).not.toContain("stub:timeline")

    act(() => root.unmount())
  })
})
