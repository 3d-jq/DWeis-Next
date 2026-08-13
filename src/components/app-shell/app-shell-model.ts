import type {
  AgentMode,
  AgentPermissionMode,
  ChatAttachment,
  ChatContextMention,
  ChatProjectContext,
  ChatMessage,
  ReasoningLevel,
} from "../../../electron/chat/common.ts"
import type { GitRepositoryState } from "../../../electron/git/common.ts"
import type { ModelChoice } from "../../../electron/models/common.ts"
import type { SessionInfo, SessionProject, SessionScope } from "../../../electron/session/common.ts"
import type { AppShellRoute as Route, SettingsCategory } from "./app-shell-types.ts"
import type { QueuedChatMessage } from "./chat-queue.ts"
import type { WorkspaceSelection } from "@/hooks/useTeamWorkspace"
import type { UserFacingError } from "@/lib/user-facing-error"

import {
  DEFAULT_LOCAL_WORKSPACE,
  sessionScopeKey as resolvedSessionScopeKey,
} from "../../../electron/session/common.ts"
import { shouldAutoRefreshSessionTitle } from "../../../electron/session/title.ts"
import { visibleUserText } from "@/routes/Chat/message-text"
import { storageKey } from "../../../electron/branding.ts"

export const SIDEBAR_RESTORE_DELAY_MS = 260
export const SIDEBAR_AUTO_COLLAPSE_MAX_WIDTH_PX = 720
export const SIDEBAR_DEFAULT_WIDTH_PX = 264
export const SIDEBAR_MIN_WIDTH_PX = 220
export const SIDEBAR_MAX_WIDTH_PX = 420
export const SIDEBAR_WIDTH_STORAGE_KEY = storageKey("sidebarWidth")
// 聊天区最小宽度。曾为 420：侧边栏展开（264）时面板最大宽度在 1080 窗口下只剩 277，
// 默认面板 300 打开即被压到上限，向左拖（变宽）直接锁死，表现为"手柄拖不动"。
// 降到 240 后同一窗口下面板最大宽度 576（240 仍可舒适读聊天气泡）。
export const CHAT_AREA_MIN_WIDTH_PX = 240
export const ARTIFACTS_PANEL_DEFAULT_WIDTH_PX = 300
export const ARTIFACTS_PANEL_MIN_WIDTH_PX = 260
export const ARTIFACTS_PANEL_WIDTH_STORAGE_KEY = storageKey("artifactsPanelWidth")
export const BROWSER_PANEL_DEFAULT_WIDTH_PX = 480
export const BROWSER_PANEL_WIDTH_STORAGE_KEY = storageKey("browserPanelWidth")
export const TURN_RETRY_OPTIONS_LIMIT = 48
export const SESSION_TITLE_RETRY_DELAY_MS = 20_000
export const WORKSPACE_SWITCH_TIMEOUT_MS = 20_000
export const NEW_SESSION_COMPOSER_DRAFT_KEY = "__new_session__"
export const NO_DRAFT_PROJECT_ID = "__no_project__"

export interface TurnRetryOptions {
  contextMentions?: ChatContextMention[]
  projectContext?: ChatProjectContext
  model?: ModelChoice
  reasoningLevel?: ReasoningLevel
  mode?: AgentMode
  permissionMode?: AgentPermissionMode
  sessionScope?: SessionScope
}

export interface ChatSendRequest {
  afterOptimisticSubmit?: () => void
  attachments?: ChatAttachment[]
  contextMentions?: ChatContextMention[]
  mode?: AgentMode
  model?: ModelChoice
  permissionMode?: AgentPermissionMode
  projectContext?: ChatProjectContext
  reasoningLevel?: ReasoningLevel
  sessionScope?: SessionScope
  text: string
}

export type ChatSendRejectedReason = "send_in_flight" | "workspace_not_ready"

export type ChatSendResult =
  | { delivery: "queued" | "sent"; status: "accepted" }
  | { reason: ChatSendRejectedReason; status: "rejected" }
  | { error: unknown; status: "failed" }

export function chatSendAccepted(result: ChatSendResult): boolean {
  return result.status === "accepted"
}

export function rememberTurnRetryOptions(
  store: Map<string, Map<string, TurnRetryOptions>>,
  sessionId: string,
  key: string,
  options: TurnRetryOptions,
): void {
  const sessionStore = store.get(sessionId) ?? new Map<string, TurnRetryOptions>()
  sessionStore.set(key, options)
  while (sessionStore.size > TURN_RETRY_OPTIONS_LIMIT) {
    const first = sessionStore.keys().next()
    if (first.done) {
      break
    }
    sessionStore.delete(first.value)
  }
  store.set(sessionId, sessionStore)
}

