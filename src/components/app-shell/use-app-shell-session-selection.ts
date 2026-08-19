import type { AgentPermissionMode } from "../../../electron/chat/common.ts"
import type { SessionInfo, SessionScope } from "../../../electron/session/common.ts"
import type { PendingChatTransition } from "./pending-chat.ts"
import type { SidebarSegment } from "./sidebar-persistence.ts"

import * as React from "react"

interface UseAppShellSessionSelectionOptions {
  /** 当前作用域下可见的会话列表（scope 过滤后）。 */
  visibleSessions: SessionInfo[]
  currentScopeKey: string
  sessionRecordScopeKey: (scope: SessionScope | undefined) => string
}

/**
 * 会话选择域：草稿/选中会话状态、派生值与会话激活动作。
 *
 * 纯状态与派生，不含任何 effect（默认选择修复与工作区重置等顺序敏感
 * effect 留在组合层，见 AppShell）。setter 直接透传原生 dispatch，保持
 * identity 稳定，供 useComposerNavigation 等下游 hook 消费。
 */
export function useAppShellSessionSelection({
  visibleSessions,
  currentScopeKey,
  sessionRecordScopeKey,
}: UseAppShellSessionSelectionOptions): {
  activeChatSessionId: string | null
  activeKnowledgeBaseIds: string[]
  activeSession: SessionInfo | undefined
  draftKnowledgeBaseIds: string[]
  draftPermissionMode: AgentPermissionMode
  draftProjectId: string | null
  isDraftSession: boolean
  pendingChatTransition: PendingChatTransition | null
  selectedSession: SessionInfo | null
  selectedSessionId: string | null
  sidebarSegment: SidebarSegment
  setDraftKnowledgeBaseIds: React.Dispatch<React.SetStateAction<string[]>>
  setDraftPermissionMode: React.Dispatch<React.SetStateAction<AgentPermissionMode>>
  setDraftProjectId: React.Dispatch<React.SetStateAction<string | null>>
  setIsDraftSession: React.Dispatch<React.SetStateAction<boolean>>
  setPendingChatTransition: React.Dispatch<React.SetStateAction<PendingChatTransition | null>>
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>
  setSidebarSegment: React.Dispatch<React.SetStateAction<SidebarSegment>>
  /** 统一"选中会话"四连写（通知路由 / 侧边栏选择共用）。 */
  selectSession: (session: SessionInfo) => void
} {
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(null)
  // 启动默认进入「新建对话」草稿界面，不自动恢复上次/最近的会话——
  // 用户明确"重启打开全新界面"。选中具体会话后进入会话视图。
  const [isDraftSession, setIsDraftSession] = React.useState(true)
  const [draftPermissionMode, setDraftPermissionMode] = React.useState<AgentPermissionMode>("default")
  const [draftKnowledgeBaseIds, setDraftKnowledgeBaseIds] = React.useState<string[]>([])
  const [draftProjectId, setDraftProjectId] = React.useState<string | null>(null)
  // 任务/项目视图是独立偏好：每次启动默认 Work（任务视图），不恢复上次选择——
  // 用户明确"重启打开默认 Work 界面"。会话内切换只影响本次会话。
  const [sidebarSegment, setSidebarSegment] = React.useState<SidebarSegment>("tasks")
  const [pendingChatTransition, setPendingChatTransition] = React.useState<PendingChatTransition | null>(null)

  const selectedSession = selectedSessionId
    ? (visibleSessions.find((session) => session.id === selectedSessionId) ?? null)
    : null
  const selectedSessionMatchesScope =
    selectedSession !== null && sessionRecordScopeKey(selectedSession.scope) === currentScopeKey
  const activeChatSessionId = selectedSessionMatchesScope ? selectedSessionId : null
  const activeSession = selectedSessionMatchesScope ? (selectedSession ?? undefined) : undefined
  const activeKnowledgeBaseIds = activeSession?.knowledgeBaseIds ?? draftKnowledgeBaseIds

  const selectSession = React.useCallback((session: SessionInfo): void => {
    setSelectedSessionId(session.id)
    setIsDraftSession(false)
    setPendingChatTransition(null)
  }, [])

  return {
    activeChatSessionId,
    activeKnowledgeBaseIds,
    activeSession,
    draftKnowledgeBaseIds,
    draftPermissionMode,
    draftProjectId,
    isDraftSession,
    pendingChatTransition,
    selectedSession,
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
  }
}
