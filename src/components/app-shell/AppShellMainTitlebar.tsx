import type { SessionInfo } from "../../../electron/session/common.ts"
import type { UseAppUpdate } from "@/hooks/useAppUpdate"

import { ChevronRight, ListTodo, MoreHorizontal, PanelRightClose, PanelRightOpen } from "lucide-react"
import * as React from "react"
import { EditableTitlebarTitle } from "./AppShellDialogs.tsx"
import { SidebarTitlebarActions } from "./AppShellSidebar.tsx"
import { AppUpdateTitlebarEntry } from "@/components/AppUpdateTitlebarEntry"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

interface TitlebarBreadcrumb {
  label: string
  path: string
}

function TitlebarBreadcrumbs({
  breadcrumbs,
  onNavigate,
}: {
  breadcrumbs: TitlebarBreadcrumb[]
  onNavigate: (path: string) => void
}) {
  const collapsed = breadcrumbs.length > 4 ? breadcrumbs.slice(1, -2) : []
  const visible = collapsed.length > 0 ? [breadcrumbs[0], ...breadcrumbs.slice(-2)] : breadcrumbs

  return (
    <nav
      aria-label={breadcrumbs.map((breadcrumb) => breadcrumb.label).join(" / ")}
      className="flex min-w-0 items-center"
    >
      {visible.map((breadcrumb, index) => {
        const originalIndex = collapsed.length > 0 && index > 0 ? breadcrumbs.length - (visible.length - index) : index
        const current = originalIndex === breadcrumbs.length - 1
        return (
          <React.Fragment key={breadcrumb.path || "__root__"}>
            {index > 0 ? <ChevronRight className="mx-1 size-3.5 shrink-0 text-muted-foreground/70" /> : null}
            {collapsed.length > 0 && index === 1 ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="oo-toolbar-button mr-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground [-webkit-app-region:no-drag] hover:bg-accent hover:text-foreground"
                      aria-label={collapsed.map((item) => item.label).join(" / ")}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {collapsed.map((item) => (
                      <DropdownMenuItem key={item.path} onSelect={() => onNavigate(item.path)}>
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <ChevronRight className="mx-1 size-3.5 shrink-0 text-muted-foreground/70" />
              </>
            ) : null}
            {current ? (
              <span className="max-w-56 truncate font-semibold text-foreground" title={breadcrumb.label}>
                {breadcrumb.label}
              </span>
            ) : (
              <button
                type="button"
                className="max-w-40 truncate rounded px-1 py-0.5 text-muted-foreground transition-colors [-webkit-app-region:no-drag] hover:bg-accent hover:text-foreground"
                title={breadcrumb.label}
                onClick={() => onNavigate(breadcrumb.path)}
              >
                {breadcrumb.label}
              </button>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export const AppShellMainTitlebar = React.memo(function AppShellMainTitlebar({
  activeSession,
  appUpdate,
  isSidebarRestoring,
  onOpenSearch,
  onRenameSession,
  onRightPanelToggle,
  onTitlebarBreadcrumbNavigate,
  onTogglePlanPanel,
  onToggleSidebar,
  planPanelOpen,
  rightPanelOpen,
  rightPanelToggleLabel,
  sidebarCollapsed,
  titlebarEditable,
  titlebarBreadcrumbs,
  titlebarTitle,
}: {
  activeSession: SessionInfo | null
  appUpdate: UseAppUpdate
  isSidebarRestoring: boolean
  onOpenSearch: () => void
  onRenameSession: (sessionId: string, title: string) => void
  onRightPanelToggle: () => void
  onTitlebarBreadcrumbNavigate?: (path: string) => void
  onTogglePlanPanel?: () => void
  onToggleSidebar: () => void
  planPanelOpen?: boolean
  rightPanelOpen: boolean
  rightPanelToggleLabel: string
  sidebarCollapsed: boolean
  titlebarEditable: boolean
  titlebarBreadcrumbs?: TitlebarBreadcrumb[]
  titlebarTitle: string
}) {
  const t = useT()
  return (
    <header className="oo-titlebar oo-toolbar oo-main-titlebar oo-border-divider flex h-[var(--app-titlebar-height)] min-w-0 items-center overflow-hidden border-b [-webkit-app-region:drag]">
      <div className="oo-titlebar-collapsed-controls shrink-0 items-center gap-3">
        <div className="oo-titlebar-control-spacer shrink-0" />
        <SidebarTitlebarActions
          collapsed={sidebarCollapsed}
          onToggleCollapsed={onToggleSidebar}
          onSearch={onOpenSearch}
        />
      </div>
      <div
        className={cn(
          "oo-main-titlebar-title flex min-w-0 flex-1 items-center gap-2 overflow-hidden",
          isSidebarRestoring && "is-restoring",
        )}
      >
        {titlebarBreadcrumbs && onTitlebarBreadcrumbNavigate ? (
          <TitlebarBreadcrumbs breadcrumbs={titlebarBreadcrumbs} onNavigate={onTitlebarBreadcrumbNavigate} />
        ) : (
          <EditableTitlebarTitle
            title={titlebarTitle}
            editable={titlebarEditable}
            onRename={(title) => {
              if (activeSession) {
                onRenameSession(activeSession.id, title)
              }
            }}
          />
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
        <AppUpdateTitlebarEntry update={appUpdate} />
        {/* 右侧边栏常驻开关：位于窗口控制按钮（最小化/关闭）左侧。 */}
        <button
          type="button"
          title={rightPanelToggleLabel}
          aria-label={rightPanelToggleLabel}
          aria-pressed={rightPanelOpen}
          className={cn(
            "oo-toolbar-button flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
            rightPanelOpen && "bg-accent text-foreground",
          )}
          onClick={onRightPanelToggle}
        >
          {rightPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </button>
        {/* 计划面板开关：紧挨右侧边栏开关右侧（靠近窗口控制按钮），仅在 chat 路由可用。 */}
        {onTogglePlanPanel ? (
          <button
            type="button"
            title={t("chat.planTitle")}
            aria-label={t("chat.planTitle")}
            aria-pressed={planPanelOpen}
            className={cn(
              "oo-toolbar-button flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
              planPanelOpen && "bg-accent text-foreground",
            )}
            onClick={onTogglePlanPanel}
          >
            <ListTodo className="size-4" />
          </button>
        ) : null}
      </div>
    </header>
  )
})
