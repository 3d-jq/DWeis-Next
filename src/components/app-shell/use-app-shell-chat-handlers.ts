import type {
  AgentMode,
  AgentPermissionMode,
  ChatAttachment,
  ChatContextMention,
  ChatPermissionReply,
  ChatProjectContext,
  ReasoningLevel,
} from "../../../electron/chat/common.ts"
import type { ChatErrorKind } from "../../../electron/chat/error.ts"
import type { ModelChoice } from "../../../electron/models/common.ts"
import type { SessionInfo, SessionProject, SessionScope } from "../../../electron/session/common.ts"
import type { ChatSendRequest, ChatSendResult, TurnRetryOptions } from "./app-shell-model.ts"
import type { AppShellRoute } from "./app-shell-types.ts"
import type { PendingChatTransition } from "./pending-chat.ts"
import type { UseSessionTitleGenerationResult } from "./use-session-title-generation.ts"
import type { UseChat } from "@/hooks/useChat"
import type { ChatTurnState } from "@/routes/Chat/chat-turn-state"
import type { ChatTurnRetrySource } from "@/routes/Chat/chat-turns"
import type { ChatStatus } from "ai"

import * as React from "react"
import { buildFallbackSessionTitle } from "../../../electron/session/title.ts"
import { buildSessionTitleInput, chatSendAccepted } from "./app-shell-model.ts"
import { chatTurnInputKey } from "@/routes/Chat/chat-turns"
import { chatTurnAllowsDirectSend, chatTurnAllowsStop } from "@/routes/Chat/chat-turn-state"

interface KnowledgeMention {
  id: string
  kind: "knowledge"
  name: string
  scope: "library" | "archive"
}

interface UseAppShellChatHandlersInput {
  // 会话/作用域
  activeChatSessionId: string | null
  activeProjectContext?: ChatProjectContext
  sessionScope: SessionScope | null
  displayedPermissionMode: AgentPermissionMode
  activeChatTurnState: ChatTurnState
  // 知识库
  activeKnowledgeBaseIds: string[]
  pinnedKnowledgeMentions: KnowledgeMention[]
  // composer/队列
  activeComposerDraftKey: string
  commitComposerDraft: (draftKey: string) => void
  queueActiveMessage: (
    text: string,
    attachments: ChatAttachment[],
    contextMentions: ChatContextMention[] | undefined,
    model?: ModelChoice,
    reasoningLevel?: ReasoningLevel,
    mode?: AgentMode,
    permissionMode?: AgentPermissionMode,
    projectContext?: ChatProjectContext,
    sessionScope?: SessionScope,
  ) => boolean
  releaseActiveQueue: () => void
  sendNow: (request: ChatSendRequest) => Promise<ChatSendResult>
  isDraftSendInFlight: (draftKey: string) => boolean
  // useChat 动作
  answerPermission: (sessionId: string, requestId: string, reply: ChatPermissionReply) => Promise<void>
  answerQuestion: (sessionId: string, requestId: string, answers: string[][]) => Promise<void>
  rejectQuestion: (sessionId: string, requestId: string) => Promise<void>
  send: UseChat["send"]
  stop: (sessionId: string) => Promise<void>
  // memory maps（useComposerSubmission 返回的六张 ref map）
  turnRetryOptionsBySession: React.RefObject<Map<string, Map<string, TurnRetryOptions>>>
  lastContextMentionsBySession: React.RefObject<Map<string, ChatContextMention[]>>
  lastModelBySession: React.RefObject<Map<string, ModelChoice | undefined>>
  lastReasoningLevelBySession: React.RefObject<Map<string, ReasoningLevel | undefined>>
  lastModeBySession: React.RefObject<Map<string, AgentMode | undefined>>
  lastPermissionModeBySession: React.RefObject<Map<string, AgentPermissionMode | undefined>>
  // 会话创建/持久化
  create: (title?: string, projectId?: string) => Promise<SessionInfo>
  titleGeneration: Pick<UseSessionTitleGenerationResult, "rememberAutoFallbackTitle">
  persistPermissionMode: (sessionId: string, mode: AgentPermissionMode) => Promise<void>
  persistKnowledgeBaseIds: (sessionId: string, ids: string[]) => void
  // 导航/选择
  setSelectedSessionId: React.Dispatch<React.SetStateAction<string | null>>
  setIsDraftSession: React.Dispatch<React.SetStateAction<boolean>>
  setPendingChatTransition: React.Dispatch<React.SetStateAction<PendingChatTransition | null>>
  setRoute: React.Dispatch<React.SetStateAction<AppShellRoute>>
  displayedStatus: ChatStatus
  activeProject?: SessionProject | null
  ready: boolean
}

/**
 * 聊天发送/重试/提问流编排域：纯 handler 编排（输入输出通过参数传递），
 * 连同 dev/smoke 自动发送 effect 一起从 AppShell 搬移而来。零行为变化。
 */
