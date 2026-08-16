import type { RightPanelTab } from "./right-panel-tabs.ts"

import { Globe2, FileSearch, Package, Plus, X } from "lucide-react"
import * as React from "react"
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

export interface UnifiedTabBarProps {
  tabs: RightPanelTab[]
  activeTabId: string | null
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
  onAddTab: () => void
  maximized?: boolean
}

export function UnifiedTabBar({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onAddTab,
  maximized,
}: UnifiedTabBarProps) {
  const t = useT()

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

  return (
    <div
      role="tablist"
      aria-label={t("rightPanel.tabsAria")}
      onKeyDown={handleTablistKeyDown}
      className="oo-border-divider flex min-h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1.5 py-1"
      style={maximized ? { paddingRight: "calc(var(--window-control-right-space) + 0.5rem)" } : undefined}
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
      <button
        type="button"
        aria-label={t("rightPanel.newTab")}
        title={t("rightPanel.newTab")}
        onClick={onAddTab}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
