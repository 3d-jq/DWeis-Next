import type { AuthorizationInfo, ChatMessagePart, ToolStatus } from "../../../electron/chat/common.ts"
import type { ToolDisplayLine } from "./tool-display.ts"
import type { TranslateFn } from "@/i18n/i18n"

import {
  Check,
  ChevronRight,
  CircleAlert,
  Circle,
  CircleHelp,
  FilePenLine,
  FilePlus2,
  FileSearch,
  FileText,
  FolderOpen,
  Globe,
  LibraryBig,
  ListChecks,
  Loader2,
  Package,
  PlayCircle,
  Plug,
  Search,
  SlidersHorizontal,
  Square,
  SquareTerminal,
  Wrench,
} from "lucide-react"
import { motion } from "motion/react"
import * as React from "react"
import { ImageGenAnimation } from "./ImageGenAnimation.tsx"
import { LoadingShimmerText } from "./LoadingShimmerText.tsx"
import { shouldShowRunningNoOutput } from "./tool-activity.ts"
import { shouldHideToolDetailsImmediately } from "./tool-details-visibility.ts"
import { isWikigraphKnowledgeActivityPart, parseToolAuthorization, toolDisplayLine } from "./tool-display.ts"
import { formatToolOutputPreview, toolOutputPreviewLimitChars } from "./tool-output-preview.ts"
import { isActiveToolPart, isToolCancellation } from "./tool-state.ts"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

function hasKeys(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0)
}

function toolStatusLabel(t: TranslateFn, status: ToolStatus | undefined): string {
  switch (status) {
    case "pending":
      return t("chat.toolStatusPending")
    case "running":
      return t("chat.toolStatusRunning")
    case "completed":
      return t("chat.toolStatusCompleted")
    case "error":
      return t("chat.toolStatusError")
    default:
      return t("chat.toolStatusPending")
  }
}

function toolPartStatusLabel(t: TranslateFn, part: ChatMessagePart, stopped = false): string {
  if (stopped) {
    return t("chat.toolStatusStopped")
  }
  if (part.tool === "question" && (part.status === "pending" || part.status === "running")) {
    return t("chat.toolStatusWaitingForAnswer")
  }
  return isToolCancellation(part) ? t("chat.toolStatusStopped") : toolStatusLabel(t, part.status)
}

function ToolInlineDetail({ line }: { line: ToolDisplayLine }) {
  if (!line.detail) {
    return null
  }
  if (line.detailKind === "code") {
    return (
      <code className="w-0 max-w-full min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em] font-medium text-muted-foreground">
        {line.detail}
      </code>
    )
  }
  return <span className="w-0 max-w-full min-w-0 flex-1 truncate font-medium text-muted-foreground">{line.detail}</span>
}

function formatJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2)
}

function normalizeQuestionAnswers(answers: unknown[]): string {
  return answers
    .flatMap((answer) => (Array.isArray(answer) ? answer : [answer]))
    .map((answer) => String(answer).trim())
    .filter(Boolean)
    .join("\n")
}

function questionAnswerSummary(part: ChatMessagePart): string {
  const answers = part.metadata?.answers
  if (Array.isArray(answers)) {
    return normalizeQuestionAnswers(answers)
  }
  if (!part.output) {
    return ""
  }
  try {
    const parsed = JSON.parse(part.output) as { answers?: unknown }
    if (!Array.isArray(parsed.answers)) {
      return ""
    }
    return normalizeQuestionAnswers(parsed.answers)
  } catch {
    return ""
  }
}

function ToolStatusIcon({ status, stopped = false }: { status: ToolStatus | undefined; stopped?: boolean }) {
  if (stopped) {
    return <Square className="size-3.5 text-muted-foreground" />
  }
  switch (status) {
    case "running":
      // 运行中：info 色旋转，比灰色更醒目（"工具在推进"的实时反馈）。
      return <Loader2 className="size-3.5 animate-spin text-info" />
    case "completed":
      return <Circle className="size-3.5 text-muted-foreground" />
    case "error":
      return <CircleAlert className="size-3.5 text-muted-foreground" />
    case "pending":
    default:
      return <Circle className="size-3.5 text-muted-foreground" />
  }
}

