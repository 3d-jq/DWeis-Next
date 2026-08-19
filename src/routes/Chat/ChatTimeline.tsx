import type { AssistantActivityEvent, ChatMessage } from "../../../electron/chat/common.ts"
import type { ChatErrorKind } from "../../../electron/chat/error.ts"
import type { ResolvedArtifactGroup } from "./artifact-resolution.ts"
import type { ChatTurnViewProps } from "./chat-turn-view-props.ts"
import type { ChatTurn, ChatTurnRetrySource } from "./chat-turns.ts"
import type { ChatTurnGrouping } from "./chat-turns.ts"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"
import type { ChatStatus } from "ai"
import type { StickToBottomContext } from "use-stick-to-bottom"

import * as React from "react"
import { useArtifactBundles } from "./artifact-bundle-records.ts"
import { lastDisplayableArtifactGroup } from "./artifact-metadata.ts"
import { shouldRenderGeneratedArtifactsShelf } from "./artifact-shelf-visibility.ts"
import {
  assistantMessagesFromTimelineBlocks,
  segmentAssistantTimeline,
  textFromTimelineBlocks,
  timelineHasVisibleOutcome,
} from "./assistant-timeline.ts"
import { TurnProcessActivity } from "./AssistantTurnRenderer.tsx"
import { chatTurnViewPropsEqual } from "./chat-turn-view-props.ts"
import {
  activityForChatTurn,
  isCompactionActivity,
  latestAssistantMessage,
  retrySourceFromTurn,
  shouldAppendTurnProcessActivity,
  shouldShowTurnProcess,
  summarizeTurnProcess,
  updateChatTurnGrouping,
} from "./chat-turns.ts"
import { AssistantMessageActions } from "./ChatMessageActions.tsx"
import { AssistantTimelineMessage, MessageBubble } from "./ChatMessageBubble.tsx"
import { ChatNavRail } from "./ChatNavRail.tsx"
import { LoadingShimmerText } from "./LoadingShimmerText.tsx"
import { assistantResponseActionTextByMessageId } from "./message-text.ts"
import { hasStoppedTool } from "./tool-state.ts"
import {
  turnOutputInitialRole,
  turnOutputRecordsByMessageId,
  turnOutputRecordsByTurnId,
  useTurnOutputRecords,
} from "./turn-output-records.ts"
import { TurnOutputShelf } from "./TurnOutputShelf.tsx"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent } from "@/components/ai-elements/message"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

const GeneratedArtifacts = React.lazy(() =>
  import("@/routes/Chat/GeneratedArtifacts").then((module) => ({ default: module.GeneratedArtifacts })),
)
const CHAT_CONTENT_MAX_WIDTH_CLASS = "min-w-0 max-w-[50rem]"

const EMPTY_ARTIFACT_GROUPS: ResolvedArtifactGroup[] = []

function noopArtifactsAvailable(_selection: ArtifactSelection): void {
  // 只有最新的产物需要自动成为右侧面板的默认选择。
}

function artifactGroupArraysEqual(
  left: readonly ResolvedArtifactGroup[],
  right: readonly ResolvedArtifactGroup[],
): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function reuseStableArtifactGroupMap(
  previous: Map<string, ResolvedArtifactGroup[]>,
  next: Map<string, ResolvedArtifactGroup[]>,
): Map<string, ResolvedArtifactGroup[]> {
  let changed = previous.size !== next.size
  const stable = new Map<string, ResolvedArtifactGroup[]>()
  for (const [key, groups] of next) {
    const previousGroups = previous.get(key)
    const stableGroups = previousGroups && artifactGroupArraysEqual(previousGroups, groups) ? previousGroups : groups
    stable.set(key, stableGroups)
    if (stableGroups !== previousGroups) {
      changed = true
    }
  }
  return changed ? stable : previous
}

