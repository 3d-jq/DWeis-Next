import type { AgentPermissionMode, AgentRuntimeStatus } from "../../../electron/chat/common.ts"
import type { SessionInfo } from "../../../electron/session/common.ts"
import type { Persona } from "../../../electron/settings/common.ts"
import type { AppShellRoute as Route, SettingsCategory } from "./app-shell-types.ts"
import type { SidebarTaskSortMode } from "./sidebar-persistence.ts"
import type { AddTabOption } from "./UnifiedTabBar.tsx"
import type { KnowledgeBaseIdsUpdate } from "@/hooks/useSessions"
import type { ComposerState } from "@/routes/Chat/composer-state"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"
import type { ChatStatus } from "ai"

import * as React from "react"
import { toast } from "sonner"
import { APP_COMMANDS } from "../../../electron/app-command.ts"
import { DEFAULT_LOCAL_WORKSPACE } from "../../../electron/session/common.ts"
import {
  activeProjectIdForComposer,
  existingSessionComposerDraftKey,
  initialRoute,
  newSessionComposerDraftKeyForScopeKey,
  NO_DRAFT_PROJECT_ID,
  projectContextFromProject,
  projectContextControlsDisabled,
  sessionRecordScopeKey,
  sessionScopeKey,
} from "./app-shell-model.ts"
import { AppShellMainTitlebar } from "./AppShellMainTitlebar.tsx"
import { AppShellNavigationSidebar } from "./AppShellNavigationSidebar.tsx"
import { AppShellRightPanel } from "./AppShellRightPanel.tsx"
import { AppShellSessionProjectDialogs } from "./AppShellSessionProjectDialogs.tsx"
import { isPendingChatCaughtUp, pendingChatTransitionForActiveSession } from "./pending-chat.ts"
import { readStoredTaskSortMode, writeStoredTaskSortMode } from "./sidebar-persistence.ts"
import { useAppShellAttention } from "./use-app-shell-attention.ts"
import { useAppShellChatHandlers } from "./use-app-shell-chat-handlers.ts"
import { useAppShellCommands } from "./use-app-shell-commands.ts"
import { useAppShellKnowledge } from "./use-app-shell-knowledge.tsx"
import { useAppShellRuntimeCleanup } from "./use-app-shell-runtime-cleanup.ts"
import { useAppShellSessionSelection } from "./use-app-shell-session-selection.ts"
import { useAppShellSidebarSessions } from "./use-app-shell-sidebar-sessions.ts"
import { useArtifactsPanelState } from "./use-artifacts-panel-state.ts"
import { useBrowserDownloadNotifications } from "./use-browser-download-notifications.ts"
import { useBrowserPanelState } from "./use-browser-panel-state.ts"
import { useChatQueueState } from "./use-chat-queue-state.ts"
import { useComposerNavigation } from "./use-composer-navigation.ts"
import { useComposerSubmission } from "./use-composer-submission.ts"
import { useProjectActions } from "./use-project-actions.ts"
import { useProjectSidebarCollapseState } from "./use-project-sidebar-collapse-state.ts"
import { useRightPanelTabs } from "./use-right-panel-tabs.ts"
import { useSessionActions } from "./use-session-actions.ts"
import { useSessionTitleGeneration } from "./use-session-title-generation.ts"
import { useSidebarChromeState } from "./use-sidebar-chrome-state.ts"
import { useUpdateReadyToast } from "./use-update-ready-toast.ts"
import { ProjectContextBar } from "@/components/app-shell/ProjectContextBar"
import { useAttentionService, useBrowserService, useChatService } from "@/components/AppContext"
import { AppUpdateTitlebarEntry } from "@/components/AppUpdateTitlebarEntry"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useAppUpdate } from "@/hooks/useAppUpdate"
import { useAttention } from "@/hooks/useAttention"
import { useChat } from "@/hooks/useChat"
import { useKnowledgeBases } from "@/hooks/useKnowledgeBases"
import { useProjectGit } from "@/hooks/useProjectGit"
import { useSessions } from "@/hooks/useSessions"
import { useT } from "@/i18n/i18n"
import { appCommandShortcutLabel, labelWithShortcut } from "@/lib/app-shortcuts"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { resolveUserFacingError, userFacingErrorDescription } from "@/lib/user-facing-error"
import { cn } from "@/lib/utils"
import { releaseAttachmentSnapshots } from "@/routes/Chat/chat-attachment-utils"
import { chatTurnAllowsDirectSend, chatTurnQueuesNewMessage, resolveChatTurnState } from "@/routes/Chat/chat-turn-state"
import { hasComposerDraftContent, toCachedComposerState } from "@/routes/Chat/composer-state"
import { knowledgeBreadcrumbs, normalizeKnowledgePath } from "@/routes/Knowledge/knowledge-route-model.ts"

const ArchivedRoute = React.lazy(() =>
  import("@/routes/Archived").then((module) => ({ default: module.ArchivedRoute })),
)
const ChatArea = React.lazy(() => import("@/routes/Chat").then((module) => ({ default: module.ChatArea })))
const PlanSummaryPanel = React.lazy(() =>
  import("@/routes/Chat/PlanSummaryPanel").then((module) => ({ default: module.PlanSummaryPanel })),
)
const TasksDialog = React.lazy(() => import("@/routes/Tasks").then((module) => ({ default: module.TasksDialog })))
const KnowledgeRoute = React.lazy(() =>
  import("@/routes/Knowledge").then((module) => ({ default: module.KnowledgeRoute })),
)
const SettingsRoute = React.lazy(() =>
  import("@/routes/Settings").then((module) => ({ default: module.SettingsRoute })),
)
const SkillsRoute = React.lazy(() => import("@/routes/Skills").then((module) => ({ default: module.SkillsRoute })))
const AutomationRoute = React.lazy(() =>
  import("@/routes/Automation").then((module) => ({ default: module.AutomationRoute })),
)

function releaseTransientFocus(): void {
  const blurActiveElement = (): void => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) {
      activeElement.blur()
    }
  }
  blurActiveElement()
  window.requestAnimationFrame(blurActiveElement)
}

function RouteLoadingFallback({ className }: { className?: string }) {
  return <div className={cn("h-full min-h-0 bg-background", className)} />
}

