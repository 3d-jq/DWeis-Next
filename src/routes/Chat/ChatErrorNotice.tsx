import type { ChatErrorKind, ChatErrorSeverity } from "./chat-error.ts"

import { AlertTriangle, CheckIcon, CopyIcon, RefreshCw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { chatErrorRecoveryKind, resolveChatError } from "./chat-error.ts"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/i18n"
import { writeClipboardText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"

interface ChatErrorNoticeProps {
  errorCode?: string
  errorKind?: ChatErrorKind
  message: string
  onRecover?: (kind: ChatErrorKind) => Promise<void> | void
  onRetryFresh?: () => Promise<void> | void
}

const copyFeedbackMs = 1_500

function severityClassName(severity: ChatErrorSeverity): string {
  switch (severity) {
    case "warning":
      return "border-[var(--oo-warning-border)] bg-[var(--oo-warning-surface)]"
    case "info":
      return "border-border bg-muted/55"
    case "destructive":
      return "border-[var(--oo-danger-border)] bg-[var(--oo-danger-surface)]"
  }
}

function iconClassName(severity: ChatErrorSeverity): string {
  switch (severity) {
    case "warning":
      return "bg-[var(--oo-warning-surface)] text-[var(--oo-warning-foreground)]"
    case "info":
      return "bg-muted text-muted-foreground"
    case "destructive":
      return "bg-destructive/10 text-destructive"
  }
}

export function ChatErrorNotice({ errorCode, errorKind, message, onRecover, onRetryFresh }: ChatErrorNoticeProps) {
  const t = useT()
  const error = resolveChatError(message, { errorCode, errorKind })
  const [diagnosticsCopied, setDiagnosticsCopied] = React.useState(false)
  const [freshRetrying, setFreshRetrying] = React.useState(false)
  const copyFeedbackTimerRef = React.useRef<number | undefined>(undefined)
  const isContentFiltered = error.kind === "content_filtered"
  const recoveryKind = chatErrorRecoveryKind(error.kind)

  React.useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== undefined) {
        window.clearTimeout(copyFeedbackTimerRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    setDiagnosticsCopied(false)
    if (copyFeedbackTimerRef.current !== undefined) {
      window.clearTimeout(copyFeedbackTimerRef.current)
      copyFeedbackTimerRef.current = undefined
    }
  }, [error.diagnostics])

  const handleCopyDiagnostics = React.useCallback(() => {
    void writeClipboardText(error.diagnostics).then((didCopy) => {
      if (!didCopy) {
        setDiagnosticsCopied(false)
        toast.error(t("chatError.common.copyFailed"))
        return
      }
      setDiagnosticsCopied(true)
      if (copyFeedbackTimerRef.current !== undefined) {
        window.clearTimeout(copyFeedbackTimerRef.current)
      }
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setDiagnosticsCopied(false)
        copyFeedbackTimerRef.current = undefined
      }, copyFeedbackMs)
    })
  }, [error.diagnostics, t])

  const handleRetryFresh = React.useCallback(async () => {
    if (!onRetryFresh || freshRetrying) {
      return
    }
    setFreshRetrying(true)
    try {
      await onRetryFresh()
    } catch {
      toast.error(t("chatError.contentFiltered.retryFailed"))
    } finally {
      setFreshRetrying(false)
    }
  }, [freshRetrying, onRetryFresh, t])

  const handleRecover = React.useCallback(async () => {
    if (!onRecover || freshRetrying) {
      return
    }
    setFreshRetrying(true)
    try {
      await onRecover(error.kind)
    } catch {
      toast.error(t("chatError.failed.retryFailed"))
    } finally {
      setFreshRetrying(false)
    }
  }, [error.kind, freshRetrying, onRecover, t])

  const title = t(error.titleKey)
  const description = error.descriptionText ?? t(error.descriptionKey)
  const diagnosticsActionKey = error.secondaryActionKey ?? "chatError.common.copyDiagnostics"

  return (
    <section
      className={cn(
        "not-prose max-w-full rounded-lg border px-3 py-3 text-card-foreground",
        severityClassName(error.severity),
      )}
      aria-live="polite"
    >
      <div className="flex gap-3">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", iconClassName(error.severity))}>
          <AlertTriangle className="size-4" />
        </span>
        <div className="grid min-w-0 flex-1 gap-2">
          <div className="grid gap-1">
            <div className="oo-text-label text-foreground">{title}</div>
            <div className="oo-text-control text-muted-foreground">{description}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isContentFiltered && onRetryFresh ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={freshRetrying}
                onClick={() => void handleRetryFresh()}
              >
                {freshRetrying ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                {t(error.primaryActionKey ?? "chatError.contentFiltered.primaryAction")}
              </Button>
            ) : null}
            {error.kind !== "payment_required" &&
            recoveryKind !== "fresh_task" &&
            error.primaryActionKey &&
            onRecover ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={freshRetrying}
                onClick={() => void handleRecover()}
              >
                {freshRetrying ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                {t(error.primaryActionKey)}
              </Button>
            ) : null}
            {error.diagnostics ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(diagnosticsCopied && "bg-background text-foreground")}
                onClick={handleCopyDiagnostics}
              >
                {diagnosticsCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                {diagnosticsCopied ? t("chat.copiedMessage") : t(diagnosticsActionKey)}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
