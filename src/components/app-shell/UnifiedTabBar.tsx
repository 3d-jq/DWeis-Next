import type { RightPanelTab } from "./right-panel-tabs.ts"

import { Globe2, FileSearch, Package, Plus, X } from "lucide-react"
import * as React from "react"
import { createPortal } from "react-dom"
import { RIGHT_PANEL_TABPANEL_ID, tabElementId } from "./right-panel-tabs.ts"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

function tabIcon(tab: RightPanelTab): React.ReactNode {
  switch (tab.kind) {
    case "browser":
      return <Globe2 className="size-3.5" />
    case "turn-output":
      return <FileSearch className="size-3.5" />
    case "artifact":
      return <Package className="size-3.5" />
  }
}

/** 加号菜单项：按标签类型打开对应面板（对齐 LobsterAI 的 artifactAddTab 菜单）。 */
export interface AddTabOption {
  kind: RightPanelTab["kind"]
  label: string
  /** 不可用原因（禁用项的 title / 次要文案）。 */
  hint: string
  disabled: boolean
  onSelect: () => void
}

export interface UnifiedTabBarProps {
  tabs: RightPanelTab[]
  activeTabId: string | null
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
  /** 加号菜单选项（空数组时隐藏加号）。 */
  addTabOptions: AddTabOption[]
  maximized?: boolean
}

export function UnifiedTabBar({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  addTabOptions,
  maximized,
}: UnifiedTabBarProps) {
  const t = useT()
  const addButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number } | null>(null)
  // 标签溢出检测（对齐 LobsterAI shouldPinArtifactAddTab）：溢出时加号 pin 到右缘，
  // 避免被滚出可视区；同时显示右缘渐变遮罩提示可滚动。
  const [tabsOverflowing, setTabsOverflowing] = React.useState(false)

  React.useLayoutEffect(() => {
    const element = listRef.current
    if (!element) {
      return
    }
    const updateOverflow = (): void => {
      setTabsOverflowing(element.scrollWidth > element.clientWidth)
    }
    updateOverflow()
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(element)
    return () => observer.disconnect()
  }, [tabs])

  // APG tabs 方向键 roving（自动激活）：左右循环移动、Home/End 首尾，焦点与激活同步。
  const handleTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (tabs.length === 0) {
      return
    }
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
    let nextIndex = currentIndex
    if (event.key === "ArrowLeft") {
      nextIndex = currentIndex - 1
    } else if (event.key === "ArrowRight") {
      nextIndex = currentIndex + 1
    } else if (event.key === "Home") {
      nextIndex = 0
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1
    } else {
      return
    }
    event.preventDefault()
    const nextTab = tabs[(nextIndex + tabs.length) % tabs.length]
    if (nextTab) {
      onActivateTab(nextTab.id)
      document.getElementById(tabElementId(nextTab.id))?.focus()
    }
  }

  const updateMenuPosition = React.useCallback(() => {
    const rect = addButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({ left: Math.round(rect.right - 176), top: Math.round(rect.bottom + 6) })
  }, [])

  React.useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null)
      return
    }
    updateMenuPosition()
    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)
    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [menuOpen, updateMenuPosition])

  React.useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || addButtonRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMenuOpen(false)
        addButtonRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen])

  return (
    <div
      className="oo-border-divider relative flex min-h-9 shrink-0 items-center border-b py-1 pr-1.5 pl-1.5"
      style={maximized ? { paddingRight: "calc(var(--window-control-right-space) + 0.5rem)" } : undefined}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label={t("rightPanel.tabsAria")}
        onKeyDown={handleTablistKeyDown}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          const elementId = tabElementId(tab.id)
          return (
            <div
              key={tab.id}
              role="presentation"
              className={cn(
                "flex h-7 max-w-40 min-w-0 shrink-0 items-center gap-0.5 rounded-md pr-1 transition-colors",
                active ? "bg-accent" : "hover:bg-muted",
              )}
            >
              <button
                type="button"
                role="tab"
                id={elementId}
                aria-selected={active}
                aria-controls={RIGHT_PANEL_TABPANEL_ID}
                tabIndex={active ? 0 : -1}
                title={tab.title}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onActivateTab(tab.id)}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault()
                    onCloseTab(tab.id)
                  }
                }}
              >
                <span className="shrink-0">{tabIcon(tab)}</span>
                <span className="oo-text-caption-compact truncate">{tab.title}</span>
              </button>
              <button
                type="button"
                aria-label={t("rightPanel.closeTab")}
                tabIndex={active ? 0 : -1}
                className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onCloseTab(tab.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
      {tabsOverflowing ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-[34px] z-10 w-10 bg-gradient-to-l from-background via-background/80 to-transparent"
        />
      ) : null}
      {addTabOptions.length > 0 ? (
        <button
          ref={addButtonRef}
          type="button"
          aria-label={t("rightPanel.newTab")}
          title={t("rightPanel.newTab")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={cn(
            "ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            menuOpen && "bg-muted text-foreground",
          )}
        >
          <Plus className="size-4" />
        </button>
      ) : null}
      {menuOpen && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={t("rightPanel.newTab")}
              className="fixed z-50 w-44 overflow-hidden rounded-lg border border-[var(--oo-divider)] bg-background py-1 shadow-lg"
              style={{ left: menuPosition.left, top: menuPosition.top }}
            >
              {addTabOptions.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  role="menuitem"
                  disabled={option.disabled}
                  title={option.disabled ? option.hint : option.label}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-none px-3 py-1.5 text-left transition-colors",
                    option.disabled ? "cursor-not-allowed text-muted-foreground/50" : "text-foreground hover:bg-accent",
                  )}
                  onClick={() => {
                    if (option.disabled) return
                    setMenuOpen(false)
                    option.onSelect()
                  }}
                >
                  <span className="shrink-0">{tabIcon({ kind: option.kind } as RightPanelTab)}</span>
                  <span className="oo-text-caption min-w-0 flex-1 truncate">{option.label}</span>
                  {option.disabled ? (
                    <span className="oo-text-micro shrink-0 truncate text-muted-foreground/60">{option.hint}</span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
