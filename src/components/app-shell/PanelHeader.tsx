import type { ReactNode } from "react"

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

export interface PanelHeaderBreadcrumb {
  label: string
  path: string
}

export interface PanelHeaderAction {
  id: string
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface PanelHeaderProps {
  breadcrumbs?: PanelHeaderBreadcrumb[]
  title: string
  actions?: PanelHeaderAction[]
  onNavigateBreadcrumb?: (index: number) => void
  maximized?: boolean
  onToggleMaximized?: () => void
}

export function PanelHeader({
  breadcrumbs,
  title,
  actions,
  onNavigateBreadcrumb,
  maximized,
  onToggleMaximized,
}: PanelHeaderProps) {
  const t = useT()
  const showBreadcrumbs = breadcrumbs && breadcrumbs.length > 0

  return (
    <header className="oo-titlebar oo-artifacts-titlebar oo-border-divider flex h-[var(--app-titlebar-height)] shrink-0 items-center justify-between gap-3 border-b [-webkit-app-region:drag]">
      <div className="flex min-w-0 items-center gap-1">
        {showBreadcrumbs ? (
          <button
            type="button"
            title={t("artifacts.backToParent")}
            aria-label={t("artifacts.backToParent")}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => onNavigateBreadcrumb?.(-1)}
          >
            <ChevronRight className="size-4 rotate-180" />
          </button>
        ) : null}
        <div className="oo-text-title min-w-0 truncate">{title}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
        {actions?.map((action) => (
          <button
            key={action.id}
            type="button"
            title={action.label}
            aria-label={action.label}
            disabled={action.disabled}
            className={cn(
              "oo-toolbar-button flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
              action.disabled && "pointer-events-none opacity-40",
            )}
            onClick={action.onClick}
          >
            {action.icon}
          </button>
        ))}
        {onToggleMaximized ? (
          <button
            type="button"
            title={maximized ? t("artifacts.restore") : t("artifacts.maximize")}
            aria-label={maximized ? t("artifacts.restore") : t("artifacts.maximize")}
            aria-pressed={maximized}
            className="oo-toolbar-button flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
            onClick={onToggleMaximized}
          >
            {maximized ? (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
    </header>
  )
}