export function AppShell() {
  const t = useT()
  const attentionService = useAttentionService()
  const browserService = useBrowserService()
  const chatService = useChatService()
  useBrowserDownloadNotifications()
  const attention = useAttention()
  const appUpdate = useAppUpdate()
  const appSettings = useAppSettings()
  const [ready, setReady] = React.useState(false)
  const [tasksDialogOpen, setTasksDialogOpen] = React.useState(false)
  const [agentStatus, setAgentStatus] = React.useState<AgentRuntimeStatus>({ status: "starting" })
  const knowledgeBaseBetaEnabled = appSettings.settings.knowledgeBaseBetaEnabled
  const knowledgeLibrary = useKnowledgeBases(knowledgeBaseBetaEnabled)
  // 纯本地 self-managed：单一本地工作区，无团队/账号切换。
  const sessionScope = DEFAULT_LOCAL_WORKSPACE
  const sessionsEnabled = sessionScope !== null
  const {
    sessions,
    taskSessions,
    projectSessions,
    projects,
    loaded: sessionsLoaded,
    loadedScopeKey: sessionsLoadedScopeKey,
    error: sessionsError,
    create,
    createProject,
    assignSessionProject,
    setSessionKnowledgeBases,
    renameProject: renameProjectAction,
    pinProject: pinProjectAction,
    archiveProject: archiveProjectAction,
    removeProject: removeProjectAction,
    generateTitle,
    rename,
    pin,
    archive,
    archiveMany,
    listArchived,
    unarchive,
    remove: removeSession,
    removeMany,
    refresh: refreshSessions,
  } = useSessions({ enabled: sessionsEnabled, persona: appSettings.settings.persona, scope: sessionScope })
  const [taskSortMode, setTaskSortMode] = React.useState<SidebarTaskSortMode>(() =>
    readStoredTaskSortMode(globalThis.localStorage),
  )
  const currentScopeKey = sessionScopeKey(sessionScope)
  const activeWorkspaceKey = currentScopeKey
  const sessionsSettledForCurrentScope = sessionsLoaded && sessionsLoadedScopeKey === currentScopeKey
  const visibleSessions = React.useMemo(
    () => (sessionsSettledForCurrentScope ? sessions : []),
    [sessions, sessionsSettledForCurrentScope],
  )
  const visibleTaskSessions = React.useMemo(
    () => (sessionsSettledForCurrentScope ? taskSessions : []),
    [sessionsSettledForCurrentScope, taskSessions],
  )
  const visibleProjectSessions = React.useMemo(
    () => (sessionsSettledForCurrentScope ? projectSessions : []),
    [projectSessions, sessionsSettledForCurrentScope],
  )
  const visibleProjects = React.useMemo(
    () => (sessionsSettledForCurrentScope ? projects : []),
    [projects, sessionsSettledForCurrentScope],
  )
  const [route, setRoute] = React.useState<Route>(initialRoute)
  const {
    activeChatSessionId,
    activeKnowledgeBaseIds,
    activeSession,
    draftPermissionMode,
    draftProjectId,
    isDraftSession,
    pendingChatTransition,
    selectedSessionId,
    selectSession,
    setDraftKnowledgeBaseIds,
    setDraftPermissionMode,
    setDraftProjectId,
    setIsDraftSession,
    setPendingChatTransition,
    setSelectedSessionId,
    setSidebarSegment,
    sidebarSegment,
  } = useAppShellSessionSelection({ currentScopeKey, sessionRecordScopeKey, visibleSessions })
  const { markSessionViewed } = useAppShellAttention({
    attentionService,
    route,
    activeChatSessionId,
    sessionsSettledForCurrentScope,
    visibleSessions,
    refreshSessions,
    setRoute,
    selectSession,
    persona: appSettings.settings.persona,
    setPersona: appSettings.setPersona,
  })
  const appChromeRef = React.useRef<HTMLDivElement | null>(null)
  const {
    handleSidebarResizeKeyDown,
    handleSidebarResizeStart,
    handleToggleSidebar,
    isSidebarResizing,
    isSidebarRestoring,
    setIsSidebarRestoring,
    setSidebarCollapsed,
    sidebarCollapsed,
    sidebarWidth,
  } = useSidebarChromeState(appChromeRef)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [composerFocusRequest, setComposerFocusRequest] = React.useState(0)
  const [planPanelOpen, setPlanPanelOpen] = React.useState(false)

  const {
    messages,
    pendingPermissions,
    pendingQuestions,
    status,
    activity,
    messagesLoaded,
    sessionSnapshotError,
    error,
    forgetSession: forgetChatSession,
    getSessionStatus,
    getSessionRunStartedAt,
    permissionMode,
    setPermissionMode: setChatPermissionMode,
    send,
    stop,
    compact,
    undo,
    redo,
    runShellCommand,
    answerPermission,
    answerQuestion,
    rejectQuestion,
    questionDrafts,
    resetSessionCache: resetChatSessionCache,
    retrySessionSnapshot,
  } = useChat(activeChatSessionId, activeWorkspaceKey)
  const hasUnreadSession = attention.hasUnreadSession

  const composerDraftsByKey = React.useRef<Map<string, ComposerState>>(new Map())
  const lastChatProjectId = React.useRef<string | null>(null)
  const workspaceResetKeyRef = React.useRef(activeWorkspaceKey)
  const previousActiveChatSessionIdRef = React.useRef<string | null>(null)
  const {
    tabs: rightPanelTabs,
    activeTab: activeRightPanelTab,
    activeTabId: activeRightPanelTabId,
    latestArtifactSelection,
    latestTurnOutputSelection,
    closeTabById,
    openArtifact,
    openBrowser,
    openTurnOutput,
    setActiveTabId,
    setTabTitle,
    clearTabs,
  } = useRightPanelTabs({ activeSessionId: activeChatSessionId })
  const { browserPanelOpen, browserState, closeBrowserPanel } = useBrowserPanelState({
    activeSessionId: activeChatSessionId,
    route,
  })
  const {
    artifactsPanelContentRef,
    artifactsPanelIsMaximized,
    artifactsPanelMaxWidthState,
    artifactsPanelShellRef,
    handleArtifactsPanelResizeKeyDown,
    handleArtifactsPanelResizeStart,
    isArtifactsPanelResizing,
    rightPanelVisible,
    setArtifactsPanelOpen,
    setArtifactsPanelMaximizedState,
    visibleRightPanelWidth,
  } = useArtifactsPanelState({
    activeSessionId: activeChatSessionId,
    appChromeRef,
    browserActive: activeRightPanelTab?.kind === "browser",
    route,
    setIsSidebarRestoring,
    setSidebarCollapsed,
    sidebarCollapsed,
    sidebarWidth,
  })

  const handleArtifactsReset = React.useCallback((): void => {
    clearTabs()
    setArtifactsPanelOpen(false)
  }, [clearTabs, setArtifactsPanelOpen])

  React.useEffect(() => {
    let cancelled = false

    const applyStatus = (status: AgentRuntimeStatus): void => {
      setAgentStatus(status)
      setReady(status.status === "ready")
    }

    const readStatus = async (): Promise<void> => {
      try {
        const status = await chatService.invoke("getAgentStatus")
        if (!cancelled) {
          applyStatus(status)
        }
      } catch {
        if (!cancelled) {
          applyStatus({ status: "starting" })
        }
      }
    }
    void readStatus()
    const off = chatService.serverEvents.on("agentStatusChanged", (event) => {
      applyStatus(event.status)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [chatService])

  React.useEffect(() => {
    if (ready && sessionsEnabled) {
      void refreshSessions()
    }
  }, [ready, refreshSessions, sessionsEnabled])

  React.useEffect(() => {
    if (!activeChatSessionId || !activeSession) {
      return
    }
    void setChatPermissionMode(activeChatSessionId, activeSession.permissionMode ?? "default").catch(
      (cause: unknown) => {
        console.error("[dweis] sync chat permission mode failed", cause)
        reportRendererHandledError("appShell.permissionMode", "Failed to sync session permission mode", cause)
      },
    )
  }, [activeChatSessionId, activeSession?.permissionMode, setChatPermissionMode])

  const persistPermissionMode = React.useCallback(
    async (sessionId: string, mode: AgentPermissionMode): Promise<void> => {
      try {
        await setChatPermissionMode(sessionId, mode)
      } catch (cause) {
        toast.error(userFacingErrorDescription(resolveUserFacingError(cause, { area: "session" }), t))
        throw cause
      }
    },
    [setChatPermissionMode, t],
  )
  const persistKnowledgeBaseIds = React.useCallback(
    (sessionId: string, update: KnowledgeBaseIdsUpdate): void => {
      void setSessionKnowledgeBases(sessionId, update).catch((cause: unknown) => {
        console.error("[dweis] persist session knowledge bases failed", cause)
        reportRendererHandledError("appShell.knowledgeBases", "Failed to persist session knowledge bases", cause)
        toast.error(userFacingErrorDescription(resolveUserFacingError(cause, { area: "session" }), t))
      })
    },
    [setSessionKnowledgeBases, t],
  )
  const {
    clearAutoFallbackTitle,
    getAutoFallbackTitle,
    isAutoRefreshable,
    refreshGeneratedTitle,
    rememberAutoFallbackTitle,
  } = useSessionTitleGeneration({
    generateTitle,
    rename,
    sessions: visibleSessions,
  })
  const titleGeneration = React.useMemo(
    () => ({ getAutoFallbackTitle, isAutoRefreshable, refreshGeneratedTitle, rememberAutoFallbackTitle }),
    [getAutoFallbackTitle, isAutoRefreshable, refreshGeneratedTitle, rememberAutoFallbackTitle],
  )
  const activeProjectId = React.useMemo(
    () => activeProjectIdForComposer({ activeSession, draftProjectId }),
    [activeSession, draftProjectId],
  )
  const activeProject = React.useMemo(() => {
    if (!activeProjectId) {
      return undefined
    }
    return visibleProjects.find((project) => project.id === activeProjectId)
  }, [activeProjectId, visibleProjects])
  const handleProjectUnavailable = React.useCallback(
    (projectId: string): void => {
      if (lastChatProjectId.current === projectId) {
        lastChatProjectId.current = null
      }
      if (activeProjectId !== projectId) {
        return
      }
      if (activeChatSessionId) {
        setSelectedSessionId(null)
      }
      setIsDraftSession(true)
      setDraftProjectId(NO_DRAFT_PROJECT_ID)
      setPendingChatTransition(null)
      setRoute("chat")
    },
    [activeChatSessionId, activeProjectId],
  )
  const projectGit = useProjectGit(activeProject)
  const activeProjectContext = React.useMemo(
    () => projectContextFromProject(activeProject, projectGit.state),
    [activeProject, projectGit.state],
  )
  React.useEffect(() => {
    if (route === "chat") {
      lastChatProjectId.current = activeProjectId ?? null
    }
  }, [activeProjectId, route])
  const { collapsedProjectIds, handleProjectSidebarExpandedChange } = useProjectSidebarCollapseState({
    projects: visibleProjects,
    sessionScope,
    sessionsLoaded: sessionsSettledForCurrentScope,
  })
  const newSessionDraftScopeKey = sessionScope ? currentScopeKey : activeWorkspaceKey
  const activeComposerDraftKey = activeChatSessionId
    ? existingSessionComposerDraftKey(currentScopeKey, activeChatSessionId)
    : newSessionComposerDraftKeyForScopeKey(newSessionDraftScopeKey, activeProjectId)
  const initialComposerState = composerDraftsByKey.current.get(activeComposerDraftKey)
  const activePendingChatTransition = pendingChatTransitionForActiveSession(
    pendingChatTransition,
    currentScopeKey,
    activeChatSessionId,
  )
  const pendingCaughtUp = isPendingChatCaughtUp(activePendingChatTransition, activeChatSessionId, messages)
  const initialSendPending = Boolean(activePendingChatTransition && !pendingCaughtUp)
  const bridgeInitialSendPending = initialSendPending && messages.length === 0
  const displayedStatus: ChatStatus = initialSendPending ? "submitted" : status
  const activePendingQuestionCount = pendingQuestions.length
  const activeChatTurnState = React.useMemo(
    () =>
      resolveChatTurnState({
        initialSendPending,
        pendingPermissionCount: pendingPermissions.length,
        pendingQuestionCount: activePendingQuestionCount,
        status: displayedStatus,
      }),
    [activePendingQuestionCount, displayedStatus, initialSendPending, pendingPermissions.length],
  )
  const isSessionRunning = React.useCallback(
    (sessionId: string): boolean => {
      if (sessionId === activeChatSessionId) {
        return chatTurnQueuesNewMessage(activeChatTurnState)
      }
      const sessionStatus = getSessionStatus(sessionId)
      return sessionStatus === "submitted" || sessionStatus === "streaming"
    },
    [activeChatSessionId, activeChatTurnState, getSessionStatus],
  )
  const hasRunningSession = visibleSessions.some((session) => isSessionRunning(session.id))
  useUpdateReadyToast(appUpdate, !sessionsSettledForCurrentScope || hasRunningSession)
  const {
    pinnedProjectGroups: projectPinnedGroups,
    pinnedProjectSessions: projectPinnedSessions,
    regularProjectGroups: projectRegularGroups,
    selectableSessions: selectableSidebarSessions,
    taskGroups: sidebarSessionGroups,
  } = useAppShellSidebarSessions({
    getSessionRunStartedAt,
    isSessionRunning,
    projectSessions: visibleProjectSessions,
    projects: visibleProjects,
    selectedSessionId,
    sidebarSegment,
    taskSessions: visibleTaskSessions,
    taskSortMode,
  })
  const displayedPermissionMode = activeChatSessionId ? permissionMode : draftPermissionMode
  const needsDefaultSessionSelection =
    sessionsSettledForCurrentScope && !isDraftSession && !selectedSessionId && selectableSidebarSessions.length > 0
  const agentStartupError =
    agentStatus.status === "error" ? resolveUserFacingError(agentStatus.message, { area: "agent" }) : null
  const modelRequired = agentStatus.status === "model_required"
  const startupError = agentStartupError ?? sessionSnapshotError
  const hasVisibleLoadedSession = Boolean(activeChatSessionId && messagesLoaded)
  const chatBootstrapping =
    !startupError &&
    !modelRequired &&
    ((!ready && !hasVisibleLoadedSession) ||
      !sessionsSettledForCurrentScope ||
      needsDefaultSessionSelection ||
      Boolean(activeChatSessionId && !messagesLoaded && !activePendingChatTransition))
  const chatSubmitDisabled = !ready || chatBootstrapping || !sessionScope
  const showChatEmptyState =
    (ready || modelRequired) &&
    sessionsSettledForCurrentScope &&
    !activePendingChatTransition &&
    (!activeChatSessionId || (messagesLoaded && messages.length === 0))

  // 统一修复默认选中和失效选中，避免多个 effect 在同一轮分别写入首项与 null。
  React.useLayoutEffect(() => {
    if (!sessionsSettledForCurrentScope || isDraftSession) {
      return
    }
    if (selectedSessionId && selectableSidebarSessions.some((session) => session.id === selectedSessionId)) {
      return
    }
    const fallbackSession = selectableSidebarSessions[0]
    if (fallbackSession) {
      setSelectedSessionId(fallbackSession.id)
      if (selectedSessionId) {
        setDraftProjectId(null)
        setPendingChatTransition(null)
      }
      return
    }
    if (!selectedSessionId || visibleSessions.some((session) => session.id === selectedSessionId)) {
      return
    }
    setSelectedSessionId(null)
    setIsDraftSession(false)
    setDraftProjectId(null)
    setPendingChatTransition(null)
  }, [isDraftSession, selectableSidebarSessions, selectedSessionId, sessionsSettledForCurrentScope, visibleSessions])

  const showComposerProjectContext = route === "chat"
  // 空态标题随人群模式：有项目时保持项目空态（项目全局共用），无项目时按 Work/Code 分流。
  const chatEmptyTitle = activeProject
    ? t("project.chatEmptyTitle", { project: activeProject.name })
    : sidebarSegment === "tasks"
      ? t("chat.emptyTitleWork")
      : t("chat.emptyTitleCode")
  const titlebarTitle =
    route === "settings" || route.startsWith("settings/")
      ? t("settings.title")
      : route === "skills"
        ? t("skills.title")
        : route === "automation"
          ? t("automation.title")
          : route === "knowledge" && knowledgeBaseBetaEnabled
            ? t("knowledge.title")
            : route === "archived"
              ? t("archived.title")
              : (activeSession?.title ?? t("chat.newSession"))
  const titlebarEditable = route === "chat" && Boolean(activeSession)
  // 人群模式从侧边栏视图派生：Work（任务视图）= 办公人设，Code（项目视图）= 编码人设。
  // 顶部 Work/Code 切换同时驱动视图与人设；视图每次启动默认 Work，persona 随之收敛。
  React.useEffect(() => {
    const derivedPersona: Persona = sidebarSegment === "tasks" ? "work" : "code"
    if (appSettings.settings.persona !== derivedPersona) {
      void appSettings.setPersona(derivedPersona)
    }
  }, [sidebarSegment, appSettings.settings.persona])

  React.useEffect(() => {
    writeStoredTaskSortMode(globalThis.localStorage, taskSortMode)
  }, [taskSortMode])

  React.useEffect(() => {
    if (pendingCaughtUp) {
      setPendingChatTransition(null)
    }
  }, [pendingCaughtUp])

  React.useEffect(() => {
    if (
      draftProjectId &&
      draftProjectId !== NO_DRAFT_PROJECT_ID &&
      !visibleProjects.some((project) => project.id === draftProjectId)
    ) {
      setDraftProjectId(null)
    }
  }, [draftProjectId, visibleProjects])

  React.useEffect(() => {
    lastChatProjectId.current = null
  }, [sessionScope])

  React.useEffect(() => {
    if (activePendingChatTransition && status === "error") {
      setPendingChatTransition(null)
    }
  }, [activePendingChatTransition, status])

  const handleComposerStateChange = React.useCallback(
    (state: ComposerState): void => {
      const cached = toCachedComposerState(state)
      if (hasComposerDraftContent(cached)) {
        composerDraftsByKey.current.set(activeComposerDraftKey, cached)
      } else {
        composerDraftsByKey.current.delete(activeComposerDraftKey)
      }
    },
    [activeComposerDraftKey],
  )

  const clearComposerDraft = React.useCallback((draftKey: string): void => {
    const draft = composerDraftsByKey.current.get(draftKey)
    if (draft) {
      releaseAttachmentSnapshots(draft.attachments)
    }
    composerDraftsByKey.current.delete(draftKey)
  }, [])
  const commitComposerDraft = React.useCallback((draftKey: string): void => {
    composerDraftsByKey.current.delete(draftKey)
  }, [])
  const clearAllComposerDrafts = React.useCallback((): void => {
    for (const draft of composerDraftsByKey.current.values()) {
      releaseAttachmentSnapshots(draft.attachments)
    }
    composerDraftsByKey.current.clear()
  }, [])
  const readLastProjectId = React.useCallback((): string | null => lastChatProjectId.current, [])
  const {
    handleNewSession,
    handleNewTaskSession,
    handleOpenProjectDraft,
    handleSelectComposerProject,
    handleSelectComposerProjectFolder,
    handleSelectProjectFolder,
    handleSelectSession: navigateToSession,
    requestComposerFocus,
  } = useComposerNavigation({
    activeChatSessionId,
    activeSession,
    assignSessionProject,
    clearComposerDraft,
    createProject,
    draftProjectId,
    isDraftSession,
    lastProjectId: readLastProjectId,
    releaseTransientFocus,
    route,
    sessionScope,
    setComposerFocusRequest,
    setDraftPermissionMode,
    setDraftProjectId,
    setIsDraftSession,
    setPendingChatTransition,
    setRoute,
    setSearchOpen,
    setSelectedSessionId,
  })
  const handleSelectSession = React.useCallback(
    (session: SessionInfo): void => {
      navigateToSession(session)
      void markSessionViewed(session.id)
    },
    [markSessionViewed, navigateToSession],
  )
  const handleNewSessionWithKnowledgeReset = React.useCallback((): void => {
    setDraftKnowledgeBaseIds([])
    handleNewSession()
  }, [handleNewSession])
  const {
    forgetSession: forgetComposerSubmissionSession,
    isDraftSendInFlight,
    isSendInFlight,
    memory: {
      contextMentionsBySession: lastContextMentionsBySession,
      modeBySession: lastModeBySession,
      modelBySession: lastModelBySession,
      permissionModeBySession: lastPermissionModeBySession,
      reasoningLevelBySession: lastReasoningLevelBySession,
      retryOptionsBySession: turnRetryOptionsBySession,
    },
    resetMemory: resetComposerSubmissionMemory,
    sendNow,
  } = useComposerSubmission({
    activeChatSessionId,
    activeComposerDraftKey,
    activeProject,
    activeProjectContext,
    activeSession,
    createSession: create,
    currentScopeKey,
    displayedPermissionMode,
    messages,
    messagesLoaded,
    knowledgeBaseIds: activeKnowledgeBaseIds,
    persistKnowledgeBaseIds,
    persistPermissionMode,
    send,
    sessionScope,
    setIsDraftSession,
    setPendingChatTransition,
    setRoute,
    setSelectedSessionId,
    titleGeneration,
  })

  const {
    activeQueueHeld,
    activeQueuedMessages,
    clearQueuedSession,
    handleQueuedMessageMove,
    handleQueuedMessageRemove,
    handleQueuedMessageResume,
    holdQueuedSessionIfQueued,
    queueActiveMessage,
    releaseActiveQueue,
  } = useChatQueueState({
    activeSessionId: activeChatSessionId,
    dispatchBlocked: chatTurnQueuesNewMessage(activeChatTurnState),
    initialSendPending,
    isSendInFlight,
    sendQueuedMessage: sendNow,
    status,
  })
  const {
    handleAddKnowledgeBaseReference,
    handleOpenKnowledgeLibrary,
    handleStartKnowledgeChat,
    knowledgeDirectory,
    knowledgeTitlebarNavigationVersion,
    pinnedKnowledgeContextBar,
    pinnedKnowledgeMentions,
    setKnowledgeDirectory,
    setKnowledgeTitlebarNavigationVersion,
  } = useAppShellKnowledge({
    activeChatSessionId,
    activeKnowledgeBaseIds,
    activeQueuedMessageCount: activeQueuedMessages.length,
    appSettingsLoading: appSettings.loading,
    handleNewTaskSession,
    knowledgeBaseBetaEnabled,
    knowledgeLibrary,
    persistKnowledgeBaseIds,
    route,
    setDraftKnowledgeBaseIds,
    setRoute,
  })
  const titlebarBreadcrumbs =
    route === "knowledge" && knowledgeBaseBetaEnabled
      ? knowledgeBreadcrumbs(knowledgeDirectory, t("knowledge.title"))
      : undefined
  const previousQueuedSessionIdRef = React.useRef(activeChatSessionId)
  React.useEffect(() => {
    const previousSessionId = previousQueuedSessionIdRef.current
    if (previousSessionId && previousSessionId !== activeChatSessionId) {
      holdQueuedSessionIfQueued(previousSessionId)
    }
    previousQueuedSessionIdRef.current = activeChatSessionId
  }, [activeChatSessionId, holdQueuedSessionIfQueued])

  const {
    archiveProjectWithRuntimeCleanup,
    archiveSessionsWithRuntimeCleanup,
    handleSessionArchived,
    removeSessionWithRuntimeCleanup,
    removeSessionsWithRuntimeCleanup,
  } = useAppShellRuntimeCleanup({
    activeChatSessionId,
    archiveMany,
    archiveProjectAction,
    clearComposerDraft,
    clearQueuedSession,
    currentScopeKey,
    forgetChatSession,
    forgetComposerSubmissionSession,
    isSessionRunning,
    removeMany,
    removeSession,
    selectableSidebarSessions,
    sessionsSettledForCurrentScope,
    setPendingChatTransition,
    setIsDraftSession,
    setRoute,
    setSelectedSessionId,
    visibleSessions,
  })
  const sessionActions = useSessionActions({
    archive,
    clearAutoFallbackTitle,
    isSessionRunning,
    onArchived: handleSessionArchived,
    pin,
    rename,
    sessions: visibleSessions,
  })
  const projectActions = useProjectActions({
    archiveProject: archiveProjectWithRuntimeCleanup,
    onProjectUnavailable: handleProjectUnavailable,
    pinProject: pinProjectAction,
    projects: visibleProjects,
    removeProject: removeProjectAction,
    renameProject: renameProjectAction,
  })

  React.useEffect(() => {
    if (activeChatSessionId) {
      previousActiveChatSessionIdRef.current = activeChatSessionId
    }
  }, [activeChatSessionId])

  React.useLayoutEffect(() => {
    const previousWorkspaceKey = workspaceResetKeyRef.current
    if (previousWorkspaceKey === activeWorkspaceKey) {
      return
    }
    workspaceResetKeyRef.current = activeWorkspaceKey
    const previousSessionId = previousActiveChatSessionIdRef.current
    if (previousSessionId) {
      holdQueuedSessionIfQueued(previousSessionId)
    }
    previousActiveChatSessionIdRef.current = null
    resetChatSessionCache()
    resetComposerSubmissionMemory()
    clearAllComposerDrafts()
    setSelectedSessionId(null)
    setIsDraftSession(false)
    setDraftPermissionMode("default")
    setDraftKnowledgeBaseIds([])
    setDraftProjectId(null)
    setPendingChatTransition(null)
    sessionActions.resetDialogs()
    projectActions.resetDialogs()
    handleArtifactsReset()
    releaseTransientFocus()
  }, [
    activeWorkspaceKey,
    clearAllComposerDrafts,
    handleArtifactsReset,
    holdQueuedSessionIfQueued,
    projectActions.resetDialogs,
    resetChatSessionCache,
    resetComposerSubmissionMemory,
    sessionActions.resetDialogs,
  ])
  React.useEffect(() => {
    if (!sessionsSettledForCurrentScope || !activeChatSessionId) {
      return
    }
    if (visibleSessions.some((session) => session.id === activeChatSessionId)) {
      return
    }
    clearQueuedSession(activeChatSessionId)
  }, [activeChatSessionId, clearQueuedSession, sessionsSettledForCurrentScope, visibleSessions])

  const {
    handleAnswerPermission,
    handleAnswerQuestion,
    handleChatErrorRecovery,
    handleChatStop,
    handleRejectQuestion,
    handleRetryFresh,
    handleSend,
    handleStopGenerationCommand,
  } = useAppShellChatHandlers({
    activeChatSessionId,
    activeChatTurnState,
    activeComposerDraftKey,
    activeKnowledgeBaseIds,
    activeProject,
    activeProjectContext,
    answerPermission,
    answerQuestion,
    commitComposerDraft,
    create,
    displayedPermissionMode,
    displayedStatus,
    isDraftSendInFlight,
    lastContextMentionsBySession,
    lastModeBySession,
    lastModelBySession,
    lastPermissionModeBySession,
    lastReasoningLevelBySession,
    persistKnowledgeBaseIds,
    persistPermissionMode,
    pinnedKnowledgeMentions,
    queueActiveMessage,
    ready,
    rejectQuestion,
    releaseActiveQueue,
    send,
    sendNow,
    sessionScope,
    setIsDraftSession,
    setPendingChatTransition,
    setRoute,
    setSelectedSessionId,
    stop,
    titleGeneration,
    turnRetryOptionsBySession,
  })
  const handleOpenSearch = React.useCallback((): void => setSearchOpen(true), [])
  const handleOpenSettingsCommand = React.useCallback((): void => {
    setSearchOpen(false)
    setRoute("settings")
  }, [])
  const handleArtifactsToggle = React.useCallback((): void => {
    // 面板总开关：收起时保留标签；无标签展开时如有最新成果则默认打开"成果"标签。
    // 以 rightPanelVisible（route === "chat" && artifactsPanelOpen）为准，避免非 chat 路由下
    // artifactsPanelOpen=true 但面板不可见时，按钮态与实际可见态错位导致"点不开"。
    // 关闭面板时同步收起浏览器状态（browserPanelOpen=false），否则切到其他会话时
    // browserPanelOpen 残留会让右侧面板自动打开。
    if (rightPanelVisible) {
      setArtifactsPanelOpen(false)
      closeBrowserPanel()
      return
    }
    if (rightPanelTabs.length === 0 && latestArtifactSelection) {
      openArtifact(latestArtifactSelection, "manual")
    }
    setArtifactsPanelOpen(true)
  }, [
    closeBrowserPanel,
    latestArtifactSelection,
    openArtifact,
    rightPanelTabs.length,
    rightPanelVisible,
    setArtifactsPanelOpen,
  ])
  // AI 请求浏览器（browserRequested）时自动打开浏览器标签并展开面板；
  // 浏览器入口统一走右侧面板标签，标题栏不再提供独立开关。
  React.useEffect(() => {
    if (!browserPanelOpen || !activeChatSessionId) {
      return
    }
    if (rightPanelTabs.some((tab) => tab.kind === "browser" && tab.sessionId === activeChatSessionId)) {
      return
    }
    openBrowser(activeChatSessionId)
    setArtifactsPanelOpen(true)
  }, [activeChatSessionId, browserPanelOpen, openBrowser, rightPanelTabs, setArtifactsPanelOpen])
  const handleArtifactsOpen = React.useCallback(
    (selection: ArtifactSelection): void => {
      openArtifact(selection, "manual")
      setArtifactsPanelOpen(true)
    },
    [openArtifact, setArtifactsPanelOpen],
  )
  const handleArtifactsAvailable = React.useCallback(
    (selection: ArtifactSelection): void => {
      openArtifact(selection, "auto")
    },
    [openArtifact],
  )
  const handleTurnOutputOpen = React.useCallback(
    (selection: TurnOutputSelection): void => {
      openTurnOutput(selection, "manual")
      setArtifactsPanelOpen(true)
    },
    [openTurnOutput, setArtifactsPanelOpen],
  )
  const handleTurnOutputAvailable = React.useCallback(
    (selection: TurnOutputSelection): void => {
      openTurnOutput(selection, "auto")
    },
    [openTurnOutput],
  )
  const handleCloseRightPanelTab = React.useCallback(
    (id: string): void => {
      const tab = rightPanelTabs.find((candidate) => candidate.id === id)
      closeTabById(id)
      if (tab?.kind === "browser") {
        closeBrowserPanel()
      }
      if (rightPanelTabs.length <= 1) {
        setArtifactsPanelOpen(false)
      }
    },
    [closeBrowserPanel, closeTabById, rightPanelTabs, setArtifactsPanelOpen],
  )
  // 标签栏"+"：手动打开当前会话的浏览器标签。走 navigate → 主进程 browserRequested →
  // 现有自动打开链路（面板展开 + tab 建 + 状态就绪），无需额外接线。
  const handleAddRightPanelTab = React.useCallback((): void => {
    if (!activeChatSessionId) {
      return
    }
    void browserService
      .invoke("navigate", { sessionId: activeChatSessionId, url: "about:blank" })
      .catch((cause: unknown) => {
        reportRendererHandledError("browser", "open new browser tab failed", cause)
      })
  }, [activeChatSessionId, browserService])
  // 加号菜单（对齐 LobsterAI artifactAddTab）：按类型选择打开的标签；不可用项置灰并说明原因，
  // 草稿态（无活跃会话）点开也有明确反馈，不再静默无响应。
  const addTabOptions = React.useMemo<AddTabOption[]>(() => {
    const openPanel = (): void => {
      setArtifactsPanelOpen(true)
    }
    return [
      {
        kind: "browser",
        label: t("rightPanel.tabBrowser"),
        hint: t("rightPanel.addBrowserHint"),
        disabled: !activeChatSessionId,
        onSelect: handleAddRightPanelTab,
      },
      {
        kind: "artifact",
        label: t("rightPanel.tabArtifacts"),
        hint: t("rightPanel.addArtifactsHint"),
        disabled: !latestArtifactSelection,
        onSelect: () => {
          if (!latestArtifactSelection) return
          openArtifact(latestArtifactSelection, "manual")
          openPanel()
        },
      },
      {
        kind: "turn-output",
        label: t("rightPanel.tabReview"),
        hint: t("rightPanel.addReviewHint"),
        disabled: !latestTurnOutputSelection,
        onSelect: () => {
          if (!latestTurnOutputSelection) return
          openTurnOutput(latestTurnOutputSelection, "manual")
          openPanel()
        },
      },
    ]
  }, [
    activeChatSessionId,
    handleAddRightPanelTab,
    latestArtifactSelection,
    latestTurnOutputSelection,
    openArtifact,
    openTurnOutput,
    setArtifactsPanelOpen,
    t,
  ])
  useAppShellCommands({
    appUpdate,
    onFocusComposer: requestComposerFocus,
    onNewChat: handleNewSessionWithKnowledgeReset,
    onOpenSearch: handleOpenSearch,
    onOpenSettings: handleOpenSettingsCommand,
    onStopGeneration: handleStopGenerationCommand,
    onToggleSidebar: handleToggleSidebar,
  })
  const handlePermissionModeChange = React.useCallback(
    (mode: AgentPermissionMode): void => {
      if (activeChatSessionId) {
        void persistPermissionMode(activeChatSessionId, mode).catch(() => undefined)
        return
      }
      setDraftPermissionMode(mode)
    },
    [activeChatSessionId, persistPermissionMode],
  )

  const handleCompact = React.useCallback((): void => {
    if (!activeChatSessionId) {
      return
    }
    void compact(activeChatSessionId).catch((cause: unknown) => {
      console.error("[dweis] compact session failed", cause)
    })
  }, [activeChatSessionId, compact])
  const handleUndo = React.useCallback((): void => {
    if (!activeChatSessionId) {
      return
    }
    void undo(activeChatSessionId).catch((cause: unknown) => {
      console.error("[dweis] undo session failed", cause)
    })
  }, [activeChatSessionId, undo])
  const handleRedo = React.useCallback((): void => {
    if (!activeChatSessionId) {
      return
    }
    void redo(activeChatSessionId).catch((cause: unknown) => {
      console.error("[dweis] redo session failed", cause)
    })
  }, [activeChatSessionId, redo])
  const handleRunShellCommand = React.useCallback(
    (command: string): void => {
      if (!activeChatSessionId) {
        return
      }
      void runShellCommand(activeChatSessionId, command).catch((cause: unknown) => {
        console.error("[dweis] run shell command failed", cause)
      })
    },
    [activeChatSessionId, runShellCommand],
  )
  const newChatShortcut = appCommandShortcutLabel(APP_COMMANDS.newChat)
  const newChatLabel = labelWithShortcut(
    sidebarSegment === "projects" && activeProject ? t("project.newTask") : t("sidebar.newSession"),
    newChatShortcut,
  )
  const composerProjectContext = React.useMemo(
    () =>
      showComposerProjectContext ? (
        <ProjectContextBar
          activeProject={activeProject}
          disabled={projectContextControlsDisabled(
            activeChatSessionId,
            Boolean(activeChatSessionId && isSessionRunning(activeChatSessionId)),
          )}
          gitError={projectGit.error}
          gitLoading={projectGit.loading}
          gitState={projectGit.state}
          projects={visibleProjects}
          onCheckoutBranch={projectGit.checkoutBranch}
          onCreateAndCheckoutBranch={projectGit.createAndCheckoutBranch}
          onCreateProject={() => void handleSelectComposerProjectFolder()}
          onRefreshGit={projectGit.refresh}
          onSelectProject={handleSelectComposerProject}
        />
      ) : null,
    [
      activeChatSessionId,
      activeProject,
      handleSelectComposerProject,
      handleSelectComposerProjectFolder,
      isSessionRunning,
      projectGit.checkoutBranch,
      projectGit.createAndCheckoutBranch,
      projectGit.error,
      projectGit.loading,
      projectGit.refresh,
      projectGit.state,
      showComposerProjectContext,
      visibleProjects,
    ],
  )
  const handleArchiveProjectDialog = React.useCallback(
    (project: Parameters<typeof projectActions.handleArchive>[0]): void => {
      void projectActions.handleArchive(project)
    },
    [projectActions.handleArchive],
  )
  const handleArchiveSessionDialog = React.useCallback(
    (session: Parameters<typeof sessionActions.handleArchive>[0]): void => {
      void sessionActions.handleArchive(session)
    },
    [sessionActions.handleArchive],
  )
  const handleCloseSearch = React.useCallback((): void => setSearchOpen(false), [])
  const handleRemoveProjectDialog = React.useCallback(
    (project: Parameters<typeof projectActions.handleRemove>[0]): void => {
      void projectActions.handleRemove(project)
    },
    [projectActions.handleRemove],
  )
  const handleRenameProjectDialog = React.useCallback(
    (projectId: string, name: string): void => {
      void projectActions.handleRename(projectId, name)
    },
    [projectActions.handleRename],
  )
  const handleSearchSelect = React.useCallback(
    (session: SessionInfo): void => {
      handleSelectSession(session)
      setPendingChatTransition(null)
      setSearchOpen(false)
    },
    [handleSelectSession],
  )

  const settingsCategory: SettingsCategory = route.startsWith("settings/")
    ? (route.slice("settings/".length) as SettingsCategory)
    : "appearance"

  if (route === "settings" || route.startsWith("settings/")) {
    return (
      <>
        <React.Suspense fallback={<RouteLoadingFallback />}>
          <SettingsRoute
            category={settingsCategory}
            onNavigateCategory={(category) => setRoute(`settings/${category}`)}
            update={appUpdate}
            titlebarActions={<AppUpdateTitlebarEntry update={appUpdate} />}
            onBack={() => setRoute("chat")}
          />
        </React.Suspense>
      </>
    )
  }

  if (route === "archived") {
    return (
      <>
        <React.Suspense fallback={<RouteLoadingFallback />}>
          <ArchivedRoute
            listArchived={listArchived}
            onBack={() => setRoute("chat")}
            refreshSessions={refreshSessions}
            removeSession={removeSessionWithRuntimeCleanup}
            ready={ready}
            titlebarActions={<AppUpdateTitlebarEntry update={appUpdate} />}
            unarchiveSession={unarchive}
          />
        </React.Suspense>
      </>
    )
  }

  return (
    <div
      ref={appChromeRef}
      className={cn(
        "oo-app-chrome grid h-full text-foreground",
        sidebarCollapsed && "oo-sidebar-collapsed",
        isSidebarRestoring && "oo-sidebar-restoring",
        isSidebarResizing && "oo-sidebar-resizing",
        isArtifactsPanelResizing && "oo-artifacts-panel-resizing",
      )}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <AppShellNavigationSidebar
        activeRoute={route}
        selectedSessionId={selectedSessionId}
        collapsed={sidebarCollapsed}
        collapsedProjectIds={collapsedProjectIds}
        hasUnreadSession={hasUnreadSession}
        isSessionRunning={isSessionRunning}
        newChatLabel={newChatLabel}
        projectPinnedGroups={projectPinnedGroups}
        projectPinnedSessions={projectPinnedSessions}
        projectRegularGroups={projectRegularGroups}
        projectSessions={visibleProjectSessions}
        restoring={isSidebarRestoring}
        sessionsError={sessionsError}
        showKnowledge={knowledgeBaseBetaEnabled}
        sidebarSegment={sidebarSegment}
        sidebarSessionGroups={sidebarSessionGroups}
        taskSessions={visibleTaskSessions}
        width={sidebarWidth}
        onArchiveProjectRequest={projectActions.requestArchive}
        onArchiveSessionRequest={sessionActions.requestArchive}
        onManageTasks={() => setTasksDialogOpen(true)}
        onNavigate={setRoute}
        onNewSession={handleNewSessionWithKnowledgeReset}
        onOpenSearch={handleOpenSearch}
        onPinProject={projectActions.handlePin}
        onPinSession={sessionActions.handlePin}
        onProjectExpandedChange={handleProjectSidebarExpandedChange}
        onRemoveProjectRequest={projectActions.requestRemove}
        onRenameProjectRequest={projectActions.requestRename}
        onRenameSessionRequest={sessionActions.requestRename}
        onSelectProjectDraft={handleOpenProjectDraft}
        onSelectProjectFolder={handleSelectProjectFolder}
        onSelectSession={handleSelectSession}
        onSetSidebarSegment={setSidebarSegment}
        onSetTaskSortMode={setTaskSortMode}
        onShowProjectInFolder={projectActions.handleShowInFolder}
        onSidebarResizeKeyDown={handleSidebarResizeKeyDown}
        onSidebarResizeStart={handleSidebarResizeStart}
        onToggleSidebar={handleToggleSidebar}
        taskSortMode={taskSortMode}
      />

      {/* 右：主区（顶部工具条横跨全宽 + 下方聊天区/右侧面板横排） */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <AppShellMainTitlebar
          activeSession={activeSession ?? null}
          appUpdate={appUpdate}
          isSidebarRestoring={isSidebarRestoring}
          rightPanelOpen={rightPanelVisible}
          rightPanelToggleLabel={rightPanelVisible ? t("artifacts.collapse") : t("artifacts.expand")}
          sidebarCollapsed={sidebarCollapsed}
          titlebarEditable={titlebarEditable}
          titlebarBreadcrumbs={titlebarBreadcrumbs}
          titlebarTitle={titlebarTitle}
          onOpenSearch={handleOpenSearch}
          onRenameSession={sessionActions.handleRename}
          onRightPanelToggle={handleArtifactsToggle}
          onTitlebarBreadcrumbNavigate={(path) => {
            setKnowledgeDirectory(normalizeKnowledgePath(path))
            setKnowledgeTitlebarNavigationVersion((version) => version + 1)
          }}
          onTogglePlanPanel={() => setPlanPanelOpen((value) => !value)}
          onToggleSidebar={handleToggleSidebar}
          planPanelOpen={planPanelOpen}
        />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <main className="oo-content-surface relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <React.Suspense fallback={<RouteLoadingFallback />}>
              {route === "skills" ? (
                <SkillsRoute />
              ) : route === "automation" ? (
                <AutomationRoute
                  onOpenSession={(sessionId) => {
                    // 历史记录跳会话：对齐 handleSelectSession 的选中语义（结束草稿态并回聊天）。
                    setSelectedSessionId(sessionId)
                    setIsDraftSession(false)
                    setRoute("chat")
                  }}
                />
              ) : route === "knowledge" && knowledgeBaseBetaEnabled ? (
                <KnowledgeRoute
                  currentDirectory={knowledgeDirectory}
                  knowledge={knowledgeLibrary}
                  titlebarNavigationVersion={knowledgeTitlebarNavigationVersion}
                  onCurrentDirectoryChange={setKnowledgeDirectory}
                  onStartChat={handleStartKnowledgeChat}
                />
              ) : (
                <div className="flex h-full min-h-0 overflow-hidden">
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <ChatArea
                      activeSessionId={activeChatSessionId}
                      composerDraftKey={activeComposerDraftKey}
                      messages={bridgeInitialSendPending ? [] : messages}
                      knowledgeBaseIds={activeKnowledgeBaseIds}
                      knowledgeEnabled={knowledgeBaseBetaEnabled}
                      knowledgeError={
                        knowledgeLibrary.error ? userFacingErrorDescription(knowledgeLibrary.error, t) : null
                      }
                      knowledgeItems={knowledgeLibrary.items}
                      knowledgeLoading={knowledgeLibrary.loading}
                      modelRequired={modelRequired}
                      permissionMode={displayedPermissionMode}
                      pendingPermissions={bridgeInitialSendPending ? [] : pendingPermissions}
                      pendingQuestions={bridgeInitialSendPending ? [] : pendingQuestions}
                      status={displayedStatus}
                      activity={bridgeInitialSendPending ? null : activity}
                      showEmptyState={showChatEmptyState}
                      bootstrapping={chatBootstrapping}
                      startupError={startupError}
                      onStartupRetry={sessionSnapshotError ? retrySessionSnapshot : undefined}
                      error={error}
                      emptyTitle={chatEmptyTitle}
                      generatedArtifacts={latestArtifactSelection}
                      historyScope="local"
                      submitDisabled={chatSubmitDisabled}
                      willQueueMessage={Boolean(
                        activeChatSessionId && (!chatTurnAllowsDirectSend(activeChatTurnState) || isSendInFlight()),
                      )}
                      initialComposerState={initialComposerState}
                      initialSendPending={initialSendPending}
                      composerFocusRequest={composerFocusRequest}
                      queueHeld={activeQueueHeld}
                      queuedMessages={activeQueuedMessages}
                      contextBar={composerProjectContext}
                      pinnedContextBar={pinnedKnowledgeContextBar}
                      placeholder={
                        startupError
                          ? t("error.agent.title")
                          : modelRequired
                            ? t("chat.modelRequiredPlaceholder")
                            : ready
                              ? sidebarSegment === "tasks"
                                ? t("chat.inputPlaceholderWork")
                                : t("chat.inputPlaceholderCode")
                              : t("chat.agentStarting")
                      }
                      onComposerStateChange={handleComposerStateChange}
                      onSend={handleSend}
                      onAnswerQuestion={handleAnswerQuestion}
                      onAnswerPermission={handleAnswerPermission}
                      onPermissionModeChange={handlePermissionModeChange}
                      onRejectQuestion={handleRejectQuestion}
                      questionDrafts={questionDrafts}
                      onStop={handleChatStop}
                      onQueuedMessageMove={handleQueuedMessageMove}
                      onQueuedMessageRemove={handleQueuedMessageRemove}
                      onQueuedMessageResume={handleQueuedMessageResume}
                      onRecover={handleChatErrorRecovery}
                      onRetryFresh={handleRetryFresh}
                      onArtifactsOpen={handleArtifactsOpen}
                      onArtifactsAvailable={handleArtifactsAvailable}
                      onTurnOutputOpen={handleTurnOutputOpen}
                      onTurnOutputAvailable={handleTurnOutputAvailable}
                      onOpenKnowledgeLibrary={handleOpenKnowledgeLibrary}
                      onSelectKnowledgeBase={handleAddKnowledgeBaseReference}
                      onCompact={handleCompact}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      onRunShellCommand={handleRunShellCommand}
                    />
                  </div>
                </div>
              )}
            </React.Suspense>
            {route === "chat" ? (
              <React.Suspense fallback={null}>
                <PlanSummaryPanel
                  key={activeChatSessionId ?? "draft"}
                  activeSessionId={activeChatSessionId}
                  className="absolute top-2 right-2 z-50 w-72 max-w-[calc(100%-1rem)]"
                  messages={messages}
                  onOpenArtifact={handleArtifactsOpen}
                  onOpenChange={setPlanPanelOpen}
                  open={planPanelOpen}
                />
              </React.Suspense>
            ) : null}
          </main>

          <AppShellRightPanel
            activeTab={activeRightPanelTab}
            activeTabId={activeRightPanelTabId}
            artifactSelection={activeRightPanelTab?.kind === "artifact" ? activeRightPanelTab.selection : null}
            artifactsPanelContentRef={artifactsPanelContentRef}
            artifactsPanelIsMaximized={artifactsPanelIsMaximized}
            artifactsPanelMaxWidthState={artifactsPanelMaxWidthState}
            artifactsPanelShellRef={artifactsPanelShellRef}
            browserService={browserService}
            browserState={browserState}
            handleArtifactsPanelResizeKeyDown={handleArtifactsPanelResizeKeyDown}
            handleArtifactsPanelResizeStart={handleArtifactsPanelResizeStart}
            isArtifactsPanelResizing={isArtifactsPanelResizing}
            onActivateTab={setActiveTabId}
            addTabOptions={addTabOptions}
            onCloseTab={handleCloseRightPanelTab}
            rightPanelVisible={rightPanelVisible}
            setArtifactsPanelMaximizedState={setArtifactsPanelMaximizedState}
            tabs={rightPanelTabs}
            turnOutputSelection={activeRightPanelTab?.kind === "turn-output" ? activeRightPanelTab.selection : null}
            visibleRightPanelWidth={visibleRightPanelWidth}
            onSetTabTitle={setTabTitle}
          />
        </div>
      </div>

      <AppShellSessionProjectDialogs
        archiveConfirming={sessionActions.archiveConfirming}
        archiveProjectConfirming={projectActions.archiveConfirming}
        archiveProjectTarget={projectActions.archiveTarget}
        archiveSession={sessionActions.archiveTarget}
        openSearch={searchOpen}
        removeProjectConfirming={projectActions.removeConfirming}
        removeProjectTarget={projectActions.removeTarget}
        renameProjectTarget={projectActions.renameTarget}
        renameSession={sessionActions.renameTarget}
        sessions={visibleSessions}
        onArchiveProject={handleArchiveProjectDialog}
        onArchiveSession={handleArchiveSessionDialog}
        onCloseArchiveProject={projectActions.closeArchive}
        onCloseArchiveSession={sessionActions.closeArchive}
        onCloseRemoveProject={projectActions.closeRemove}
        onCloseRenameProject={projectActions.closeRename}
        onCloseRenameSession={sessionActions.closeRename}
        onCloseSearch={handleCloseSearch}
        onRemoveProject={handleRemoveProjectDialog}
        onRenameProject={handleRenameProjectDialog}
        onRenameSession={sessionActions.handleRename}
        onSearchSelect={handleSearchSelect}
      />
      <React.Suspense fallback={null}>
        <TasksDialog
          archiveSessions={archiveSessionsWithRuntimeCleanup}
          isSessionRunning={isSessionRunning}
          open={tasksDialogOpen}
          removeSessions={removeSessionsWithRuntimeCleanup}
          sessions={visibleTaskSessions}
          sortMode={taskSortMode}
          onClose={() => setTasksDialogOpen(false)}
          onSortModeChange={setTaskSortMode}
        />
      </React.Suspense>
    </div>
  )
}
