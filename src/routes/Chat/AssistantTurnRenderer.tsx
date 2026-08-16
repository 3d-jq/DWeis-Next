import type { AssistantActivityEvent, ChatAttachment, ChatMessagePart } from "../../../electron/chat/common.ts"
import type { ChatErrorKind } from "../../../electron/chat/error.ts"
import type { AssistantTimelineBlock } from "./assistant-timeline.ts"
import type { AssistantBlockType } from "./assistant-turn-renderer-model.ts"
import type { ChatTurnProcessStatus } from "./chat-turns.ts"
import type { ProcessOpenPreference } from "./process-activity-open.ts"
import type { RenderBlock } from "./render-blocks.ts"
import type { TranslateFn } from "@/i18n/i18n"

import { BrainIcon, ChevronRight } from "lucide-react"
import * as React from "react"
import { assistantBlockClassName } from "./assistant-turn-renderer-model.ts"
import { chatTurnProcessStatus, isLiveTurnProcess, summarizeTurnProcess } from "./chat-turns.ts"
import { ChatErrorNotice } from "./ChatErrorNotice.tsx"
import { LoadingShimmerText } from "./LoadingShimmerText.tsx"
import { processOpenAfterStatusChange, processShouldOpenAutomatically } from "./process-activity-open.ts"
import {
  buildTurnProcessActivityRenderModel,
  latestActiveProcessTool,
  shouldShowProcessLiveStatus,
} from "./process-activity-render-model.ts"
import { ReasoningBlock } from "./ReasoningBlock.tsx"
import { formatWholeSecondDuration } from "./tool-activity.ts"
import { toolActionSummary } from "./tool-display.ts"
import { ToolActivityStep } from "./ToolActivityStep.tsx"
import { groupedToolActivityParts } from "./wikigraph-tool-grouping.ts"
import { MessageResponse } from "@/components/ai-elements/message"
import { MarkdownImage } from "@/components/ai-elements/message-image"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useT } from "@/i18n/i18n"

/** 块级稳定 key：推理块按 message.id + "reasoning" 而非 partId——
 * 多个推理 part 合并为一个块，共用同一 key，流式增量实时填充到已展开的块
 * （否则 partId 变化重挂载折叠，推理在折叠中累积、结束才看到全量）。 */
function stableBlockKey(message: { id: string }, block: RenderBlock): string {
  if (block.kind === "tools") {
    return `${message.id}:${block.key}`
  }
  if (block.kind === "reasoning") {
    return `${message.id}:reasoning`
  }
  return `${message.id}:${block.part.partId}`
}

function formatSettledToolActivityDuration(parts: ChatMessagePart[]): string | null {
  let start: number | undefined
  let end: number | undefined
  for (const part of parts) {
    const partStart = part.timing?.start
    const partEnd = part.timing?.end
    if (typeof partStart !== "number" || typeof partEnd !== "number" || partEnd < partStart) {
      continue
    }
    start = start === undefined ? partStart : Math.min(start, partStart)
    end = end === undefined ? partEnd : Math.max(end, partEnd)
  }
  return start === undefined || end === undefined ? null : formatWholeSecondDuration(end - start)
}

function formatProcessDuration(
  process: ReturnType<typeof summarizeTurnProcess>,
  now: number,
  live = false,
): string | null {
  const isLive = isLiveTurnProcess(process, live)
  const toolDuration = !isLive && process.tools.length > 0 ? formatSettledToolActivityDuration(process.tools) : null
  if (!isLive && toolDuration) {
    return toolDuration
  }
  const start = process.startedAt
  const end = isLive ? now : process.endedAt
  if (typeof start !== "number" || typeof end !== "number" || end < start) {
    return null
  }
  return formatWholeSecondDuration(end - start)
}

/**
 * 状态条耗时微组件：只负责实时耗时的 1s 计时，避免整回合（思考/工具子树）每秒重渲染。
 * 非 live（已处理）时耗时固定，不启动 interval。
 */
const ProcessDurationLabel = React.memo(function ProcessDurationLabel({
  process,
  live,
}: {
  process: ReturnType<typeof summarizeTurnProcess>
  live: boolean
}) {
  const [now, setNow] = React.useState(() => Date.now())
  const isLive = isLiveTurnProcess(process, live)
  React.useEffect(() => {
    if (!isLive) {
      return
    }
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isLive])
  const duration = formatProcessDuration(process, now, live)
  // 处理中耗时槽位常驻（min-w-8）："处理中" → "处理中 12s" 切换时 chevron 不再右移。
  // 非 live 回合无耗时（纯文本回合）时不占位。
  if (!isLive && !duration) {
    return null
  }
  return <span className="inline-block min-w-8 shrink-0 text-left tabular-nums">{duration ?? ""}</span>
})

