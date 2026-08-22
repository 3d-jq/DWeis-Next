// 自定义标题栏的窗口控制按钮：minimize / toggleMaximize / close。
// 渲染到 AppShellMainTitlebar 最右侧；点击通过 dweisnext bridge 调 IPC。
// 按钮容器 [-webkit-app-region:no-drag] 避免被父级 drag 拦截。
import { Maximize2, Minus, Square, X } from "lucide-react"
import * as React from "react"

import { useT } from "@/i18n/i18n"

function useIsMaximized(): boolean {
  const [isMax, setIsMax] = React.useState<boolean>(false)
  React.useEffect(() => {
    let cancelled = false
    const refresh = (): void => {
      // 测试环境（happy-dom / vitest）没有 preload bridge，需空保护。
      if (typeof globalThis.dweisnext?.isWindowMaximized === "function") {
        void globalThis.dweisnext.isWindowMaximized().then((value) => {
          if (!cancelled) setIsMax(value)
        })
      }
    }
    refresh()
    // 监听 maximize / unmaximize 事件；这两个事件是 window 上而不是 document 上的，
    // 没有 preload 桥接，直接挂到 mainWindow 上需要 IPC 转发，所以这里改成定时同步 + 聚焦时刷新。
    // 简单起见：每 500ms 同步一次 + 窗口聚焦时立即同步。开销可忽略。
    const id = window.setInterval(refresh, 500)
    const onFocus = (): void => refresh()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [])
  return isMax
}

export const TitlebarWindowControls = React.memo(function TitlebarWindowControls() {
  // macOS 走原生 traffic light，本组件隐藏。
  // platform 由 preload 的 contextBridge 暴露为 globalThis.dweisnext.platform。
  const isMaximized = useIsMaximized()
  const t = useT()
  if (globalThis.dweisnext?.platform === "darwin") {
    return null
  }
  return (
    <div className="flex shrink-0 items-center [-webkit-app-region:no-drag]" data-slot="titlebar-window-controls">
      <button
        type="button"
        aria-label={t("common.minimize")}
        title={t("common.minimize")}
        onClick={() => globalThis.dweisnext.minimizeWindow()}
        className="oo-titlebar-control grid size-9 place-items-center rounded-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none"
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        aria-label={isMaximized ? t("common.restore") : t("common.maximize")}
        title={isMaximized ? t("common.restore") : t("common.maximize")}
        onClick={() => globalThis.dweisnext.toggleMaximizeWindow()}
        className="oo-titlebar-control grid size-9 place-items-center rounded-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none"
      >
        {isMaximized ? <Square className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label={t("common.close")}
        title={t("common.close")}
        onClick={() => globalThis.dweisnext.closeWindow()}
        className="oo-titlebar-control grid size-9 place-items-center rounded-none text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:bg-destructive focus-visible:text-destructive-foreground focus-visible:outline-none"
      >
        <X className="size-4" />
      </button>
    </div>
  )
})

// useTitlebarDoubleClickMaximize 移到 src/hooks/useTitlebarDoubleClickMaximize.ts（fast refresh 规则）。
