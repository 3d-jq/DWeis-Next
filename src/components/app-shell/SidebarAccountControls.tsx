import type { AppShellRoute } from "./app-shell-types.ts"
import type { UseTeamWorkspace, WorkspaceSelection } from "@/hooks/useTeamWorkspace"

import { Archive, Laptop, Settings } from "lucide-react"
import * as React from "react"
import { CachedAvatarImage } from "@/components/CachedAvatarImage"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/i18n"
import { teamAvatarStyle, teamInitials } from "@/hooks/useTeamWorkspace"
import { cn } from "@/lib/utils"

function accountInitial(name?: string): string {
  const trimmed = name?.trim()
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase() : "L"
}

function WorkspaceAvatar({ className = "size-7", workspace }: { className?: string; workspace: WorkspaceSelection }) {
  if (workspace.kind === "local") {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-full border bg-background", className)}>
        <Laptop className="size-3.5" aria-hidden="true" />
      </span>
    )
  }

  return <TeamWorkspaceAvatar className={className} workspace={workspace} />
}

function TeamWorkspaceAvatar({ className, workspace }: { className: string; workspace: WorkspaceSelection }) {
  const avatarUrl = workspace.avatarPreviewUrl ?? workspace.team?.avatar
  const fallback = teamInitials(workspace.team?.name ?? workspace.teamId)
  const fallbackStyle = teamAvatarStyle(workspace.teamId)
  const [loadedAvatarUrl, setLoadedAvatarUrl] = React.useState<string | null>(null)
  const avatarLoaded = Boolean(avatarUrl && loadedAvatarUrl === avatarUrl)

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full text-xs font-medium",
        avatarLoaded ? "bg-transparent text-transparent" : "border bg-background text-foreground",
        className,
      )}
      style={avatarLoaded ? undefined : fallbackStyle}
    >
      {avatarLoaded ? null : (
        <span aria-hidden="true" className="min-w-0">
          {fallback}
        </span>
      )}
      <CachedAvatarImage
        src={avatarUrl}
        alt=""
        className="absolute inset-0 size-full object-cover"
        onLoad={() => setLoadedAvatarUrl(avatarUrl ?? null)}
        onError={() => setLoadedAvatarUrl((current) => (current === avatarUrl ? null : current))}
      />
    </span>
  )
}

function AccountMenuContent({
  displayName,
  onClose,
  onNavigate,
}: {
  displayName: string
  onClose: () => void
  onNavigate: (route: AppShellRoute) => void
}) {
  const t = useT()
  return (
    <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-56">
      <DropdownMenuLabel className="py-2">
        <div className="flex min-w-0 items-center gap-2">
          <AccountAvatar name={displayName} avatarUrl={undefined} />
          <div className="min-w-0 flex-1">
            <div className="truncate">{displayName}</div>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          onClose()
          onNavigate("archived")
        }}
      >
        <Archive className="size-4" />
        {t("archived.navTitle")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          onClose()
          onNavigate("settings")
        }}
      >
        <Settings className="size-4" />
        {t("settings.title")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

export function SidebarFooterControls({
  activeRoute: _activeRoute,
  onNavigate,
  onWorkspaceSwitchStart: _onWorkspaceSwitchStart,
  workspace,
  workspaceSwitching,
}: {
  activeRoute: AppShellRoute
  onNavigate: (route: AppShellRoute) => void
  onWorkspaceSwitchStart: (targetScopeKey: string) => void
  workspace: UseTeamWorkspace
  workspaceSwitching: boolean
}) {
  const t = useT()
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false)
  const displayName = t("workspace.local")
  const activeWorkspaceLabel =
    workspace.activeWorkspace.kind === "local"
      ? t("workspace.local")
      : (workspace.activeWorkspace.team?.name ?? t("teams.workspace"))
  const workspaceButtonTitle = workspaceSwitching ? t("sidebar.switchingAccount") : activeWorkspaceLabel
  const handleAccountMenuOpenChange = React.useCallback((open: boolean) => {
    setAccountMenuOpen(open)
  }, [])
  const accountMenuContent = (
    <AccountMenuContent
      displayName={displayName}
      onClose={() => setAccountMenuOpen(false)}
      onNavigate={onNavigate}
    />
  )

  return (
    <div className="oo-sidebar-account relative -mx-3 flex h-12 shrink-0 items-center gap-1 px-3 [-webkit-app-region:no-drag]">
      <DropdownMenu open={accountMenuOpen} onOpenChange={handleAccountMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="oo-sidebar-local-menu-trigger oo-sidebar-nav-item mx-1 mb-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left"
            aria-label={t("sidebar.localWorkspaceMenu")}
            aria-expanded={accountMenuOpen}
            title={workspaceButtonTitle}
          >
            <WorkspaceAvatar className="size-7" workspace={workspace.activeWorkspace} />
            <span className="oo-sidebar-nav-label oo-text-body min-w-0 flex-1 truncate text-sidebar-foreground">
              {activeWorkspaceLabel}
            </span>
            <span className="oo-sidebar-local-menu-indicator oo-sidebar-nav-label grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground">
              <Settings className="size-4" aria-hidden="true" />
            </span>
          </button>
        </DropdownMenuTrigger>
        {accountMenuContent}
      </DropdownMenu>
    </div>
  )
}

function AccountAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <div className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-foreground">
      <span aria-hidden="true">{accountInitial(name)}</span>
      <CachedAvatarImage src={avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
    </div>
  )
}