export function buildSessionTitleInput(
  messages: ChatMessage[],
  text: string,
  attachments: ChatAttachment[],
): { text: string; attachmentNames?: string[] } {
  const recentUserMessages = messages
    .filter((message) => message.role === "user")
    .map(chatMessageText)
    .map((messageText) => messageText.trim())
    .filter(Boolean)
    .slice(-3)
  const currentText = text.trim()
  const titleText = [...recentUserMessages, currentText].filter(Boolean).join("\n\n")
  const attachmentNames = attachments.map((attachment) => attachment.name.trim()).filter(Boolean)
  return {
    text: titleText || attachmentNames.join("\n"),
    ...(attachmentNames.length > 0 ? { attachmentNames } : {}),
  }
}

export function sessionTitleGenerationKey(
  input: { text: string; attachmentNames?: string[]; model?: ModelChoice },
  allowPlaceholder: boolean,
  replaceableTitle?: string,
): string {
  return JSON.stringify({
    allowPlaceholder,
    attachmentNames: input.attachmentNames ?? [],
    model: input.model ?? null,
    replaceableTitle: replaceableTitle ?? "",
    text: input.text,
  })
}

export function isSessionTitleAutoRefreshable(
  session: SessionInfo,
  allowPlaceholder: boolean,
  fallbackTitles: Map<string, string>,
  fallbackTitle?: string,
): boolean {
  return (
    shouldAutoRefreshSessionTitle(session.title, allowPlaceholder) ||
    fallbackTitles.get(session.id) === session.title ||
    fallbackTitle === session.title
  )
}

export function createQueuedChatMessage(
  sessionId: string,
  text: string,
  attachments: ChatAttachment[],
  contextMentions: ChatContextMention[] | undefined,
  model?: ModelChoice,
  reasoningLevel?: ReasoningLevel,
  mode?: AgentMode,
  permissionMode?: AgentPermissionMode,
  projectContext?: ChatProjectContext,
  sessionScope?: SessionScope,
): QueuedChatMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId,
    text,
    attachments,
    ...(contextMentions && contextMentions.length > 0 ? { contextMentions } : {}),
    model,
    ...(projectContext ? { projectContext } : {}),
    reasoningLevel,
    ...(sessionScope ? { sessionScope } : {}),
    mode,
    permissionMode,
    createdAt: Date.now(),
  }
}

export function initialRoute(): Route {
  const configuredRoute = (import.meta.env as Record<string, string | undefined>)["VITE_DWEIS_ROUTE"]
  if (
    configuredRoute === "settings" ||
    configuredRoute === "skills" ||
    configuredRoute === "knowledge" ||
    configuredRoute === "billing" ||
    configuredRoute === "archived"
  ) {
    return configuredRoute
  }
  if (configuredRoute?.startsWith("settings/")) {
    return configuredRoute as `settings/${SettingsCategory}`
  }
  return "chat"
}

export function routeAvailableForRuntime(route: Route, cloudEnabled: boolean): boolean {
  return cloudEnabled || route !== "billing"
}

export function projectContextControlsDisabled(activeSessionId: string | null, activeSessionRunning: boolean): boolean {
  return Boolean(activeSessionId && activeSessionRunning)
}

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, width))
}

export function readStoredSidebarWidth(): number {
  try {
    const stored = globalThis.localStorage?.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (!stored) {
      return SIDEBAR_DEFAULT_WIDTH_PX
    }
    const width = Number.parseInt(stored, 10)
    return Number.isFinite(width) ? clampSidebarWidth(width) : SIDEBAR_DEFAULT_WIDTH_PX
  } catch {
    return SIDEBAR_DEFAULT_WIDTH_PX
  }
}

export function clampArtifactsPanelWidth(width: number): number {
  return Math.max(ARTIFACTS_PANEL_MIN_WIDTH_PX, width)
}

export function artifactsPanelMaxWidth(appWidth: number, sidebarWidth: number, sidebarCollapsed: boolean): number {
  const sidebarTrackWidth = sidebarCollapsed ? 0 : sidebarWidth
  const maxWidth = Math.floor(appWidth - sidebarTrackWidth - CHAT_AREA_MIN_WIDTH_PX)
  return Math.max(ARTIFACTS_PANEL_MIN_WIDTH_PX, maxWidth)
}

export function clampArtifactsPanelWidthForLayout(width: number, maxWidth: number): number {
  return Math.min(maxWidth, clampArtifactsPanelWidth(width))
}

