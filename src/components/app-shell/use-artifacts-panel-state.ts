import type { AppShellRoute as Route } from "./app-shell-types.ts"

import * as React from "react"
import {
  artifactsPanelMaxWidth,
  ARTIFACTS_PANEL_MIN_WIDTH_PX,
  ARTIFACTS_PANEL_WIDTH_STORAGE_KEY,
  BROWSER_PANEL_WIDTH_STORAGE_KEY,
  clampArtifactsPanelWidthForLayout,
  readStoredArtifactsPanelWidth,
  readStoredBrowserPanelWidth,
} from "./app-shell-model.ts"

interface UseArtifactsPanelStateOptions {
  activeSessionId: string | null
  appChromeRef: React.RefObject<HTMLDivElement | null>
  /** 当前激活标签是否为浏览器（决定面板宽度取哪套持久化值）。 */
  browserActive: boolean
  route: Route
  setIsSidebarRestoring: React.Dispatch<React.SetStateAction<boolean>>
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  sidebarCollapsed: boolean
  sidebarWidth: number
}

interface UseArtifactsPanelStateResult {
  artifactsPanelContentRef: React.RefObject<HTMLDivElement | null>
  artifactsPanelIsMaximized: boolean
  artifactsPanelMaxWidthState: number | null
  artifactsPanelOpen: boolean
  artifactsPanelShellRef: React.RefObject<HTMLDivElement | null>
  artifactsPanelVisible: boolean
  handleArtifactsPanelResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  handleArtifactsPanelResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  isArtifactsPanelResizing: boolean
  rightPanelVisible: boolean
  setArtifactsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  setArtifactsPanelMaximizedState: (maximized: boolean) => void
  visibleRightPanelWidth: number
}

