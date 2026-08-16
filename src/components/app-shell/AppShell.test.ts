// @vitest-environment happy-dom

// React 19 要求显式声明 act 环境，否则 happy-dom 下每次渲染都会警告。
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppShell } from "./AppShell.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

// AppShell 是巨型外壳容器：此处把全部外部数据源钩子替换为稳定的空值桩，
// 使测试聚焦于外壳本身的渲染路径（导航侧栏 + 标题栏 + 主内容区）。
const service = {
  invoke: vi.fn(async () => ({ status: "ready" })),
  serverEvents: { on: vi.fn(() => () => undefined) },
}

vi.mock("@/components/AppContext", () => ({
  useAttentionService: () => service,
  useBrowserService: () => service,
  useChatService: () => service,
}))

vi.mock("@/components/AppDataHooks", () => ({
  useSkillInventoryResource: () => ({
    data: null,
    error: null,
    invalidate: vi.fn(),
    isInitialLoading: false,
    isRefreshing: false,
    loading: false,
    refresh: vi.fn(async () => null),
    reset: vi.fn(),
    setData: vi.fn(),
  }),
}))

vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    settings: { knowledgeBaseBetaEnabled: false, persona: "work" },
    loading: false,
    setBrowserEnabled: vi.fn(async () => undefined),
    setCompletionNotificationCondition: vi.fn(async () => undefined),
    setDataDirectory: vi.fn(async () => undefined),
    setKnowledgeBaseBetaEnabled: vi.fn(async () => undefined),
    setNotificationSoundEnabled: vi.fn(async () => undefined),
    setOperatingMode: vi.fn(async () => undefined),
    setPersona: vi.fn(async () => undefined),
    setSelfManagedSetupDismissed: vi.fn(async () => undefined),
    setSubagentModelId: vi.fn(async () => undefined),
    setUnreadBadgeEnabled: vi.fn(async () => undefined),
  }),
}))

vi.mock("@/hooks/useAppUpdate", () => ({
  useAppUpdate: () => ({
    state: null,
    isDownloadInFlight: false,
    isInstallTriggered: false,
    check: vi.fn(async () => null),
    checkAndDownload: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
    setChannel: vi.fn(async () => undefined),
  }),
}))

vi.mock("@/hooks/useAttention", () => ({
  useAttention: () => ({
    hasUnreadSession: () => false,
    hasUnreadTeam: () => false,
    hasUnreadTeams: false,
    notificationCapability: null,
    openSystemNotificationSettings: vi.fn(async () => undefined),
    testCompletionNotification: vi.fn(async () => undefined),
  }),
}))

vi.mock("@/hooks/useChat", () => ({
  useChat: () => ({
    messages: [],
    pendingQuestions: [],
    pendingPermissions: [],
    status: "ready",
    activity: null,
    messagesLoaded: false,
    sessionSnapshotError: null,
    error: null,
    getSessionStatus: () => "ready",
    getSessionRunStartedAt: () => null,
    forgetSession: vi.fn(async () => undefined),
    resetSessionCache: vi.fn(),
    retrySessionSnapshot: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    compact: vi.fn(async () => undefined),
    answerQuestion: vi.fn(async () => undefined),
    answerPermission: vi.fn(async () => undefined),
    rejectQuestion: vi.fn(async () => undefined),
    questionDrafts: {},
    permissionMode: "default",
    setPermissionMode: vi.fn(async () => undefined),
  }),
}))

vi.mock("@/hooks/useKnowledgeBases", () => ({
  useKnowledgeBases: () => ({
    items: [],
    folders: [],
    loading: false,
    busy: null,
    error: null,
    createFolder: vi.fn(async () => null),
    importKnowledgeBase: vi.fn(async () => null),
    loadChapters: vi.fn(async () => undefined),
    move: vi.fn(async () => null),
    removeFolder: vi.fn(async () => false),
    rename: vi.fn(async () => null),
    refresh: vi.fn(async () => undefined),
    remove: vi.fn(async () => false),
    reveal: vi.fn(async () => undefined),
  }),
}))

vi.mock("@/hooks/useProjectGit", () => ({
  useProjectGit: () => ({
    checkoutBranch: vi.fn(async () => null),
    createAndCheckoutBranch: vi.fn(async () => null),
    error: null,
    loading: false,
    refresh: vi.fn(async () => null),
    state: null,
  }),
}))

vi.mock("@/hooks/useRuntimeCapabilities", () => ({
  useRuntimeCapabilities: () => ({
    capabilities: { mode: "local" },
    error: null,
  }),
}))

vi.mock("@/hooks/useSessions", () => ({
  useSessions: () => ({
    sessions: [],
    taskSessions: [],
    projectSessions: [],
    projects: [],
    loaded: true,
    loadedScopeKey: null,
    error: null,
    create: vi.fn(async () => undefined),
    listArchived: vi.fn(async () => []),
    createProject: vi.fn(async () => undefined),
    assignSessionProject: vi.fn(async () => undefined),
    setSessionKnowledgeBases: vi.fn(async () => undefined),
    renameProject: vi.fn(async () => undefined),
    pinProject: vi.fn(async () => undefined),
    archiveProject: vi.fn(async () => undefined),
    removeProject: vi.fn(async () => undefined),
    generateTitle: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    pin: vi.fn(async () => undefined),
    archive: vi.fn(async () => undefined),
    archiveMany: vi.fn(async () => undefined),
    unarchive: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    removeMany: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
  }),
}))

// 懒加载路由桩：外壳测试只验证壳本身，聊天区/任务弹窗用哨兵与空实现替代。
vi.mock("@/routes/Chat", () => ({
  ChatArea: () => "stub:chat-area",
}))
vi.mock("@/routes/Tasks", () => ({
  TasksDialog: () => null,
}))

async function renderAppShell() {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      React.createElement(
        I18nContext.Provider,
        {
          value: {
            locale: "zh-CN",
            setLocale: () => undefined,
            t: (key, vars) => translate("zh-CN", key, vars),
          },
        },
        React.createElement(AppShell),
      ),
    )
  })
  // 冲刷 React.lazy 路由的异步解析（ChatArea 桩模块的 Promise 微任务链）。
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
  return { host, root }
}

describe("AppShell 外壳渲染", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("渲染应用外壳：导航侧栏、标题栏与主内容区", async () => {
    const { host, root } = await renderAppShell()

    expect(host.querySelector(".oo-app-chrome")).not.toBeNull()
    expect(host.querySelector('nav[aria-label="primary"]')).not.toBeNull()
    expect(host.querySelector("header.oo-titlebar")).not.toBeNull()
    expect(host.querySelector("main.oo-content-surface")).not.toBeNull()

    act(() => root.unmount())
  })

  it("默认聊天路由下渲染聊天区与空会话态", async () => {
    const { host, root } = await renderAppShell()

    expect(host.textContent).toContain("stub:chat-area")
    expect(host.textContent).toContain("新对话")

    act(() => root.unmount())
  })
})
