// @vitest-environment happy-dom

import type { ChatMessage } from "../../../electron/chat/common.ts"

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PlanSummaryPanel } from "./PlanSummaryPanel.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

// React 19 要求显式声明 act 环境，否则 happy-dom 下每次渲染都会警告。
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"

// useChatService mock：getPlanMarkdown 返回 null（无计划文件），questionAsked 退订函数。
vi.mock("@/components/AppContext", () => ({
  useChatService: () => ({
    invoke: vi.fn(async () => null),
    serverEvents: { on: vi.fn(() => () => undefined) },
  }),
}))

function todoMessage(todos: unknown[]): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    createdAt: 1,
    parts: [{ kind: "tool", partId: "p1", callId: "c1", tool: "todowrite", status: "completed", input: { todos } }],
  }
}

function render(todos: unknown[], open = true): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
      React.createElement(PlanSummaryPanel, {
        activeSessionId: "session-1",
        messages: [todoMessage(todos)],
        onOpenChange: () => undefined,
        open,
      }),
    ),
  )
}

const sessionKey = "session-1"
const dismissedSnapshotKey = `dweis:chat:plan-panel-dismissed-snapshot.${sessionKey}`

describe("PlanSummaryPanel", () => {
  it("renders nothing when closed (open=false)", () => {
    const todos = [{ content: "任务", status: "pending" }]
    expect(render(todos, false)).toBe("")
  })

  it("renders nothing when there are no todo tool calls", () => {
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", createdAt: 1, parts: [{ kind: "text", partId: "p1", text: "hi" }] },
    ]
    expect(
      renderToStaticMarkup(
        React.createElement(
          I18nContext.Provider,
          { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
          React.createElement(PlanSummaryPanel, {
            activeSessionId: "session-1",
            messages,
            onOpenChange: () => undefined,
            open: true,
          }),
        ),
      ),
    ).toBe("")
  })

  it("shows completed/total count and progress on the capsule", () => {
    const html = render([
      { content: "调研模块结构", status: "completed" },
      { content: "设计新接口", status: "in_progress" },
      { content: "实现迁移逻辑", status: "pending" },
      { content: "跑测试验证", status: "pending" },
    ])
    expect(html).toContain("计划")
    expect(html).toContain("1/4")
  })

  it("expands to list every task with status icons", () => {
    const html = render([
      { content: "调研模块结构", status: "completed" },
      { content: "设计新接口", status: "in_progress" },
      { content: "实现迁移逻辑", status: "pending" },
    ])
    expect(html).toContain("调研模块结构")
    expect(html).toContain("设计新接口")
    expect(html).toContain("实现迁移逻辑")
    // AICSS 三态行图标：完成=勾、进行中=箭头、待办=虚线圆。
    expect(html).toContain("oo-todo-item done")
    expect(html).toContain("oo-todo-item active")
    expect(html).toContain("oo-todo-icon on")
  })

  it("uses the latest todo tool call as the source of truth", () => {
    const messages: ChatMessage[] = [
      todoMessage([
        { content: "旧任务", status: "pending" },
        { content: "已废弃", status: "pending" },
      ]),
      todoMessage([{ content: "新任务", status: "completed" }]),
    ]
    const html = renderToStaticMarkup(
      React.createElement(
        I18nContext.Provider,
        { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
        React.createElement(PlanSummaryPanel, {
          activeSessionId: "session-1",
          messages,
          onOpenChange: () => undefined,
          open: true,
        }),
      ),
    )
    expect(html).toContain("新任务")
    expect(html).not.toContain("旧任务")
    expect(html).toContain("计划")
    expect(html).toContain("1/1")
  })

  describe("auto reopen on todo change", () => {
    afterEach(() => {
      localStorage.clear()
    })

    async function renderLive(
      messages: ChatMessage[],
      opts: { initialOpen?: boolean; onOpenChange?: (open: boolean) => void } = {},
    ) {
      const host = document.createElement("div")
      document.body.append(host)
      const root = createRoot(host)
      await act(async () => {
        root.render(
          React.createElement(
            I18nContext.Provider,
            { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
            React.createElement(PlanSummaryPanel, {
              activeSessionId: "session-1",
              messages,
              onOpenChange: opts.onOpenChange ?? (() => undefined),
              open: opts.initialOpen ?? true,
            }),
          ),
        )
      })
      return { host, root }
    }

    it("关闭后任务清单与关闭时快照一致 → 保持关闭", async () => {
      const todos = [{ content: "任务", status: "completed" }]
      const onOpenChange = vi.fn()
      localStorage.setItem(dismissedSnapshotKey, JSON.stringify(todos))
      const { host, root } = await renderLive([todoMessage(todos)], { initialOpen: false, onOpenChange })
      expect(host.textContent).not.toContain("任务")
      expect(onOpenChange).not.toHaveBeenCalled()
      act(() => root.unmount())
    })

    it("关闭后任务清单与关闭时快照不一致 → 自动重新呼出", async () => {
      const onOpenChange = vi.fn()
      localStorage.setItem(dismissedSnapshotKey, JSON.stringify([{ content: "旧任务", status: "completed" }]))
      const { host, root } = await renderLive([todoMessage([{ content: "新任务", status: "pending" }])], {
        initialOpen: false,
        onOpenChange,
      })
      expect(host.textContent).not.toContain("新任务")
      expect(onOpenChange).toHaveBeenCalledWith(true)
      act(() => root.unmount())
    })

    it("open=true 时关闭（true→false）记录当前快照", async () => {
      const todos = [{ content: "任务", status: "completed" }]
      const host = document.createElement("div")
      document.body.append(host)
      const root = createRoot(host)
      await act(async () => {
        root.render(
          React.createElement(
            I18nContext.Provider,
            { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
            React.createElement(PlanSummaryPanel, {
              activeSessionId: "session-1",
              messages: [todoMessage(todos)],
              onOpenChange: () => undefined,
              open: true,
            }),
          ),
        )
      })
      // 模拟用户点击侧边栏按钮关闭（open 由 true→false）
      await act(async () => {
        root.render(
          React.createElement(
            I18nContext.Provider,
            { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
            React.createElement(PlanSummaryPanel, {
              activeSessionId: "session-1",
              messages: [todoMessage(todos)],
              onOpenChange: () => undefined,
              open: false,
            }),
          ),
        )
      })
      expect(localStorage.getItem(dismissedSnapshotKey)).toBe(JSON.stringify(todos))
      act(() => root.unmount())
    })
  })
})

import { subTasksFromMessages } from "./sub-tasks.ts"

describe("subTasksFromMessages", () => {
  it("extracts task tool parts with description, agent type, status and timing", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "assistant",
        createdAt: 1,
        parts: [
          {
            kind: "tool",
            partId: "t1",
            callId: "c1",
            tool: "task",
            status: "running",
            input: { description: "重构右侧面板", subagent_type: "build" },
            timing: { start: 1000 },
          },
          {
            kind: "tool",
            partId: "t2",
            callId: "c2",
            tool: "task",
            status: "completed",
            input: { description: "制定测试方案", subagent_type: "plan" },
            timing: { start: 2000, end: 5000 },
          },
          { kind: "tool", partId: "b1", callId: "c3", tool: "bash", status: "completed", input: {} },
        ],
      },
    ]

    const tasks = subTasksFromMessages(messages)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({
      partId: "t1",
      description: "重构右侧面板",
      agentType: "build",
      status: "running",
      start: 1000,
    })
    expect(tasks[1]).toMatchObject({ description: "制定测试方案", agentType: "plan", status: "completed", end: 5000 })
  })

  it("returns empty when there are no task tool parts", () => {
    expect(subTasksFromMessages([])).toEqual([])
  })
})
