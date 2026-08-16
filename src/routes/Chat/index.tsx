import type {
  AssistantActivityEvent,
  AgentPermissionMode,
  ChatMessage,
  ChatPermissionReply,
  ChatPermissionRequest,
  ChatQuestionRequest,
} from "../../../electron/chat/common.ts"
import type { ChatErrorKind } from "../../../electron/chat/error.ts"
import type { KnowledgeBaseSummary } from "../../../electron/knowledge/common.ts"
import type { ChatTurnRetrySource } from "./chat-turns.ts"
import type { ComposerState } from "./composer-state.ts"
import type { QuestionDraftStore } from "./question-fields.ts"
import type { ChatSendRequest, ChatSendResult } from "@/components/app-shell/app-shell-model"
import type { QueuedChatMessage, QueuedMessageMovePlacement } from "@/components/app-shell/chat-queue"
import type { UserFacingError } from "@/lib/user-facing-error"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"
import type { ChatStatus } from "ai"

import * as React from "react"
import { chatTurnShowsGenerating, resolveChatTurnState } from "./chat-turn-state.ts"
import { ChatComposer } from "./ChatComposer.tsx"
import { ChatTimeline } from "./ChatTimeline.tsx"
import { FullAccessConfirmDialog } from "./FullAccessConfirmDialog.tsx"
import { PermissionRequiredCard } from "./PermissionRequiredCard.tsx"
import { QuestionPromptCard } from "./QuestionPromptCard.tsx"
import { ErrorNotice } from "@/components/ErrorNotice"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

interface ChatAreaProps {
  activeSessionId: string | null
  composerDraftKey: string
  composerFocusRequest: number
  messages: ChatMessage[]
  knowledgeBaseIds: string[]
  knowledgeEnabled: boolean
  knowledgeError: string | null
  knowledgeItems: KnowledgeBaseSummary[]
  knowledgeLoading: boolean
  modelRequired?: boolean
  permissionMode: AgentPermissionMode
  pendingPermissions: ChatPermissionRequest[]
  pendingQuestions: ChatQuestionRequest[]
  status: ChatStatus
  activity: AssistantActivityEvent | null
  showEmptyState: boolean
  bootstrapping: boolean
  startupError?: UserFacingError | null
  onStartupRetry?: () => void
  error: string | null
  emptyTitle?: string
  generatedArtifacts?: ArtifactSelection | null
  historyScope: string
  submitDisabled: boolean
  willQueueMessage: boolean
  initialComposerState?: ComposerState
  initialSendPending: boolean
  queueHeld: boolean
  queuedMessages: QueuedChatMessage[]
  placeholder: string
  contextBar?: React.ReactNode
  pinnedContextBar?: React.ReactNode
  onSend: (request: ChatSendRequest) => Promise<ChatSendResult>
  onPermissionModeChange: (mode: AgentPermissionMode) => void
  onAnswerQuestion: (requestId: string, answers: string[][]) => Promise<void>
  onAnswerPermission: (requestId: string, reply: ChatPermissionReply) => Promise<void>
  onRejectQuestion: (requestId: string) => Promise<void>
  questionDrafts: QuestionDraftStore
  onStop: () => Promise<void> | void
  onComposerStateChange?: (state: ComposerState) => void
  onQueuedMessageMove: (messageId: string, targetId: string, placement: QueuedMessageMovePlacement) => void
  onQueuedMessageRemove: (id: string) => void
  onQueuedMessageResume: () => void
  onRecover: (kind: ChatErrorKind, source: ChatTurnRetrySource) => Promise<void>
  onRetryFresh: (source: ChatTurnRetrySource) => Promise<void>
  onArtifactsOpen: (selection: ArtifactSelection) => void
  onArtifactsAvailable: (selection: ArtifactSelection) => void
  onTurnOutputOpen: (selection: TurnOutputSelection) => void
  onTurnOutputAvailable: (selection: TurnOutputSelection) => void
  onOpenKnowledgeLibrary?: () => void
  onCompact?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onRunShellCommand?: (command: string) => void
  onSelectKnowledgeBase: (id: string) => void
}