/** 上下文压缩的对话流分隔线：左右横线 + 中间状态文案，独立于回合 process 面板。 */
function CompactionDivider({ phase }: { phase: "compacting" | "resuming" | "done" }) {
  const t = useT()
  const label = phase === "compacting" ? t("chat.contextCompacting") : t("chat.contextCompacted")
  return (
    <div
      className="flex items-center gap-3 py-1"
      role="status"
      aria-label={label}
      aria-live={phase === "compacting" ? "polite" : undefined}
    >
      <div className="h-px min-w-4 flex-1 bg-border/70" />
      {phase === "compacting" ? (
        // 注意：不能传 text-* 实色类，否则 tailwind-merge 覆盖 Shimmer 的 text-transparent，
        // bg-clip-text 扫光会被文字底色遮住。
        <LoadingShimmerText className="text-xs font-medium whitespace-nowrap">{label}</LoadingShimmerText>
      ) : (
        <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">{label}</span>
      )}
      <div className="h-px min-w-4 flex-1 bg-border/70" />
    </div>
  )
}

export const ChatTurnView = React.memo(function ChatTurnView({
  activeSessionId,
  artifactGroups,
  artifactGroupsByMessageId,
  turnOutputRecordsByMessage,
  turnOutputRecord,
  turn,
  activity,
  activeAssistantMessageId,
  turnInFlight = false,
  isLatestTurn = false,
  smoothAssistantMessageId,
  onRecover,
  onRetryFresh,
  onArtifactsAvailable,
  onArtifactsOpen,
  onTurnOutputOpen,
}: ChatTurnViewProps) {
  // turnInFlight 是全局状态（当前回合在生成）：只有最新回合才被它算作活跃，
  // 历史回合必须保持"已处理"，不能跟着变成"处理中"。
  const turnIsActive = Boolean(activeAssistantMessageId) || (turnInFlight && isLatestTurn)
  const timelineSegments = segmentAssistantTimeline(turn.assistants, { active: turnIsActive })
  const responseBlocks = timelineSegments
    .filter((segment) => segment.kind === "response")
    .flatMap((segment) => segment.blocks)
  const hasRenderableArtifacts = shouldRenderGeneratedArtifactsShelf(artifactGroups)
  const hasRenderableTurnOutputs = Boolean(
    activeSessionId &&
    turnOutputRecord &&
    turnOutputRecord.files.some((file) => file.role === "process" || file.role === "project_change"),
  )
  const hasVisibleOutcome =
    timelineHasVisibleOutcome(timelineSegments) || hasRenderableArtifacts || hasRenderableTurnOutputs
  const process = summarizeTurnProcess(turn, activity, activeAssistantMessageId, { hasVisibleOutcome })
  const shouldShowProcess = turn.assistants.length > 0 || shouldShowTurnProcess(process)
  const processSeenRef = React.useRef(shouldShowProcess)
  if (shouldShowProcess) {
    processSeenRef.current = true
  } else if (!turnIsActive) {
    processSeenRef.current = false
  }
  const showTurnProcess = shouldShowProcess || (turnIsActive && processSeenRef.current)
  const hasProcessSegment = timelineSegments.some((segment) => segment.kind === "process")
  // 占位状态卡始终插在内容最前：纯文本回合以"处理中+耗时"卡开头，内容在其下。
  const renderSegments = shouldAppendTurnProcessActivity(showTurnProcess, hasProcessSegment)
    ? [{ kind: "process" as const, key: `${turn.id}:process`, blocks: [] }, ...timelineSegments]
    : timelineSegments
  const lastProcessSegmentIndex = renderSegments.findLastIndex((segment) => segment.kind === "process")
  const firstProcessSegmentIndex = renderSegments.findIndex((segment) => segment.kind === "process")
  const lastResponseSegmentIndex = renderSegments.findLastIndex((segment) => segment.kind === "response")
  const lastSegmentIndex = renderSegments.length - 1
  const lastAssistant = turn.assistants.at(-1)
  const assistantActionTextByMessageId = React.useMemo(
    () => assistantResponseActionTextByMessageId(turn.assistants, activeAssistantMessageId),
    [activeAssistantMessageId, turn.assistants],
  )
  const assistantActionsText = lastAssistant ? assistantActionTextByMessageId.get(lastAssistant.id) : null
  const assistantCancelled = turn.assistants.some((message) => hasStoppedTool(message.parts))
  const responseActionsText =
    lastAssistant?.id === activeAssistantMessageId ? null : textFromTimelineBlocks(responseBlocks) || null
  const processActionsText = responseActionsText ?? assistantActionsText
  const retrySource = React.useMemo(() => retrySourceFromTurn(turn), [turn])
  const handleRetryFresh = React.useCallback(
    () => (retrySource ? onRetryFresh(retrySource) : Promise.resolve()),
    [onRetryFresh, retrySource],
  )
  const handleRecover = React.useCallback(
    (kind: ChatErrorKind) => (retrySource ? onRecover(kind, retrySource) : Promise.resolve()),
    [onRecover, retrySource],
  )

  return (
    <React.Fragment>
      {turn.user ? (
        <MessageBubble
          message={turn.user}
          smoothText={false}
          assistantActionsText={null}
          onRecover={retrySource ? handleRecover : undefined}
          onRetryFresh={retrySource ? handleRetryFresh : undefined}
        />
      ) : null}
      {showTurnProcess ? (
        <>
          {renderSegments.map((segment, segmentIndex) => {
            if (segment.kind === "response") {
              const ownsTurnActions = segmentIndex === lastResponseSegmentIndex && segmentIndex === lastSegmentIndex
              // 产物/输出嵌入消息内容之后、操作按钮（复制/点赞）之前，回合完成后才显示。
              const segmentMessages = Array.from(new Set(segment.blocks.map(({ message }) => message)))
              const segmentArtifacts = segmentMessages.flatMap(
                (message) => artifactGroupsByMessageId.get(message.id) ?? [],
              )
              const segmentOutputRecords = segmentMessages.flatMap((message) =>
                turnOutputRecordsByMessage.get(message.id) ? [turnOutputRecordsByMessage.get(message.id)!] : [],
              )
              const showSegmentArtifacts = !turnIsActive && segmentArtifacts.length > 0
              const showSegmentOutputs = !turnIsActive && segmentOutputRecords.length > 0
              const artifactsSlot =
                showSegmentArtifacts || showSegmentOutputs ? (
                  <div className="mt-2 grid gap-2">
                    {showSegmentArtifacts ? (
                      <React.Suspense fallback={null}>
                        <GeneratedArtifacts
                          groups={segmentArtifacts}
                          onOpen={onArtifactsOpen}
                          onAvailable={onArtifactsAvailable}
                        />
                      </React.Suspense>
                    ) : null}
                    {showSegmentOutputs
                      ? segmentOutputRecords.map((record) => (
                          <TurnOutputShelf key={record.messageId} record={record} onOpen={onTurnOutputOpen} />
                        ))
                      : null}
                  </div>
                ) : null
              return (
                <AssistantTimelineMessage
                  key={segment.key}
                  blocks={segment.blocks}
                  smoothAssistantMessageId={smoothAssistantMessageId}
                  assistantActionsText={ownsTurnActions ? responseActionsText : null}
                  assistantCancelled={ownsTurnActions && assistantCancelled}
                  activeAssistantMessageId={activeAssistantMessageId}
                  artifactsSlot={artifactsSlot}
                  onRecover={retrySource ? handleRecover : undefined}
                  onRetryFresh={retrySource ? handleRetryFresh : undefined}
                />
              )
            }

            const isLastProcess = segmentIndex === lastProcessSegmentIndex
            const segmentTurn = {
              ...turn,
              assistants: assistantMessagesFromTimelineBlocks(segment.blocks),
            }
            const segmentProcess =
              segment.blocks.length === 0
                ? process
                : summarizeTurnProcess(
                    segmentTurn,
                    isLastProcess ? activity : null,
                    isLastProcess ? activeAssistantMessageId : undefined,
                    { hasVisibleOutcome },
                  )
            const ownsTurnActions = isLastProcess && segmentIndex === lastSegmentIndex
            // 最后一个 process 段且当前回合活跃 → 运行中（"处理中+耗时"）。
            // 不要求是渲染的最后一个段：纯文本/思考回合在输出正文时卡片保持处理中，
            // 否则会因 response 段在 process 段之后而误判成已处理。
            // 活跃回合的所有 process 段都算"处理中"，避免同回合出现已处理/处理中并存。
            const processLive = turnIsActive
            // 状态条默认只在第一个 process 段显示；但被正文隔开的收尾工具段（正文之后
            // 还有工具调用）需要自己的状态条，否则它会平铺在正文下方永远收不起来。
            const showTitle =
              segmentIndex === firstProcessSegmentIndex || renderSegments[segmentIndex - 1]?.kind === "response"
            // key 稳定：思考阶段占位段与 reasoning 到达后的真实段若 key 不同会触发重挂载，
            // 导致"思考中"消失一下再出现（抖动）。process 段统一用按序号的 key。
            const segmentKey = `${turn.id}:process:${segmentIndex}`
            return (
              <Message key={segmentKey} from="assistant">
                <MessageContent className="w-full">
                  <TurnProcessActivity
                    blocks={segment.blocks}
                    process={segmentProcess}
                    live={processLive}
                    showTitle={showTitle}
                    onRecover={retrySource ? handleRecover : undefined}
                    onRetryFresh={retrySource ? handleRetryFresh : undefined}
                  />
                </MessageContent>
                {ownsTurnActions && (processActionsText || assistantCancelled) ? (
                  <AssistantMessageActions text={processActionsText ?? ""} cancelled={assistantCancelled} />
                ) : null}
              </Message>
            )
          })}
        </>
      ) : (
        <>
          {turn.assistants.map((message) => (
            <MessageBubble
              key={message.clientId ?? message.id}
              message={message}
              smoothText={message.id === smoothAssistantMessageId}
              assistantActionsText={assistantActionTextByMessageId.get(message.id) ?? null}
              liveTools={message.id === activeAssistantMessageId}
              onRecover={retrySource ? handleRecover : undefined}
              onRetryFresh={retrySource ? handleRetryFresh : undefined}
            />
          ))}
        </>
      )}
    </React.Fragment>
  )
}, chatTurnViewPropsEqual)