export function readStoredArtifactsPanelWidth(): number {
  try {
    const stored = globalThis.localStorage?.getItem(ARTIFACTS_PANEL_WIDTH_STORAGE_KEY)
    if (!stored) {
      return ARTIFACTS_PANEL_DEFAULT_WIDTH_PX
    }
    const width = Number.parseInt(stored, 10)
    return Number.isFinite(width) ? clampArtifactsPanelWidth(width) : ARTIFACTS_PANEL_DEFAULT_WIDTH_PX
  } catch {
    return ARTIFACTS_PANEL_DEFAULT_WIDTH_PX
  }
}

export function readStoredBrowserPanelWidth(): number {
  try {
    const stored = globalThis.localStorage?.getItem(BROWSER_PANEL_WIDTH_STORAGE_KEY)
    if (!stored) {
      return BROWSER_PANEL_DEFAULT_WIDTH_PX
    }
    const width = Number.parseInt(stored, 10)
    return Number.isFinite(width) ? clampArtifactsPanelWidth(width) : BROWSER_PANEL_DEFAULT_WIDTH_PX
  } catch {
    return BROWSER_PANEL_DEFAULT_WIDTH_PX
  }
}

export function chatMessageText(message: ChatMessage): string {
  const text = message.parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text ?? "")
    .join("")
  return message.role === "user" ? visibleUserText(text) : text
}

export function sessionScopeFromWorkspace(workspace: WorkspaceSelection): SessionScope | null {
  if (workspace.kind === "local") {
    return DEFAULT_LOCAL_WORKSPACE
  }
  const teamId = workspace.teamId.trim()
  const teamName = workspace.team?.name.trim()
  if (!teamId || !teamName) {
    return null
  }
  return { kind: "team", teamId, teamName }
}

export function workspaceSelectionSwitchKey(workspace: WorkspaceSelection): string {
  if (workspace.kind === "local") return resolvedSessionScopeKey(DEFAULT_LOCAL_WORKSPACE)
  return workspace.teamId ? `team:${workspace.teamId}` : "workspace-loading"
}

export function sessionScopeKey(scope: SessionScope | null): string {
  if (!scope) {
    return "workspace-loading"
  }
  return resolvedSessionScopeKey(scope)
}

export function sessionRecordScopeKey(scope: SessionScope | undefined): string {
  if (!scope) {
    return "workspace-loading"
  }
  return resolvedSessionScopeKey(scope)
}

export interface WorkspaceActivationInput {
  cloudWorkspaceRequired: boolean
  currentScopeKey: string
  loadedSessionScopeKey: string | null
  targetScopeKey: string | null
  workspaceMetadataError: UserFacingError | null
}

export type WorkspaceSwitchPendingInput = WorkspaceActivationInput

export type WorkspaceActivationPhase = "session_scope" | "sessions"

export type WorkspaceActivationFailureReason = "workspace_metadata"

export type WorkspaceActivationState =
  | { status: "idle"; targetScopeKey: string | null }
  | { phase: WorkspaceActivationPhase; status: "activating"; targetScopeKey: string }
  | {
      error: UserFacingError
      reason: WorkspaceActivationFailureReason
      status: "failed"
      targetScopeKey: string | null
    }

export function resolveWorkspaceActivationState(input: WorkspaceActivationInput): WorkspaceActivationState {
  if (!input.cloudWorkspaceRequired) {
    if (!input.targetScopeKey) return { status: "idle", targetScopeKey: null }
    if (input.currentScopeKey !== input.targetScopeKey) {
      return { phase: "session_scope", status: "activating", targetScopeKey: input.targetScopeKey }
    }
    if (input.loadedSessionScopeKey !== input.targetScopeKey) {
      return { phase: "sessions", status: "activating", targetScopeKey: input.targetScopeKey }
    }
    return { status: "idle", targetScopeKey: input.targetScopeKey }
  }
  if (input.workspaceMetadataError) {
    return {
      error: input.workspaceMetadataError,
      reason: "workspace_metadata",
      status: "failed",
      targetScopeKey: input.targetScopeKey,
    }
  }
  if (!input.targetScopeKey) {
    return { status: "idle", targetScopeKey: null }
  }
  if (input.currentScopeKey !== input.targetScopeKey) {
    return { phase: "session_scope", status: "activating", targetScopeKey: input.targetScopeKey }
  }
  if (input.loadedSessionScopeKey !== input.targetScopeKey) {
    return { phase: "sessions", status: "activating", targetScopeKey: input.targetScopeKey }
  }
  return { status: "idle", targetScopeKey: input.targetScopeKey }
}

export function workspaceActivationIsPending(state: WorkspaceActivationState): boolean {
  return state.status === "activating"
}

