import type { BatchSessionResult, SessionInfo, SessionScope } from "../../../electron/session/common.ts"
import type { AppShellRoute as Route } from "./app-shell-types.ts"
import type { PendingChatTransition } from "./pending-chat.ts"

import * as React from "react"
import { existingSessionComposerDraftKey, sessionRecordScopeKey } from "./app-shell-model.ts"
import { nextActiveSessionIdAfterArchive } from "./sidebar-sessions.ts"
import { useT } from "@/i18n/i18n"
import { resolveUserFacingError } from "@/lib/user-facing-error"

interface UseAppShellRuntimeCleanupOptions {
  activeChatSessionId: string | null
  archiveMany: (ids: string[]) => Promise<BatchSessionResult>
  archiveProjectAction: (projectId: string) => Promise<void>
  clearComposerDraft: (draftKey: string) => void
  clearQueuedSession: (sessionId: string) => void
  currentScopeKey: string
  forgetChatSession: (sessionId: string) => void
  forgetComposerSubmissionSession: (sessionId: string) => void
  isSessionRunning: (sessionId: string) => boolean
  removeMany: (ids: string[]) => Promise<BatchSessionResult>
  removeSession: (sessionId: string) => Promise<void>
  selectableSidebarSessions: SessionInfo[]
  sessionsSettledForCurrentScope: boolean
  setPendingChatTransition: React.Dispatch<React.SetStateAction<PendingChatTransition | null>>
  setIsDraftSession: React.Dispatch<React.SetStateAction<boolean>>
  setRoute: (route: Route) => void
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>
  visibleSessions: SessionInfo[]
}

/**
 * 会话运行时清理域：删除/归档会话与项目时的内存清理动作。
 *
 * 全部为纯编排回调；依赖项从组合层注入。handleSessionArchived 依赖
 * selectableSidebarSessions（侧边栏分组输出），调用点须位于
 * useAppShellSidebarSessions 之后。
 */
export function useAppShellRuntimeCleanup({
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
}: UseAppShellRuntimeCleanupOptions): {
  archiveProjectWithRuntimeCleanup: (projectId: string) => Promise<void>
  archiveSessionsWithRuntimeCleanup: (ids: string[]) => Promise<BatchSessionResult>
  forgetSessionRuntime: (sessionId: string, draftKey?: string) => void
  handleSessionArchived: (session: SessionInfo) => void
  isRetrySessionAvailable: (sessionId: string, scope: SessionScope) => boolean
  removeSessionWithRuntimeCleanup: (sessionId: string) => Promise<void>
  removeSessionsWithRuntimeCleanup: (ids: string[]) => Promise<BatchSessionResult>
} {
  const t = useT()

  const isRetrySessionAvailable = React.useCallback(
    (sessionId: string, scope: SessionScope): boolean =>
      !sessionsSettledForCurrentScope ||
      visibleSessions.some(
        (session) => session.id === sessionId && sessionRecordScopeKey(session.scope) === sessionRecordScopeKey(scope),
      ),
    [sessionsSettledForCurrentScope, visibleSessions],
  )
  const forgetSessionRuntime = React.useCallback(
    (sessionId: string, draftKey?: string): void => {
      forgetChatSession(sessionId)
      clearQueuedSession(sessionId)
      forgetComposerSubmissionSession(sessionId)
      if (draftKey) {
        clearComposerDraft(draftKey)
      }
      setPendingChatTransition((pending) => (pending?.sessionId === sessionId ? null : pending))
    },
    [clearComposerDraft, clearQueuedSession, forgetChatSession, forgetComposerSubmissionSession],
  )
  const handleSessionArchived = React.useCallback(
    (session: SessionInfo): void => {
      forgetSessionRuntime(
        session.id,
        existingSessionComposerDraftKey(sessionRecordScopeKey(session.scope), session.id),
      )
      if (activeChatSessionId !== session.id) {
        return
      }
      setSelectedSessionId(nextActiveSessionIdAfterArchive(selectableSidebarSessions, session.id))
      setIsDraftSession(false)
      setRoute("chat")
    },
    [activeChatSessionId, forgetSessionRuntime, selectableSidebarSessions],
  )
  const archiveProjectWithRuntimeCleanup = React.useCallback(
    async (projectId: string): Promise<void> => {
      const projectSessions = visibleSessions.filter((session) => session.projectId === projectId)
      if (projectSessions.some((session) => isSessionRunning(session.id))) {
        throw resolveUserFacingError(new Error(t("project.archiveRunning")), {
          area: "session",
          preserveMessage: true,
        })
      }
      await archiveProjectAction(projectId)
      for (const session of projectSessions) {
        forgetSessionRuntime(
          session.id,
          existingSessionComposerDraftKey(sessionRecordScopeKey(session.scope), session.id),
        )
      }
    },
    [archiveProjectAction, forgetSessionRuntime, isSessionRunning, t, visibleSessions],
  )
  const removeSessionWithRuntimeCleanup = React.useCallback(
    async (sessionId: string): Promise<void> => {
      await removeSession(sessionId)
      forgetSessionRuntime(sessionId, existingSessionComposerDraftKey(currentScopeKey, sessionId))
    },
    [currentScopeKey, forgetSessionRuntime, removeSession],
  )
  const archiveSessionsWithRuntimeCleanup = React.useCallback(
    async (ids: string[]) => {
      const result = await archiveMany(ids)
      for (const id of result.succeededIds) {
        forgetSessionRuntime(id, existingSessionComposerDraftKey(currentScopeKey, id))
      }
      return result
    },
    [archiveMany, currentScopeKey, forgetSessionRuntime],
  )
  const removeSessionsWithRuntimeCleanup = React.useCallback(
    async (ids: string[]) => {
      const result = await removeMany(ids)
      for (const id of result.succeededIds) {
        forgetSessionRuntime(id, existingSessionComposerDraftKey(currentScopeKey, id))
      }
      return result
    },
    [currentScopeKey, forgetSessionRuntime, removeMany],
  )

  return {
    archiveProjectWithRuntimeCleanup,
    archiveSessionsWithRuntimeCleanup,
    forgetSessionRuntime,
    handleSessionArchived,
    isRetrySessionAvailable,
    removeSessionWithRuntimeCleanup,
    removeSessionsWithRuntimeCleanup,
  }
}