const CHAT_CONTENT_MAX_WIDTH_CLASS = "min-w-0 max-w-[50rem]"
const EMPTY_COMPOSER_MAX_WIDTH_CLASS = "min-w-0 max-w-[47.5rem]"

export const ChatArea = React.memo(function ChatArea({
  activeSessionId,
  composerDraftKey,
  composerFocusRequest,
  messages,
  knowledgeBaseIds,
  knowledgeEnabled,
  knowledgeError,
  knowledgeItems,
  knowledgeLoading,
  modelRequired = false,
  permissionMode,
  pendingPermissions,
  pendingQuestions,
  status,
  activity,
  showEmptyState,
  bootstrapping,
  startupError,
  onStartupRetry,
  error,
  emptyTitle,
  generatedArtifacts,
  historyScope,
  submitDisabled,
  willQueueMessage,
  initialComposerState,
  initialSendPending,
  queueHeld,
  queuedMessages,
  placeholder,
  contextBar,
  pinnedContextBar,
  onComposerStateChange,
  onSend,
  onPermissionModeChange,
  onAnswerQuestion,
  onAnswerPermission,
  onRejectQuestion,
  questionDrafts,
  onStop,
  onQueuedMessageMove,
  onQueuedMessageRemove,
  onQueuedMessageResume,
  onRecover,
  onRetryFresh,
  onArtifactsOpen,
  onArtifactsAvailable,
  onTurnOutputOpen,
  onTurnOutputAvailable,
  onOpenKnowledgeLibrary,
  onCompact,
  onUndo,
  onRedo,
  onRunShellCommand,
  onSelectKnowledgeBase,
}: ChatAreaProps) {
  const t = useT()
  const [fullAccessDialogOpen, setFullAccessDialogOpen] = React.useState(false)
  const hasMessages = messages.length > 0
  const activeQuestionCount = pendingQuestions.length
  const turnState = resolveChatTurnState({
    initialSendPending,
    pendingPermissionCount: pendingPermissions.length,
    pendingQuestionCount: activeQuestionCount,
    status,
  })
  const isGenerating = chatTurnShowsGenerating(turnState)

  const requestFullAccess = React.useCallback((): void => {
    if (permissionMode === "full_access") {
      return
    }
    setFullAccessDialogOpen(true)
  }, [permissionMode])

  const confirmFullAccess = React.useCallback((): void => {
    onPermissionModeChange("full_access")
    setFullAccessDialogOpen(false)
  }, [onPermissionModeChange])

  const showCenteredEmptyState = showEmptyState && !hasMessages && !isGenerating
  const composer = (
    <ChatComposer
      key={composerDraftKey}
      error={error}
      focusRequest={composerFocusRequest}
      generatedArtifacts={generatedArtifacts}
      hasMessages={hasMessages}
      historyScope={historyScope}
      initialComposerState={initialComposerState}
      messages={messages}
      knowledgeBaseIds={knowledgeBaseIds}
      knowledgeEnabled={knowledgeEnabled}
      knowledgeError={knowledgeError}
      knowledgeItems={knowledgeItems}
      knowledgeLoading={knowledgeLoading}
      modelRequired={modelRequired}
      permissionMode={permissionMode}
      pendingQuestions={pendingQuestions}
      placeholder={placeholder}
      contextBar={showCenteredEmptyState ? contextBar : undefined}
      queueHeld={queueHeld}
      queuedMessages={queuedMessages}
      turnState={turnState}
      submitDisabled={submitDisabled}
      willQueueMessage={willQueueMessage}
      onComposerStateChange={onComposerStateChange}
      onQueuedMessageMove={onQueuedMessageMove}
      onQueuedMessageRemove={onQueuedMessageRemove}
      onQueuedMessageResume={onQueuedMessageResume}
      onSend={onSend}
      onAnswerQuestion={onAnswerQuestion}
      onPermissionModeDefault={() => onPermissionModeChange("default")}
      onPermissionModeFullAccess={requestFullAccess}
      onOpenKnowledgeLibrary={onOpenKnowledgeLibrary}
      onSelectKnowledgeBase={onSelectKnowledgeBase}
      onStop={onStop}
      onCompact={onCompact}
      onUndo={onUndo}
      onRedo={onRedo}
      onRunShellCommand={onRunShellCommand}
    />
  )

  const content = startupError ? (
    <div
      className={cn("mx-auto grid min-h-full w-full place-items-center px-4 pt-7 pb-9", CHAT_CONTENT_MAX_WIDTH_CLASS)}
    >
      <ErrorNotice
        error={startupError}
        action={onStartupRetry ? { label: t("common.retry"), onClick: onStartupRetry } : undefined}
      />
    </div>
  ) : bootstrapping ? (
    <div className={cn("mx-auto min-h-full w-full px-4 pt-7 pb-9", CHAT_CONTENT_MAX_WIDTH_CLASS)} aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-3.5 w-28 rounded-sm motion-safe:animate-none" />
        <Skeleton className="h-3.5 w-72 max-w-[68%] rounded-sm motion-safe:animate-none" />
        <Skeleton className="h-3.5 w-48 max-w-[52%] rounded-sm motion-safe:animate-none" />
      </div>
    </div>
  ) : showCenteredEmptyState ? (
    <div className="grid min-h-full w-full place-items-center px-4 py-6 sm:px-5 lg:px-8">
      <div
        className={cn(
          "flex w-full translate-y-[-2vh] flex-col gap-5 transition-transform duration-300 ease-out",
          EMPTY_COMPOSER_MAX_WIDTH_CLASS,
        )}
      >
        <div className="px-4 pb-1 text-center">
          <h2 className="oo-text-empty-title mx-auto max-w-2xl">{emptyTitle ?? t("chat.emptyTitle")}</h2>
        </div>
        <div className="flex flex-col gap-3">
          {pinnedContextBar}
          {composer}
        </div>
      </div>
    </div>
  ) : (
    <ChatTimeline
      activeSessionId={activeSessionId}
      messages={messages}
      status={status}
      activity={activity}
      isGenerating={isGenerating}
      onRecover={onRecover}
      onRetryFresh={onRetryFresh}
      onArtifactsOpen={onArtifactsOpen}
      onArtifactsAvailable={onArtifactsAvailable}
      onTurnOutputOpen={onTurnOutputOpen}
      onTurnOutputAvailable={onTurnOutputAvailable}
    />
  )

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col pb-4">
        <div className="flex min-h-0 flex-1 overflow-hidden">{content}</div>

        {showCenteredEmptyState ? null : (
          <div className={cn("mx-auto flex w-full flex-col gap-2 px-4", CHAT_CONTENT_MAX_WIDTH_CLASS)}>
            {pendingQuestions.length > 0 || pendingPermissions.length > 0 ? (
              // 提问/权限确认接管输入框位置（composer takeover）：请求处理完输入框恢复
              <div className="flex flex-col gap-2">
                {pendingQuestions.map((request) => (
                  <QuestionPromptCard
                    key={request.id}
                    request={request}
                    busy={status === "submitted"}
                    onAnswer={onAnswerQuestion}
                    onReject={onRejectQuestion}
                    questionDrafts={questionDrafts}
                  />
                ))}
                {pendingPermissions.map((request) => (
                  <PermissionRequiredCard
                    key={request.id}
                    request={request}
                    busy={status === "submitted"}
                    onAllowOnce={(requestId) => onAnswerPermission(requestId, "once")}
                    onAllowForSession={(requestId) => onAnswerPermission(requestId, "always")}
                    onReject={(requestId) => onAnswerPermission(requestId, "reject")}
                    onDiscuss={(requestId) => {
                      // 「讨论」= 放弃本次审批让输入框恢复，用户直接打字表达诉求（对齐 dsh 的 discuss 语义）
                      void onAnswerPermission(requestId, "reject")
                    }}
                  />
                ))}
              </div>
            ) : (
              <>
                {pinnedContextBar}
                {composer}
              </>
            )}
          </div>
        )}
      </div>
      <FullAccessConfirmDialog
        open={fullAccessDialogOpen}
        onClose={() => setFullAccessDialogOpen(false)}
        onConfirm={confirmFullAccess}
      />
    </div>
  )
})