export function workspaceActivationBlocksInput(state: WorkspaceActivationState): boolean {
  return state.status !== "idle"
}

export function workspaceActivationHasFailed(state: WorkspaceActivationState): boolean {
  return state.status === "failed"
}

export function isWorkspaceSwitchPending(input: WorkspaceSwitchPendingInput): boolean {
  return workspaceActivationIsPending(resolveWorkspaceActivationState(input))
}

export interface WorkspaceSwitchTargetReachableInput {
  activeWorkspaceKey: string
  hasLoadedTeams: boolean
  loadingTeams: boolean
  teamIds: readonly string[]
  targetScopeKey: string | null
}

export interface WorkspaceSwitchClearInput extends WorkspaceSwitchTargetReachableInput {
  workspaceSwitching: boolean
}

export function workspaceSwitchTeamId(scopeKey: string): string | null {
  const prefix = scopeKey.startsWith("team:") ? "team:" : scopeKey.startsWith("organization:") ? "organization:" : null
  if (!prefix) {
    return null
  }
  const teamId = scopeKey.slice(prefix.length)
  return teamId ? teamId : null
}

export function isWorkspaceSwitchTargetReachable(input: WorkspaceSwitchTargetReachableInput): boolean {
  if (!input.targetScopeKey || input.targetScopeKey === "workspace-loading") {
    return true
  }
  if (input.activeWorkspaceKey === input.targetScopeKey) {
    return true
  }
  if (input.loadingTeams || !input.hasLoadedTeams) {
    return true
  }
  const teamId = workspaceSwitchTeamId(input.targetScopeKey)
  return teamId ? input.teamIds.includes(teamId) : false
}

export function shouldClearWorkspaceSwitchTarget(input: WorkspaceSwitchClearInput): boolean {
  if (!input.targetScopeKey) {
    return false
  }
  if (!isWorkspaceSwitchTargetReachable(input)) {
    return true
  }
  if (!input.workspaceSwitching) {
    return true
  }
  return false
}

export function projectContextFromProject(
  project: SessionProject | undefined,
  gitState?: GitRepositoryState | null,
): ChatProjectContext | undefined {
  if (!project) {
    return undefined
  }
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    ...(gitState?.available && gitState.repositoryRoot
      ? {
          git: {
            repositoryRoot: gitState.repositoryRoot,
            ...(gitState.currentBranch ? { currentBranch: gitState.currentBranch } : {}),
            ...(gitState.detachedHead ? { detachedHead: gitState.detachedHead } : {}),
            dirty: gitState.dirty,
          },
        }
      : {}),
  }
}

export function activeProjectIdForComposer({
  activeSession,
  draftProjectId,
}: {
  activeSession?: SessionInfo
  draftProjectId: string | null
}): string | undefined {
  if (activeSession?.projectId) {
    return activeSession.projectId
  }
  if (draftProjectId === NO_DRAFT_PROJECT_ID) {
    return undefined
  }
  if (draftProjectId) {
    return draftProjectId
  }
  return undefined
}

export interface NewSessionTarget {
  projectId?: string
}

function validProjectId(projectId: string | null | undefined): string | undefined {
  const normalized = projectId?.trim()
  return normalized && normalized !== NO_DRAFT_PROJECT_ID ? normalized : undefined
}

export function resolveNewSessionTarget({
  activeSession,
  draftProjectId,
  explicitProjectId,
  lastProjectId,
  preferLastProject = false,
}: {
  activeSession?: Pick<SessionInfo, "projectId"> | null
  draftProjectId: string | null
  explicitProjectId?: string | null
  lastProjectId?: string | null
  preferLastProject?: boolean
}): NewSessionTarget {
  const explicitProject = validProjectId(explicitProjectId)
  if (explicitProject) {
    return { projectId: explicitProject }
  }
  const projectId =
    validProjectId(activeSession?.projectId) ??
    validProjectId(draftProjectId) ??
    (preferLastProject ? validProjectId(lastProjectId) : undefined)
  return projectId ? { projectId } : {}
}

export function newSessionComposerDraftKey(scope: SessionScope | null, projectId: string | undefined): string {
  return newSessionComposerDraftKeyForScopeKey(sessionScopeKey(scope), projectId)
}

export function newSessionComposerDraftKeyForScopeKey(scopeKey: string, projectId: string | undefined): string {
  return `${NEW_SESSION_COMPOSER_DRAFT_KEY}:${scopeKey}:${projectId ?? "none"}`
}

export function existingSessionComposerDraftKey(scopeKey: string, sessionId: string): string {
  return `session:${scopeKey}:${sessionId}`
}