function ToolActionIcon({ part }: { part: ChatMessagePart }) {
  const className = "size-3.5 text-muted-foreground"
  switch (part.tool) {
    case "list_apps":
      return <Plug className={className} />
    case "search_actions":
      return <Search className={className} />
    case "inspect_action":
      return <SlidersHorizontal className={className} />
    case "call_action":
      return <PlayCircle className={className} />
    case "query_knowledge":
      return <LibraryBig className={className} />
    case "bash":
      return <SquareTerminal className={className} />
    case "read":
      return <FileText className={className} />
    case "write":
      return <FilePlus2 className={className} />
    case "edit":
      return <FilePenLine className={className} />
    case "list":
      return <FolderOpen className={className} />
    case "grep":
    case "glob":
      return <FileSearch className={className} />
    case "webfetch":
      return <Globe className={className} />
    case "task":
      return <ListChecks className={className} />
    case "question":
      return <CircleHelp className={className} />
    default:
      if (part.tool?.startsWith("todo")) {
        return <ListChecks className={className} />
      }
      if (part.title?.match(/^Loaded skill:/i)) {
        return <Package className={className} />
      }
      return <Wrench className={className} />
  }
}

/** 旋转地球（借鉴 AICSS Web Search）：六条经线相位错开，沿球面路径变换，视觉上是旋转球体。 */
const GLOBE_MERIDIANS = {
  L: "M6.057 11.565 C2.081 11.565 0.371 8.159 0.371 5.964 C0.371 3.642 2.152 0.329 6.05 0.329",
  ML: "M6.012 11.55 C4.575 10.496 3.333 8.116 3.321 5.964 C3.307 3.399 4.974 0.977 6.012 0.329",
  MR: "M6.012 11.55 C7.211 10.781 8.715 8.287 8.715 5.964 C8.715 3.399 7.24 1.233 6.012 0.329",
  R: "M6.012 11.55 C9.677 11.55 11.65 8.487 11.65 5.964 C11.65 3.499 9.748 0.329 6.012 0.329",
} as const

function SearchGlobeIcon({ className }: { className?: string }) {
  const values = [GLOBE_MERIDIANS.L, GLOBE_MERIDIANS.ML, GLOBE_MERIDIANS.MR, GLOBE_MERIDIANS.R, GLOBE_MERIDIANS.L].join(
    ";",
  )
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.85"
      strokeLinecap="round"
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5.7" opacity="0.9" />
      <line x1="0.3" y1="6" x2="11.7" y2="6" opacity="0.9" />
      {["0s", "-1.2s", "-2.4s", "-3.6s", "-4.8s", "-6s"].map((begin) => (
        <path key={begin} d={GLOBE_MERIDIANS.L} opacity="0">
          <animate
            attributeName="d"
            dur="7.2s"
            begin={begin}
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;0.25;0.5;0.75;1"
            keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
            values={values}
          />
          <animate
            attributeName="opacity"
            dur="7.2s"
            begin={begin}
            repeatCount="indefinite"
            calcMode="linear"
            keyTimes="0;0.05;0.7;0.75;1"
            values="0;0.9;0.9;0;0"
          />
        </path>
      ))}
    </svg>
  )
}

function ToolStepIcon({ part, stopped = false }: { part: ChatMessagePart; stopped?: boolean }) {
  if (isWikigraphKnowledgeActivityPart(part) && part.status !== "error" && !stopped) {
    return <LibraryBig className="size-3.5 text-muted-foreground" />
  }
  // 抓取/搜索类工具：运行中显示旋转地球（实时反馈），完成显示打勾。
  if (part.tool === "webfetch") {
    if (part.status === "running") {
      return <SearchGlobeIcon className="size-3.5 text-info" />
    }
    if (part.status === "completed") {
      return <Check className="size-3.5 text-muted-foreground" />
    }
  }
  if (part.status === "error" || stopped) {
    return <ToolStatusIcon status={part.status} stopped={stopped} />
  }
  return <ToolActionIcon part={part} />
}

function ToolDetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="oo-text-micro font-medium text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  )
}

