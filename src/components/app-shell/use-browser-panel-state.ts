import type { BrowserPageState } from "../../../electron/browser/common.ts"
import type { AppShellRoute as Route } from "./app-shell-types.ts"

import * as React from "react"
import { useBrowserService } from "@/components/AppContext"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"

interface UseBrowserPanelStateOptions {
  activeSessionId: string | null
  route: Route
}

interface UseBrowserPanelStateResult {
  browserPanelOpen: boolean
  browserPanelVisible: boolean
  browserState: BrowserPageState | null
  closeBrowserPanel: () => void
  toggleBrowserPanel: () => void
}

export function useBrowserPanelState({
  activeSessionId,
  route,
}: UseBrowserPanelStateOptions): UseBrowserPanelStateResult {
  const browserService = useBrowserService()
  const [browserPanelOpen, setBrowserPanelOpen] = React.useState(false)
  const [browserState, setBrowserState] = React.useState<BrowserPageState | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let receivedStateEvent = false

    // 会话级状态：切换会话/工作区时重置，避免上一个会话的浏览器请求状态
    // 在 AppShell 里触发"切到别的会话后右侧面板自动打开"。
    setBrowserState(null)
    setBrowserPanelOpen(false)

    if (!activeSessionId) return

    const offState = browserService.serverEvents.on("stateChanged", (state) => {
      if (state.sessionId !== activeSessionId) return
      receivedStateEvent = true
      setBrowserState(state)
    })
    const offRequested = browserService.serverEvents.on("browserRequested", ({ sessionId }) => {
      if (sessionId !== activeSessionId) return
      receivedStateEvent = true
      setBrowserPanelOpen(true)
    })
    const offRemoved = browserService.serverEvents.on("pageRemoved", ({ sessionId }) => {
      if (sessionId !== activeSessionId) return
      receivedStateEvent = true
      setBrowserState(null)
      setBrowserPanelOpen(false)
    })

    // 只回填状态供渲染（浏览器 tab 打开时显示内容）；面板展开只由 browserRequested 驱动。
    // 不再在切回会话时自动打开面板——用户手动关闭面板后，切到其他会话再切回不应"又自动打开"
    // （browserPanelOpen 残留/回填恢复会让右侧面板在每个有浏览器活动的会话上自动弹开）。
    void browserService
      .invoke("getState", activeSessionId)
      .then((state) => {
        if (cancelled || receivedStateEvent) return
        setBrowserState(state)
      })
      .catch((cause: unknown) => {
        reportRendererHandledError("browser", "read browser page state failed", cause)
      })

    return () => {
      cancelled = true
      offState()
      offRequested()
      offRemoved()
    }
  }, [activeSessionId, browserService])

  const closeBrowserPanel = React.useCallback(() => {
    setBrowserPanelOpen(false)
    if (activeSessionId) {
      void browserService.invoke("hide", activeSessionId).catch((cause: unknown) => {
        reportRendererHandledError("browser", "hide browser page failed", cause)
      })
    }
  }, [activeSessionId, browserService])

  const toggleBrowserPanel = React.useCallback(() => {
    if (!browserState) return
    setBrowserPanelOpen((open) => !open)
  }, [browserState])

  return {
    browserPanelOpen,
    // 不依赖 browserState !== null：切换 session 时 getState 是异步回填的，若要求
    // browserState 就绪才可见，切换瞬间 browserPanelVisible 会掉到 false，使右面板整体
    // pointer-events-none，两个 resize handle 全部失效（从其它对话/面板切回来时左侧拖不动、
    // 右侧会命中原生窗口边框导致主界面跟着缩放）。切换时保留面板开状态，内容区由
    // browserState 是否已就绪决定渲染（为空时显示 loading），handle 始终可用。
    browserPanelVisible: route === "chat" && browserPanelOpen,
    browserState,
    closeBrowserPanel,
    toggleBrowserPanel,
  }
}