function chatTurnHasAssistantMessage(turn: ChatTurn, messageId: string | undefined): boolean {
  return Boolean(messageId && turn.assistants.some((message) => message.id === messageId))
}

interface ChatTimelineProps {
  activeSessionId: string | null
  messages: ChatMessage[]
  status: ChatStatus
  activity: AssistantActivityEvent | null
  isGenerating: boolean
  onRecover: (kind: ChatErrorKind, source: ChatTurnRetrySource) => Promise<void>
  onRetryFresh: (source: ChatTurnRetrySource) => Promise<void>
  onArtifactsOpen: (selection: ArtifactSelection) => void
  onArtifactsAvailable: (selection: ArtifactSelection) => void
  onTurnOutputOpen: (selection: TurnOutputSelection) => void
  onTurnOutputAvailable: (selection: TurnOutputSelection) => void
}

export const ChatTimeline = React.memo(function ChatTimeline({
  activeSessionId,
  messages,
  status,
  activity,
  isGenerating,
  onRecover,
  onRetryFresh,
  onArtifactsOpen,
  onArtifactsAvailable,
  onTurnOutputOpen,
  onTurnOutputAvailable,
}: ChatTimelineProps) {
  const conversationRef = React.useRef<StickToBottomContext | null>(null)
  const lastAutoScrolledUserMessageIdRef = React.useRef<string | null>(null)
  const turnGroupingRef = React.useRef<ChatTurnGrouping>({
    associationTurns: [],
    assistantMessageIdsKey: "",
    messages: [],
    turns: [],
  })
  const artifactGroupsByMessageIdRef = React.useRef<Map<string, ResolvedArtifactGroup[]>>(new Map())
  const artifactGroupsByTurnIdRef = React.useRef<Map<string, ResolvedArtifactGroup[]>>(new Map())
  const latestAssistant = React.useMemo(() => latestAssistantMessage(messages), [messages])
  const turnGrouping = React.useMemo(() => updateChatTurnGrouping(turnGroupingRef.current, messages), [messages])
  React.useLayoutEffect(() => {
    turnGroupingRef.current = turnGrouping
  }, [turnGrouping])
  const { associationTurns, assistantMessageIdsKey: messageIdsKey, turns } = turnGrouping
  const artifactBundles = useArtifactBundles(activeSessionId, messageIdsKey)
  const turnOutputRecords = useTurnOutputRecords(activeSessionId, messageIdsKey)
  const turnOutputRecordsByMessage = React.useMemo(
    () => turnOutputRecordsByMessageId(turnOutputRecords),
    [turnOutputRecords],
  )
  const turnOutputRecordsByTurn = React.useMemo(
    () => turnOutputRecordsByTurnId(associationTurns, turnOutputRecordsByMessage),
    [associationTurns, turnOutputRecordsByMessage],
  )
  const latestTurnOutputRecord = turnOutputRecords.at(-1)
  const activeAssistantMessageId =
    status === "streaming" && latestAssistant && !hasStoppedTool(latestAssistant.parts) ? latestAssistant.id : undefined
  // 回合仍在进行（发送/生成中）：sending/submitted 阶段没有 assistant 消息可标识，
  // 但状态条应显示"处理中"而非"已处理"。
  const turnInFlight = status === "streaming" || status === "submitted"
  // 打字机效果只给正在流式输出的消息（activeAssistantMessageId 存在）。
  // 不能对"刚结束的历史消息"启用（按 createdAt 45s 窗口）：会话恢复/切换后组件重挂载，
  // useSmoothedText 的 visible 从空串初始化 → 完整文字先消失再从零逐字打一遍。
  const smoothAssistantMessageId = React.useMemo(() => {
    if (!latestAssistant || hasStoppedTool(latestAssistant.parts)) {
      return undefined
    }
    return activeAssistantMessageId
  }, [activeAssistantMessageId, latestAssistant])
  const visibleArtifactGroups = React.useMemo<ResolvedArtifactGroup[]>(
    () =>
      artifactBundles.map((bundle) => ({
        display: bundle.display,
        messageId: bundle.messageId,
        kind: bundle.kind,
        group: {
          root: {
            path: bundle.rootPath,
            name: bundle.rootPath.split(/[\\/]/u).pop() ?? bundle.rootPath,
            kind: "directory" as const,
            mime: "inode/directory",
          },
          items: bundle.items,
          totalItems: bundle.totalItems,
          truncated: bundle.truncated,
        },
        status: bundle.status,
        ...(bundle.failure ? { failure: bundle.failure } : {}),
      })),
    [artifactBundles],
  )
  const artifactGroupsByMessageId = React.useMemo(() => {
    const byMessageId = new Map<string, ResolvedArtifactGroup[]>()
    for (const group of visibleArtifactGroups) {
      const groups = byMessageId.get(group.messageId) ?? []
      groups.push(group)
      byMessageId.set(group.messageId, groups)
    }
    return reuseStableArtifactGroupMap(artifactGroupsByMessageIdRef.current, byMessageId)
  }, [visibleArtifactGroups])
  React.useLayoutEffect(() => {
    artifactGroupsByMessageIdRef.current = artifactGroupsByMessageId
  }, [artifactGroupsByMessageId])
  const artifactGroupsByTurnId = React.useMemo(() => {
    const byTurnId = new Map<string, ResolvedArtifactGroup[]>()
    for (const turn of associationTurns) {
      const groups = turn.assistants.flatMap((message) => artifactGroupsByMessageId.get(message.id) ?? [])
      if (groups.length > 0) {
        byTurnId.set(turn.id, groups)
      }
    }
    return reuseStableArtifactGroupMap(artifactGroupsByTurnIdRef.current, byTurnId)
  }, [artifactGroupsByMessageId, associationTurns])
  React.useLayoutEffect(() => {
    artifactGroupsByTurnIdRef.current = artifactGroupsByTurnId
  }, [artifactGroupsByTurnId])
  const latestArtifactGroupMessageId = visibleArtifactGroups.at(-1)?.messageId
  // 会话级成果可用性：以整个会话的产物合集通知右侧面板。重启/切换会话后"成果"入口
  // 立即可用（不依赖流式期间的通知），且打开即为全量文件列表（对齐 LobsterAI 文件列表）。
  // ref 去重：visibleArtifactGroups 引用随父级重渲染变化，不能每次都触发 onArtifactsAvailable。
  const sessionArtifactsNotifiedKeyRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    const displayable = lastDisplayableArtifactGroup(visibleArtifactGroups)
    if (!displayable) {
      return
    }
    const key = `${displayable.resolved.messageId}:${displayable.displayItem.path}:${visibleArtifactGroups.length}`
    if (sessionArtifactsNotifiedKeyRef.current === key) {
      return
    }
    sessionArtifactsNotifiedKeyRef.current = key
    onArtifactsAvailable({
      messageId: displayable.resolved.messageId,
      group: displayable.resolved.group,
      groups: visibleArtifactGroups,
      ...(displayable.resolved.pack ? { pack: displayable.resolved.pack } : {}),
      selectedPath: displayable.displayItem.path,
    })
  }, [visibleArtifactGroups, onArtifactsAvailable])
  const chatNavRailItems = React.useMemo(
    () =>
      turns.flatMap((turn) => {
        if (turn.internal) {
          return []
        }
        const label = (turn.user?.parts ?? [])
          .filter((part) => part.kind === "text")
          .map((part) => part.text ?? "")
          .join(" ")
          .trim()
        const summary = turn.assistants
          .flatMap((message) =>
            (message.parts ?? []).filter((part) => part.kind === "text").map((part) => part.text ?? ""),
          )
          .join(" ")
          .replace(/[#*_~>`]+/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160)
        return [{ turnId: turn.id, label, summary }]
      }),
    [turns],
  )
  React.useEffect(() => {
    if (latestTurnOutputRecord) {
      onTurnOutputAvailable({
        record: latestTurnOutputRecord,
        initialRole: turnOutputInitialRole(latestTurnOutputRecord),
      })
    }
  }, [latestTurnOutputRecord, onTurnOutputAvailable])

  React.useEffect(() => {
    const lastMessage = messages.at(-1)
    if (
      !isGenerating ||
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.id === lastAutoScrolledUserMessageIdRef.current
    ) {
      return
    }
    lastAutoScrolledUserMessageIdRef.current = lastMessage.id
    void conversationRef.current?.scrollToBottom({
      animation: "instant",
      ignoreEscapes: true,
    })
  }, [isGenerating, messages])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <Conversation className="min-h-0 flex-1" contextRef={conversationRef}>
        <ConversationContent
          data-selectable="true"
          className={cn("mx-auto min-h-full w-full gap-4 px-4 pt-7 pb-9", CHAT_CONTENT_MAX_WIDTH_CLASS)}
          scrollClassName="oo-scrollbar-gutter-stable"
        >
          {turns.map((turn, index) => {
            // 内部消息（压缩 summary）turn：渲染为永久「已完成上下文压缩」分隔线，
            // 不渲染消息内容（对齐 opencode 留在对话流的 summary 元信息行）。
            if (turn.internal) {
              return <CompactionDivider key={turn.id} phase="done" />
            }
            const turnArtifactGroups = artifactGroupsByTurnId.get(turn.id) ?? EMPTY_ARTIFACT_GROUPS
            const publishArtifactAvailability =
              turnArtifactGroups.length > 0 &&
              turn.assistants.some((message) => message.id === latestArtifactGroupMessageId)
            const turnActiveAssistantMessageId = chatTurnHasAssistantMessage(turn, activeAssistantMessageId)
              ? activeAssistantMessageId
              : undefined
            const turnSmoothAssistantMessageId = chatTurnHasAssistantMessage(turn, smoothAssistantMessageId)
              ? smoothAssistantMessageId
              : undefined
            return (
              <div
                key={turn.id}
                data-chat-turn-id={turn.id}
                className="oo-chat-turn-render-boundary grid min-w-0 gap-4"
              >
                <ChatTurnView
                  activeSessionId={activeSessionId}
                  artifactGroups={turnArtifactGroups}
                  artifactGroupsByMessageId={artifactGroupsByMessageId}
                  turnOutputRecordsByMessage={turnOutputRecordsByMessage}
                  turn={turn}
                  turnOutputRecord={turnOutputRecordsByTurn.get(turn.id) ?? null}
                  activity={activityForChatTurn(turn, activity, activeAssistantMessageId, index === turns.length - 1)}
                  activeAssistantMessageId={turnActiveAssistantMessageId}
                  turnInFlight={turnInFlight}
                  isLatestTurn={index === turns.length - 1}
                  smoothAssistantMessageId={turnSmoothAssistantMessageId}
                  onRecover={onRecover}
                  onRetryFresh={onRetryFresh}
                  onArtifactsOpen={onArtifactsOpen}
                  onArtifactsAvailable={publishArtifactAvailability ? onArtifactsAvailable : noopArtifactsAvailable}
                  onTurnOutputOpen={onTurnOutputOpen}
                />
              </div>
            )
          })}
          {activity && isCompactionActivity(activity) ? <CompactionDivider phase={activity.phase} /> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <ChatNavRail
        items={chatNavRailItems}
        getScrollElement={() => conversationRef.current?.scrollRef.current ?? null}
      />
    </div>
  )
})
