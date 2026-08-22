// 双击标题栏可拖拽区域切换最大化（Windows 习惯）。
// 控件（如按钮）里的双击不触发，避免误操作。
import * as React from "react"

/** 双击标题栏可拖拽区域切换最大化（Windows 习惯）。需要 drag region 的 ref。 */
export function useTitlebarDoubleClickMaximize(
  containerRef: React.RefObject<HTMLElement | null>,
): void {
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDoubleClick = (e: MouseEvent): void => {
      // 只响应标题栏自身的双击，控件里的双击（如按钮）不触发
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest("[data-slot='titlebar-window-controls']")) return
      if (target.closest("button, input, a, select, textarea")) return
      void globalThis.dweisnext.toggleMaximizeWindow()
    }
    el.addEventListener("dblclick", onDoubleClick)
    return () => el.removeEventListener("dblclick", onDoubleClick)
  }, [containerRef])
}
