import type { ConnectionClientService } from "@oomol/connection"
import type { AttentionService } from "../../../electron/attention/common.ts"
import type { SessionInfo } from "../../../electron/session/common.ts"
import type { Persona } from "../../../electron/settings/common.ts"
import type { AppShellRoute as Route } from "./app-shell-types.ts"

import * as React from "react"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"

interface UseAppShellAttentionInput {
  attentionService: ConnectionClientService<AttentionService>
  route: Route
  activeChatSessionId: string | null
  sessionsSettledForCurrentScope: boolean
  visibleSessions: SessionInfo[]
  refreshSessions: () => Promise<void>
  setRoute: (route: Route) => void
  /** 来自 useAppShellSessionSelection 的统一选中动作 */
  selectSession: (session: SessionInfo) => void
  /** 当前人群模式与切换器：通知目标会话属于另一模式时自动切换后打开 */
  persona: Persona
  setPersona: (persona: Persona) => Promise<void>
}

/**
 * 通知路由域：attention 可见会话同步、openSessionRequested 订阅与
 * 通知会话解析，从 AppShell 搬移而来。零行为变化。
 */
export function useAppShellAttention({
  attentionService,
  route,
  activeChatSessionId,
  sessionsSettledForCurrentScope,
  visibleSessions,
  refreshSessions,
  setRoute,
  selectSession,
  persona,
  setPersona,
}: UseAppShellAttentionInput): {
  markSessionViewed: (sessionId: string) => Promise<void>
} {
  const [pendingAttentionSession, setPendingAttentionSession] = React.useState<{
    teamRefreshAttempted: boolean
    teamId?: string
    sessionRefreshAttempted: boolean
    sessionId: string
    persona?: Persona
  } | null>(null)
  const pendingAttentionRefreshesRef = React.useRef(new Set<string>())

  React.useEffect(() => {
    const syncVisibleSession = (): void => {
      const visible = document.visibilityState === "visible" && document.hasFocus() && route === "chat"
      void attentionService
        .invoke("setVisibleSession", {
          ...(activeChatSessionId ? { sessionId: activeChatSessionId } : {}),
          visible,
        })
        .catch((error: unknown) => {
          reportRendererHandledError("attention", "sync visible session failed", error)
        })
    }
    syncVisibleSession()
    document.addEventListener("visibilitychange", syncVisibleSession)
    window.addEventListener("focus", syncVisibleSession)
    window.addEventListener("blur", syncVisibleSession)
    return () => {
      document.removeEventListener("visibilitychange", syncVisibleSession)
      window.removeEventListener("focus", syncVisibleSession)
      window.removeEventListener("blur", syncVisibleSession)
    }
  }, [activeChatSessionId, attentionService, route])

  React.useEffect(
    () =>
      attentionService.serverEvents.on("openSessionRequested", ({ teamId, sessionId, persona: sessionPersona }) => {
        setPendingAttentionSession({
          teamRefreshAttempted: false,
          sessionRefreshAttempted: false,
          sessionId,
          ...(sessionPersona ? { persona: sessionPersona } : {}),
          ...(teamId ? { teamId } : {}),
        })
        setRoute("chat")
      }),
    [attentionService],
  )

  React.useEffect(() => {
    if (
      !pendingAttentionSession ||
      !sessionsSettledForCurrentScope
    ) {
      return
    }
    const session = visibleSessions.find((candidate) => candidate.id === pendingAttentionSession.sessionId)
    if (!session) {
      // 目标会话属于另一个模式（被当前模式过滤）：先切到对应模式，列表重载后自动重试。
      if (pendingAttentionSession.persona && pendingAttentionSession.persona !== persona) {
        void setPersona(pendingAttentionSession.persona).catch((error: unknown) => {
          reportRendererHandledError("attention", "switch persona for notification session failed", error)
        })
        return
      }
      if (!pendingAttentionSession.sessionRefreshAttempted) {
        if (pendingAttentionRefreshesRef.current.has(pendingAttentionSession.sessionId)) {
          return
        }
        pendingAttentionRefreshesRef.current.add(pendingAttentionSession.sessionId)
        void refreshSessions()
          .catch((error: unknown) => {
            reportRendererHandledError("attention", "refresh notification session failed", error)
          })
          .finally(() => {
            pendingAttentionRefreshesRef.current.delete(pendingAttentionSession.sessionId)
            setPendingAttentionSession((current) =>
              current?.sessionId === pendingAttentionSession.sessionId
                ? { ...current, sessionRefreshAttempted: true }
                : current,
            )
          })
        return
      }
      setPendingAttentionSession(null)
      void attentionService.invoke("markSessionViewed", pendingAttentionSession.sessionId).catch((error: unknown) => {
        reportRendererHandledError("attention", "clear unavailable notification session failed", error)
      })
      return
    }
    selectSession(session)
    setPendingAttentionSession(null)
    void attentionService.invoke("markSessionViewed", session.id).catch((error: unknown) => {
      reportRendererHandledError("attention", "mark routed notification session viewed failed", error)
    })
  }, [
    attentionService,
    pendingAttentionSession,
    persona,
    refreshSessions,
    sessionsSettledForCurrentScope,
    setPersona,
    visibleSessions,
  ])

  const markSessionViewed = React.useCallback(
    (sessionId: string): Promise<void> =>
      attentionService.invoke("markSessionViewed", sessionId).catch((error: unknown) => {
        reportRendererHandledError("attention", "mark selected session viewed failed", error)
      }),
    [attentionService],
  )

  return {
    markSessionViewed,
  }
}