function processStatusText(t: TranslateFn, status: ChatTurnProcessStatus): string {
  switch (status) {
    case "running":
      return t("chat.turnProcessing")
    case "retrying":
      return t("chat.processRetrying")
    case "needsAction":
      return t("chat.processNeedsAction")
    case "error":
      return t("chat.processError")
    case "stopped":
      return t("chat.processStopped")
    case "completed":
      return t("chat.turnCompleted")
    case "completedWithIssues":
      return t("chat.processCompletedWithIssues")
  }
}

function processTitle(t: TranslateFn, status: ChatTurnProcessStatus, duration: string | null): string {
  const title = processStatusText(t, status)
  return duration ? `${title} ${duration}` : title
}

export function TurnProcessActivity({
  blocks,
  process,
  live = false,
  onRecover,
  onRetryFresh,
  showTitle = true,
}: {
  blocks: AssistantTimelineBlock[]
  process: ReturnType<typeof summarizeTurnProcess>
  live?: boolean
  onRecover?: (kind: ChatErrorKind) => Promise<void> | void
  onRetryFresh?: () => Promise<void> | void
  /** 只渲染内容（思考/工具块），不渲染状态条标题：同一回合多个 process 段时只显示一次状态条。 */
  showTitle?: boolean
}) {
  const t = useT()
  const renderModel = React.useMemo(
    () => buildTurnProcessActivityRenderModel({ blocks, live, process }),
    [blocks, live, process],
  )
  const status = renderModel.status
  const shouldOpen = processShouldOpenAutomatically(status, process.hasVisibleOutcome)
  const statusKey = renderModel.statusKey
  const [open, setOpen] = React.useState(shouldOpen)
  const openPreferenceRef = React.useRef<ProcessOpenPreference>("auto")
  const activityBlocks = renderModel.activityBlocks
  const renderBlocks = renderModel.renderBlocks
  const showLiveStatus = renderModel.showLiveStatus
  const titleText = processStatusText(t, status)
  const settlingPartId = renderModel.settlingPartId

  // 状态变化时按偏好更新展开/收起（运行中展开、完成收起，用户手动操作优先）。
  React.useEffect(() => {
    setOpen(
      processOpenAfterStatusChange({
        hasVisibleOutcome: process.hasVisibleOutcome,
        preference: openPreferenceRef.current,
        status,
      }),
    )
  }, [process.hasVisibleOutcome, status, statusKey])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      // 处理中锁定展开：生成期间不允许折叠（点击折叠被忽略），保证用户能看到
      // 进行中的思考/工具过程；回合完成后（live=false）才可自由折叠/展开。
      if (live && !nextOpen) {
        return
      }
      openPreferenceRef.current = nextOpen ? "user_open" : "user_closed"
      setOpen(nextOpen)
    },
    [live],
  )

  // 后续 process 段：直接平铺内容，不重复渲染状态条标题。
  if (!showTitle) {
    return (
      <div className="not-prose my-0 w-full">
        {activityBlocks.length > 0 ? (
          <div className="space-y-0.5">
            {activityBlocks.map(({ message, block }, index) => (
              <AssistantBlock
                key={stableBlockKey(message, block)}
                block={block}
                blockClassName={assistantBlockClassName(renderBlocks, index)}
                smoothText={false}
                settlingToolPartId={settlingPartId}
                liveTools={live}
                onRecover={onRecover}
                onRetryFresh={onRetryFresh}
              />
            ))}
          </div>
        ) : null}
        {showLiveStatus ? <LiveStatusBar process={process} live={live} /> : null}
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="not-prose my-0 w-full">
      <div className="border-b border-border/60 py-1.5 pr-1.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            // 处理中锁定展开（生成期间不允许折叠，见 handleOpenChange）：禁用触发钮给出
            // 明确视觉反馈，避免点击被静默吞掉后用户以为按钮坏了（"收不起"）。
            disabled={live}
            aria-disabled={live}
            className="group inline-flex max-w-full items-center gap-1.5 text-left font-medium text-[var(--oo-section-heading-foreground)] transition-colors select-none hover:text-foreground disabled:cursor-default disabled:opacity-60 disabled:hover:text-[var(--oo-section-heading-foreground)]"
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate">{titleText}</span>
              <ProcessDurationLabel process={process} live={live} />
            </span>
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="space-y-0.5 pt-1.5">
          {activityBlocks.map(({ message, block }, index) => (
            <AssistantBlock
              key={stableBlockKey(message, block)}
              block={block}
              blockClassName={assistantBlockClassName(renderBlocks, index)}
              smoothText={false}
              settlingToolPartId={settlingPartId}
              liveTools={live}
              onRecover={onRecover}
              onRetryFresh={onRetryFresh}
            />
          ))}
          {showLiveStatus ? <LiveStatusBar process={process} live={live} /> : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function LiveStatusBar({
  process,
  live = false,
}: {
  process: ReturnType<typeof summarizeTurnProcess> | null
  live?: boolean
}) {
  const t = useT()

  if (!process) {
    return null
  }

  const status = chatTurnProcessStatus(process, live)
  const activeTool = latestActiveProcessTool(process)
  const showContent = shouldShowProcessLiveStatus(process, status)
  // 状态行只在内容块未到达时显示（思考/整理占位）：推理内容一到，推理块（同为 24px 行）
  // 原位替换它，不产生跳动；若处理中常驻空行会变成空白缝隙，且与内容块重复显示。
  if (!showContent) {
    return null
  }
  // 思考阶段占位与 ReasoningBlock 完全一致（BrainIcon + text-xs + 扫光"深度思考"），
  // 避免 thinking → reasoning 内容到达时字号/图标跳动。
  const isThinking = status === "running" && process.activity?.phase === "thinking"

  const text = (() => {
    if (status === "retrying" && process.activity) {
      return activityText(t, process.activity)
    }
    if (activeTool) {
      return t("chat.liveStatusTool", { action: toolActionSummary(t, activeTool) })
    }
    if (process.activity) {
      return activityText(t, process.activity)
    }
    return processTitle(t, status, null)
  })()

  return (
    <div className="rounded-md text-muted-foreground">
      <div className="flex min-h-6 items-center gap-2">
        {/* 图标盒常驻（思考时显示脑图标）：相位切换时文字列固定在 28px，不再左右跳。 */}
        <span className="flex size-5 shrink-0 items-center justify-center">
          {isThinking ? <BrainIcon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        </span>
        {showContent ? (
          <LoadingShimmerText className="min-w-0 truncate text-xs font-medium">
            {isThinking ? t("chat.reasoningToggle") : text}
          </LoadingShimmerText>
        ) : null}
      </div>
    </div>
  )
}

function activityText(t: TranslateFn, activity: AssistantActivityEvent | null): string {
  switch (activity?.phase) {
    case "retrying":
      return activity.attempt
        ? t("chat.activityRetryingWithAttempt", { attempt: activity.attempt })
        : t("chat.activityRetrying")
    case "finalizing":
      return t("chat.activityFinalizing")
    case "thinking":
    default:
      return t("chat.thinking")
  }
}

function statusPartText(t: TranslateFn, part: ChatMessagePart): string {
  switch (part.statusType) {
    case "generationStale":
      return t("chat.generationStale")
    case "toolRunningWithoutOutput":
      return t("chat.toolRunningWithoutOutput")
    case "runtimeRestarting":
      return part.attempt && part.maxAttempts
        ? t("chat.runtimeRestartingWithAttempt", { attempt: part.attempt, maxAttempts: part.maxAttempts })
        : t("chat.runtimeRestarting")
    case "runtimeRecovered":
      return t("chat.runtimeRecovered")
    case "runtimeFailed":
      return t("chat.runtimeFailed")
    default:
      return part.text ?? ""
  }
}

export function AssistantBlock({
  block,
  blockClassName,
  smoothText,
  settlingToolPartId,
  liveTools = true,
  onRecover,
  onRetryFresh,
}: {
  block: AssistantBlockType
  blockClassName?: string
  smoothText: boolean
  settlingToolPartId?: string
  liveTools?: boolean
  onRecover?: (kind: ChatErrorKind) => Promise<void> | void
  onRetryFresh?: () => Promise<void> | void
}) {
  const t = useT()
  return (
    <div className={blockClassName}>
      {block.kind === "text" ? (
        block.part.text ? (
          <MessageResponse smooth={smoothText}>{block.part.text}</MessageResponse>
        ) : null
      ) : block.kind === "reasoning" ? (
        <ReasoningBlock part={block.part} />
      ) : block.kind === "error" ? (
        <ChatErrorNotice
          errorCode={block.part.errorCode}
          errorKind={block.part.errorKind}
          message={block.part.errorText ?? block.part.error ?? t("chatError.failed.description")}
          onRecover={onRecover}
          onRetryFresh={onRetryFresh}
        />
      ) : block.kind === "status" ? (
        <div className="text-sm leading-6 font-medium text-muted-foreground/80">{statusPartText(t, block.part)}</div>
      ) : block.kind === "attachment" ? (
        block.part.attachment ? (
          <AssistantAttachment attachment={block.part.attachment} />
        ) : null
      ) : (
        <div className="space-y-0.5">
          {groupedToolActivityParts(block.parts).map((part) => (
            <ToolActivityStep
              key={part.partId}
              part={part}
              live={liveTools}
              shimmer={part.partId === settlingToolPartId}
              settling={part.partId === settlingToolPartId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AssistantAttachment({ attachment }: { attachment: ChatAttachment }) {
  return <MarkdownImage src={attachment.path} alt={attachment.name} />
}