function ToolPre({ children, tone = "default" }: { children: string; tone?: "default" | "error" }) {
  return (
    <pre
      className={cn(
        "oo-text-micro max-h-56 overflow-auto rounded-md border bg-background p-2.5 whitespace-pre-wrap",
        tone === "error" && "border-destructive/25 bg-destructive/5 text-destructive",
      )}
    >
      {children}
    </pre>
  )
}

function hasToolDetails(
  part: ChatMessagePart,
  auth: AuthorizationInfo | null,
  answerSummary: string,
  stopped = false,
): boolean {
  if (part.tool === "question") {
    return Boolean(answerSummary)
  }
  return (
    hasKeys(part.input) ||
    hasKeys(part.metadata) ||
    Boolean(part.output && !auth) ||
    Boolean(part.error && !stopped) ||
    Boolean(auth?.message) ||
    (!stopped && shouldShowRunningNoOutput(part)) ||
    Boolean(part.attachmentsCount)
  )
}

export const ToolActivityStep = React.memo(function ToolActivityStep({
  part,
  live = true,
  shimmer = false,
  settling = false,
}: {
  part: ChatMessagePart
  live?: boolean
  shimmer?: boolean
  settling?: boolean
}) {
  const t = useT()
  const auth = parseToolAuthorization(part)
  const activePart = isActiveToolPart(part)
  const stopped = isToolCancellation(part) || (!live && activePart)
  const answerSummary = questionAnswerSummary(part)
  const hideDetails = isWikigraphKnowledgeActivityPart(part)
  const details = !hideDetails && hasToolDetails(part, auth, answerSummary, stopped)
  const [open, setOpen] = React.useState(false)
  const [detailsVisible, setDetailsVisible] = React.useState(false)
  const outputPreviewRef = React.useRef<{ output: string; text: string; truncated: boolean } | null>(null)
  const statusText =
    settling && part.status === "completed" ? t("chat.toolStatusFinalizing") : toolPartStatusLabel(t, part, stopped)
  const active = live && activePart
  const showShimmer = active || shimmer
  const displayLine = toolDisplayLine(t, part)
  const metaItems = [statusText].filter(Boolean)
  const hideCompletedMeta = part.status === "completed" && !auth && !hideDetails
  const outputPreview = React.useMemo(() => {
    if (!detailsVisible || !part.output || auth) {
      return null
    }
    const cached = outputPreviewRef.current
    if (cached?.output === part.output) {
      return cached
    }
    const preview = formatToolOutputPreview(part.output)
    const next = { output: part.output, ...preview }
    outputPreviewRef.current = next
    return next
  }, [auth, detailsVisible, part.output])

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setDetailsVisible(true)
    } else if (
      shouldHideToolDetailsImmediately(
        nextOpen,
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      )
    ) {
      setDetailsVisible(false)
    }
    setOpen(nextOpen)
  }, [])

  const handleContentAnimationEnd = React.useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && !open) {
        setDetailsVisible(false)
      }
    },
    [open],
  )

  const row = (
    <div className="group/tool-step flex min-h-6 w-full max-w-full min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <span className="flex size-5 shrink-0 items-center justify-center" title={statusText}>
        <ToolStepIcon part={part} stopped={stopped} />
      </span>
      <div className="w-0 max-w-full min-w-0 flex-1 overflow-hidden">
        {showShimmer ? (
          <div className="flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden">
            <LoadingShimmerText className="min-w-0 shrink-0 truncate font-medium">
              {displayLine.title}
            </LoadingShimmerText>
            <ToolInlineDetail line={displayLine} />
            {displayLine.detail ? null : <span aria-hidden="true" className="min-w-0 flex-1" />}
            <span className="flex min-w-0 shrink-0 items-center gap-1 font-medium text-muted-foreground">
              {metaItems.map((item, index) => (
                <React.Fragment key={`${index}:${item}`}>
                  {index > 0 ? <span className="text-muted-foreground/70">·</span> : null}
                  <span>{item}</span>
                </React.Fragment>
              ))}
            </span>
          </div>
        ) : (
          <div className="flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden">
            <span
              className={cn("min-w-0 truncate font-medium text-foreground", displayLine.detail ? "shrink-0" : "flex-1")}
            >
              {displayLine.title}
            </span>
            <ToolInlineDetail line={displayLine} />
            <span
              className={cn(
                "flex min-w-0 shrink-0 items-center gap-1 font-medium text-muted-foreground transition-opacity",
                hideCompletedMeta && "opacity-0 group-hover/tool-step:opacity-100",
                hideCompletedMeta &&
                  details &&
                  "group-focus-visible/tool-step:opacity-100 group-data-[state=open]/tool-step:opacity-100",
              )}
            >
              {metaItems.map((item, index) => (
                <React.Fragment key={`${index}:${item}`}>
                  {index > 0 ? <span className="text-muted-foreground/70">·</span> : null}
                  <span>{item}</span>
                </React.Fragment>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  )
  return (
    <Collapsible className="w-full max-w-full min-w-0 overflow-hidden" open={open} onOpenChange={handleOpenChange}>
      <div className="w-full max-w-full min-w-0 overflow-hidden rounded-md">
        {details ? (
          <CollapsibleTrigger className="group/tool-step flex w-full max-w-full min-w-0 items-center justify-between gap-2 overflow-hidden text-left">
            {row}
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] group-hover/tool-step:opacity-100 group-focus-visible/tool-step:opacity-100 group-data-[state=open]/tool-step:rotate-90 group-data-[state=open]/tool-step:opacity-100" />
          </CollapsibleTrigger>
        ) : (
          row
        )}
      </div>
      {part.tool === "generate_image" && active ? (
        <div className="ml-7">
          <ImageGenAnimation prompt={typeof part.input?.prompt === "string" ? part.input.prompt : undefined} />
        </div>
      ) : null}
      {details && (
        <CollapsibleContent
          className="overflow-hidden motion-reduce:animate-none"
          onAnimationEnd={handleContentAnimationEnd}
        >
          <div className="ml-7 space-y-2.5 pt-1.5 pb-1">
            {detailsVisible && part.tool === "question" && answerSummary ? (
              <ToolDetailSection label={t("chat.questionAnswered")}>
                <ToolPre>{answerSummary}</ToolPre>
              </ToolDetailSection>
            ) : null}
            {detailsVisible && part.tool !== "question" && hasKeys(part.input) && (
              <ToolDetailSection label={t("chat.toolParams")}>
                <ToolPre>{formatJson(part.input ?? {})}</ToolPre>
              </ToolDetailSection>
            )}
            {detailsVisible && !stopped && shouldShowRunningNoOutput(part) && (
              <div className="oo-text-caption text-muted-foreground">{t("chat.toolRunningNoOutput")}</div>
            )}
            {detailsVisible && part.error && !stopped && (
              <div className="oo-text-caption text-muted-foreground">{t("chat.toolRecoverableIssue")}</div>
            )}
            {outputPreview ? (
              <motion.div
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <ToolDetailSection label={t("chat.toolResult")}>
                  <ToolPre>{outputPreview.text}</ToolPre>
                  {outputPreview.truncated ? (
                    <div className="oo-text-caption text-muted-foreground">
                      {t("chat.toolResultPreviewTruncated", { limit: toolOutputPreviewLimitChars })}
                    </div>
                  ) : null}
                </ToolDetailSection>
              </motion.div>
            ) : null}
            {detailsVisible && part.error && !stopped && (
              <ToolDetailSection label={t("chat.toolError")}>
                <ToolPre>{part.error}</ToolPre>
              </ToolDetailSection>
            )}
            {detailsVisible && auth?.message && (
              <ToolDetailSection label={t("chat.toolError")}>
                <ToolPre tone="error">{auth.message}</ToolPre>
              </ToolDetailSection>
            )}
            {detailsVisible && hasKeys(part.metadata) && (
              <ToolDetailSection label={t("chat.toolMetadata")}>
                <ToolPre>{formatJson(part.metadata ?? {})}</ToolPre>
              </ToolDetailSection>
            )}
            {detailsVisible && part.attachmentsCount ? (
              <div className="oo-text-caption text-muted-foreground">
                {t("chat.toolAttachments", { count: part.attachmentsCount })}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
})