export function useAppShellChatHandlers({
  activeChatSessionId,
  activeProjectContext,
  sessionScope,
  displayedPermissionMode,
  activeChatTurnState,
  activeKnowledgeBaseIds,
  pinnedKnowledgeMentions,
  activeComposerDraftKey,
  commitComposerDraft,
  queueActiveMessage,
  releaseActiveQueue,
  sendNow,
  isDraftSendInFlight,
  answerPermission,
  answerQuestion,
  rejectQuestion,
  send,
  stop,
  turnRetryOptionsBySession,
  lastContextMentionsBySession,
  lastModelBySession,
  lastReasoningLevelBySession,
  lastModeBySession,
  lastPermissionModeBySession,
  create,
  titleGeneration,
  persistPermissionMode,
  persistKnowledgeBaseIds,
  setSelectedSessionId,
  setIsDraftSession,
  setPendingChatTransition,
  setRoute,
  activeProject,
  ready,
}: UseAppShellChatHandlersInput): {
  handleAnswerPermission: (requestId: string, reply: ChatPermissionReply) => Promise<void>
  handleAnswerQuestion: (requestId: string, answers: string[][]) => Promise<void>
  handleChatErrorRecovery: (kind: ChatErrorKind, source: ChatTurnRetrySource) => Promise<void>
  handleChatStop: () => Promise<void>
  handleRejectQuestion: (requestId: string) => Promise<void>
  handleRetryFresh: (source: ChatTurnRetrySource) => Promise<void>
  handleSend: (request: ChatSendRequest) => Promise<ChatSendResult>
  handleStopGenerationCommand: () => void
} {
  // dev/smoke：VITE_DWEIS_SMOKE 设置时，就绪后自动发送一条消息用于可视化验证（生产无此 env，无害）。
  const smokeSent = React.useRef(false)
  React.useEffect(() => {
    const smoke = (import.meta.env as Record<string, string | undefined>)["VITE_DWEIS_SMOKE"]
    if (ready && smoke && !smokeSent.current) {
      smokeSent.current = true
      void handleSend({ text: smoke })
    }
  }, [ready])

  const handleSend = React.useCallback(
    async (request: ChatSendRequest): Promise<ChatSendResult> => {
      const {
        afterOptimisticSubmit,
        attachments = [],
        contextMentions = [],
        mode,
        model,
        permissionMode,
        reasoningLevel,
        text,
      } = request
      const effectiveContextMentions = [
        ...contextMentions.filter((mention) => mention.kind !== "knowledge"),
        ...pinnedKnowledgeMentions,
      ]
      const draftKey = activeComposerDraftKey
      const clearSubmittedDraft = (): void => {
        commitComposerDraft(draftKey)
        afterOptimisticSubmit?.()
      }
      if (activeChatSessionId && (!chatTurnAllowsDirectSend(activeChatTurnState) || isDraftSendInFlight(draftKey))) {
        queueActiveMessage(
          text,
          attachments,
          effectiveContextMentions,
          model,
          reasoningLevel,
          mode,
          permissionMode,
          activeProjectContext,
          sessionScope ?? undefined,
        )
        clearSubmittedDraft()
        return { delivery: "queued", status: "accepted" }
      }
      const result = await sendNow({
        afterOptimisticSubmit: clearSubmittedDraft,
        attachments,
        contextMentions: effectiveContextMentions,
        mode,
        model,
        permissionMode,
        reasoningLevel,
        text,
      })
      if (chatSendAccepted(result)) {
        releaseActiveQueue()
        commitComposerDraft(draftKey)
      }
      return result
    },
    [
      activeComposerDraftKey,
      activeChatSessionId,
      activeChatTurnState,
      activeProjectContext,
      commitComposerDraft,
      isDraftSendInFlight,
      pinnedKnowledgeMentions,
      queueActiveMessage,
      releaseActiveQueue,
      sendNow,
      sessionScope,
    ],
  )

  const handleAnswerQuestion = React.useCallback(
    (requestId: string, answers: string[][]): Promise<void> =>
      activeChatSessionId ? answerQuestion(activeChatSessionId, requestId, answers) : Promise.resolve(),
    [activeChatSessionId, answerQuestion],
  )

  const handleAnswerPermission = React.useCallback(
    (requestId: string, reply: ChatPermissionReply): Promise<void> =>
      activeChatSessionId ? answerPermission(activeChatSessionId, requestId, reply) : Promise.resolve(),
    [activeChatSessionId, answerPermission],
  )

  const handleRejectQuestion = React.useCallback(
    (requestId: string): Promise<void> =>
      activeChatSessionId ? rejectQuestion(activeChatSessionId, requestId) : Promise.resolve(),
    [activeChatSessionId, rejectQuestion],
  )

  const handleRetryFresh = React.useCallback(
    async (source: ChatTurnRetrySource): Promise<void> => {
      if (!activeChatSessionId || !sessionScope) {
        throw new Error("A current task and workspace are required for a clean-context retry")
      }
      const retryKey = chatTurnInputKey(source)
      const storedOptions = turnRetryOptionsBySession.current.get(activeChatSessionId)?.get(retryKey)
      const retryScope = storedOptions?.sessionScope ?? sessionScope
      const projectContext = storedOptions?.projectContext ?? activeProjectContext
      const model = storedOptions?.model ?? lastModelBySession.current.get(activeChatSessionId)
      const reasoningLevel =
        storedOptions?.reasoningLevel ?? lastReasoningLevelBySession.current.get(activeChatSessionId)
      const mode = storedOptions?.mode ?? lastModeBySession.current.get(activeChatSessionId)
      const permissionMode =
        storedOptions?.permissionMode ??
        lastPermissionModeBySession.current.get(activeChatSessionId) ??
        displayedPermissionMode
      const contextMentions =
        storedOptions?.contextMentions ?? lastContextMentionsBySession.current.get(activeChatSessionId) ?? []
      const titleInput = { ...buildSessionTitleInput([], source.text, source.attachments), model }
      const fallbackTitle = buildFallbackSessionTitle(titleInput)
      const session = await create(fallbackTitle, projectContext?.id ?? activeProject?.id)

      titleGeneration.rememberAutoFallbackTitle(session.id, fallbackTitle)
      await persistPermissionMode(session.id, permissionMode)
      persistKnowledgeBaseIds(session.id, activeKnowledgeBaseIds)
      setSelectedSessionId(session.id)
      setIsDraftSession(false)
      setPendingChatTransition(null)
      setRoute("chat")
      await send(session.id, source.text, source.attachments, {
        contextMentions,
        mode,
        model,
        permissionMode,
        projectContext,
        reasoningLevel,
        sessionScope: retryScope,
      })
    },
    [
      activeChatSessionId,
      activeKnowledgeBaseIds,
      activeProject?.id,
      activeProjectContext,
      create,
      displayedPermissionMode,
      lastContextMentionsBySession,
      lastModelBySession,
      lastModeBySession,
      lastPermissionModeBySession,
      lastReasoningLevelBySession,
      persistKnowledgeBaseIds,
      persistPermissionMode,
      send,
      sessionScope,
      setPendingChatTransition,
      setRoute,
      setSelectedSessionId,
      setIsDraftSession,
      titleGeneration,
      turnRetryOptionsBySession,
    ],
  )
  const handleChatErrorRecovery = React.useCallback(
    async (kind: ChatErrorKind, source: ChatTurnRetrySource): Promise<void> => {
      if (kind === "auth_required" || kind === "permission_denied") {
        // DWeis Next runs in local self-managed mode only: there is no cloud
        // login to fall back to, so authentication errors cannot be recovered
        // by signing in. Drop the user back into the normal retry flow below.
        return
      }
      if (!activeChatSessionId || !sessionScope) {
        throw new Error("A current task and workspace are required to retry")
      }
      const retryKey = chatTurnInputKey(source)
      const storedOptions = turnRetryOptionsBySession.current.get(activeChatSessionId)?.get(retryKey)
      await send(activeChatSessionId, source.text, source.attachments, {
        contextMentions:
          storedOptions?.contextMentions ?? lastContextMentionsBySession.current.get(activeChatSessionId) ?? [],
        mode: storedOptions?.mode ?? lastModeBySession.current.get(activeChatSessionId),
        model: storedOptions?.model ?? lastModelBySession.current.get(activeChatSessionId),
        permissionMode:
          storedOptions?.permissionMode ??
          lastPermissionModeBySession.current.get(activeChatSessionId) ??
          displayedPermissionMode,
        projectContext: storedOptions?.projectContext ?? activeProjectContext,
        reasoningLevel: storedOptions?.reasoningLevel ?? lastReasoningLevelBySession.current.get(activeChatSessionId),
        sessionScope: storedOptions?.sessionScope ?? sessionScope,
      })
    },
    [
      activeChatSessionId,
      activeProjectContext,
      displayedPermissionMode,
      lastContextMentionsBySession,
      lastModelBySession,
      lastPermissionModeBySession,
      lastReasoningLevelBySession,
      send,
      sessionScope,
      turnRetryOptionsBySession,
    ],
  )
  const handleChatStop = React.useCallback(async (): Promise<void> => {
    if (activeChatSessionId) {
      await stop(activeChatSessionId)
    }
  }, [activeChatSessionId, stop])
  const handleStopGenerationCommand = React.useCallback((): void => {
    if (chatTurnAllowsStop(activeChatTurnState)) {
      void handleChatStop().catch(() => undefined)
    }
  }, [activeChatTurnState, handleChatStop])

  return {
    handleAnswerPermission,
    handleAnswerQuestion,
    handleChatErrorRecovery,
    handleChatStop,
    handleRejectQuestion,
    handleRetryFresh,
    handleSend,
    handleStopGenerationCommand,
  }
}