export function useArtifactsPanelState({
  activeSessionId,
  appChromeRef,
  browserActive,
  route,
  setIsSidebarRestoring,
  setSidebarCollapsed,
  sidebarCollapsed,
  sidebarWidth,
}: UseArtifactsPanelStateOptions): UseArtifactsPanelStateResult {
  const [artifactsPanelOpen, setArtifactsPanelOpen] = React.useState(false)
  const [artifactsPanelMaximized, setArtifactsPanelMaximized] = React.useState(false)
  const [artifactsPanelWidth, setArtifactsPanelWidth] = React.useState(readStoredArtifactsPanelWidth)
  const [browserPanelWidth, setBrowserPanelWidth] = React.useState(readStoredBrowserPanelWidth)
  const [artifactsPanelMaxWidthState, setArtifactsPanelMaxWidthState] = React.useState<number | null>(null)
  const [isArtifactsPanelResizing, setIsArtifactsPanelResizing] = React.useState(false)
  const artifactsPanelResizeStart = React.useRef<{
    browser: boolean
    pointerX: number
    width: number
  } | null>(null)
  const artifactsPanelResizeFrame = React.useRef<number | null>(null)
  const artifactsPanelPendingWidth = React.useRef<number | null>(null)
  const artifactsPanelSidebarRestore = React.useRef<boolean | null>(null)
  const sidebarCollapsedRef = React.useRef(sidebarCollapsed)
  const artifactsPanelShellRef = React.useRef<HTMLDivElement | null>(null)
  const artifactsPanelContentRef = React.useRef<HTMLDivElement | null>(null)
  const artifactsPanelMaxWidthValue = artifactsPanelMaxWidthState ?? Number.POSITIVE_INFINITY
  const artifactsPanelVisible = route === "chat" && artifactsPanelOpen
  const rightPanelVisible = artifactsPanelVisible
  const artifactsPanelIsMaximized = artifactsPanelVisible && artifactsPanelMaximized
  const preferredRightPanelWidth = browserActive ? browserPanelWidth : artifactsPanelWidth
  const visibleRightPanelWidth = clampArtifactsPanelWidthForLayout(
    preferredRightPanelWidth,
    artifactsPanelMaxWidthValue,
  )

  React.useEffect(() => {
    sidebarCollapsedRef.current = sidebarCollapsed
  }, [sidebarCollapsed])

  const clampArtifactsPanelWidthToLayout = React.useCallback(
    (width: number): number => clampArtifactsPanelWidthForLayout(width, artifactsPanelMaxWidthValue),
    [artifactsPanelMaxWidthValue],
  )

  const applyRightPanelWidth = React.useCallback((width: number): void => {
    appChromeRef.current?.style.setProperty("--right-panel-width", `${width}px`)
  }, [appChromeRef])

  const clearArtifactsPanelContentWidth = React.useCallback((): void => {
    const element = artifactsPanelContentRef.current
    if (element) {
      element.style.removeProperty("width")
    }
  }, [])

  const restoreSidebarAfterArtifactsMaximize = React.useCallback((): void => {
    const previousCollapsed = artifactsPanelSidebarRestore.current
    if (previousCollapsed === null) {
      return
    }
    artifactsPanelSidebarRestore.current = null
    const currentCollapsed = sidebarCollapsedRef.current
    if (currentCollapsed === previousCollapsed) {
      return
    }
    if (currentCollapsed) {
      setIsSidebarRestoring(true)
    }
    setSidebarCollapsed(previousCollapsed)
  }, [setIsSidebarRestoring, setSidebarCollapsed])

  const setArtifactsPanelMaximizedState = React.useCallback(
    (maximized: boolean): void => {
      if (maximized) {
        if (artifactsPanelSidebarRestore.current === null) {
          artifactsPanelSidebarRestore.current = sidebarCollapsedRef.current
        }
        setSidebarCollapsed(true)
        setArtifactsPanelMaximized(true)
        return
      }

      setArtifactsPanelMaximized(false)
      restoreSidebarAfterArtifactsMaximize()
    },
    [restoreSidebarAfterArtifactsMaximize, setSidebarCollapsed],
  )

  React.useEffect(() => {
    setArtifactsPanelOpen(false)
    setArtifactsPanelMaximizedState(false)
  }, [activeSessionId, setArtifactsPanelMaximizedState])

  // appChromeRef 挂载的 .oo-app-chrome 容器在 settings/billing/archived 路由下会被整体卸载
  // （AppShell 早期返回），返回 chat 时重新挂载的是新 DOM 节点。把 route 加入依赖，确保：
  //   1. ResizeObserver 重新观测新节点（否则只盯着已 detach 的旧节点，maxWidth 不再更新）；
  //   2. 下方 applyRightPanelWidth 重新写入内联 CSS 变量（旧节点的内联样式随卸载丢失）。
  React.useLayoutEffect(() => {
    const element = appChromeRef.current
    if (!element) {
      return
    }

    const updateArtifactsPanelBounds = (): void => {
      const appWidth = element.clientWidth
      const maxWidth = artifactsPanelMaxWidth(appWidth, sidebarWidth, sidebarCollapsed)

      setArtifactsPanelMaxWidthState(maxWidth)
    }

    updateArtifactsPanelBounds()
    const observer = new ResizeObserver(updateArtifactsPanelBounds)
    observer.observe(element)
    return () => observer.disconnect()
  }, [appChromeRef, route, sidebarCollapsed, sidebarWidth])

  // 非拖拽态：把 visibleRightPanelWidth 同步到 CSS variable（响应窗口 resize 的 maxWidth clamp）。
  // 拖拽态由 handlePointerUp 里的 applyRightPanelWidth 接管，这里跳过避免竞态。
  // route 入依赖：从 settings 等早期返回路由切回 chat 时 appChrome 容器是全新 DOM 节点，
  // 旧节点上的内联 --right-panel-width 已随卸载丢失，这里需重写，否则面板宽度回退到 0px。
  React.useEffect(() => {
    if (isArtifactsPanelResizing) return
    applyRightPanelWidth(visibleRightPanelWidth)
  }, [applyRightPanelWidth, isArtifactsPanelResizing, route, visibleRightPanelWidth])

  React.useEffect(() => {
    try {
      globalThis.localStorage?.setItem(ARTIFACTS_PANEL_WIDTH_STORAGE_KEY, String(artifactsPanelWidth))
    } catch {
      // 本地存储不可用时仅保留本次会话宽度。
    }
  }, [artifactsPanelWidth])

  React.useEffect(() => {
    try {
      globalThis.localStorage?.setItem(BROWSER_PANEL_WIDTH_STORAGE_KEY, String(browserPanelWidth))
    } catch {
      // Keep the width in memory when local storage is unavailable.
    }
  }, [browserPanelWidth])

  React.useEffect(() => {
    if (!isArtifactsPanelResizing) {
      return
    }

    const flushArtifactsPanelWidth = (): void => {
      artifactsPanelResizeFrame.current = null
      const width = artifactsPanelPendingWidth.current
      if (width !== null) {
        applyRightPanelWidth(width)
      }
    }
    const handlePointerMove = (event: PointerEvent): void => {
      const start = artifactsPanelResizeStart.current
      if (!start) {
        return
      }
      artifactsPanelPendingWidth.current = clampArtifactsPanelWidthToLayout(
        start.width + start.pointerX - event.clientX,
      )
      if (artifactsPanelResizeFrame.current === null) {
        artifactsPanelResizeFrame.current = window.requestAnimationFrame(flushArtifactsPanelWidth)
      }
    }
    const handlePointerUp = (): void => {
      if (artifactsPanelResizeFrame.current !== null) {
        window.cancelAnimationFrame(artifactsPanelResizeFrame.current)
        artifactsPanelResizeFrame.current = null
      }
      const width = artifactsPanelPendingWidth.current
      artifactsPanelPendingWidth.current = null
      if (width !== null) {
        applyRightPanelWidth(width)
        if (artifactsPanelResizeStart.current?.browser) {
          setBrowserPanelWidth(width)
        } else {
          setArtifactsPanelWidth(width)
        }
      }
      clearArtifactsPanelContentWidth()
      artifactsPanelResizeStart.current = null
      setIsArtifactsPanelResizing(false)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp, { once: true })
    window.addEventListener("pointercancel", handlePointerUp, { once: true })
    return () => {
      if (artifactsPanelResizeFrame.current !== null) {
        window.cancelAnimationFrame(artifactsPanelResizeFrame.current)
        artifactsPanelResizeFrame.current = null
      }
      artifactsPanelPendingWidth.current = null
      clearArtifactsPanelContentWidth()
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [
    applyRightPanelWidth,
    clampArtifactsPanelWidthToLayout,
    clearArtifactsPanelContentWidth,
    isArtifactsPanelResizing,
  ])

  React.useEffect(() => {
    if (!artifactsPanelVisible && artifactsPanelMaximized) {
      setArtifactsPanelMaximizedState(false)
    }
  }, [artifactsPanelMaximized, artifactsPanelVisible, setArtifactsPanelMaximizedState])

  const handleArtifactsPanelResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!rightPanelVisible) {
        return
      }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const dragStartWidth = visibleRightPanelWidth
      // 同步禁用 transition，避免 React state 异步更新导致首帧 width 被 200ms transition 平滑掉
      appChromeRef.current?.classList.add("oo-artifacts-panel-resizing")
      applyRightPanelWidth(dragStartWidth)
      artifactsPanelResizeStart.current = {
        browser: browserActive,
        pointerX: event.clientX,
        width: dragStartWidth,
      }
      setIsArtifactsPanelResizing(true)
    },
    [
      appChromeRef,
      applyRightPanelWidth,
      artifactsPanelMaxWidthValue,
      browserActive,
      rightPanelVisible,
      visibleRightPanelWidth,
    ],
  )

  const handleArtifactsPanelResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!rightPanelVisible) {
        return
      }

      const step = event.shiftKey ? 24 : 12
      const setPanelWidth = browserActive ? setBrowserPanelWidth : setArtifactsPanelWidth
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        setPanelWidth((width) => clampArtifactsPanelWidthToLayout(width + step))
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        setPanelWidth((width) => clampArtifactsPanelWidthToLayout(width - step))
      } else if (event.key === "Home") {
        event.preventDefault()
        setPanelWidth(ARTIFACTS_PANEL_MIN_WIDTH_PX)
      }
    },
    [browserActive, clampArtifactsPanelWidthToLayout, rightPanelVisible],
  )

  return {
    artifactsPanelContentRef,
    artifactsPanelIsMaximized,
    artifactsPanelMaxWidthState,
    artifactsPanelOpen,
    artifactsPanelShellRef,
    artifactsPanelVisible,
    handleArtifactsPanelResizeKeyDown,
    handleArtifactsPanelResizeStart,
    isArtifactsPanelResizing,
    rightPanelVisible,
    setArtifactsPanelOpen,
    setArtifactsPanelMaximizedState,
    visibleRightPanelWidth,
  }
}
