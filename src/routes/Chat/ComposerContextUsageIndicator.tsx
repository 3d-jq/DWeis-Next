import type { ContextUsageBreakdown, ContextUsageInfo } from "./context-usage.ts"

import * as React from "react"
import { createPortal } from "react-dom"
import { formatTokenCount } from "./context-usage.ts"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

function contextUsageTitle(usage: ContextUsageInfo, t: ReturnType<typeof useT>): string {
  const used = formatTokenCount(usage.usedTokens)
  const base =
    usage.limitTokens !== undefined
      ? usage.limitKind === "compaction"
        ? t("chat.contextUsageCompaction", {
            limit: formatTokenCount(usage.limitTokens),
            percent: String(usage.percent ?? 0),
            used,
          })
        : t("chat.contextUsage", {
            limit: formatTokenCount(usage.limitTokens),
            percent: String(usage.percent ?? 0),
            used,
          })
      : t("chat.contextUsageUnknownLimit", { used })
  if (usage.cacheHitRate === undefined) {
    return base
  }
  return `${base} · ${t("chat.contextUsageCacheHit", { percent: String(usage.cacheHitRate) })}`
}

function contextUsageTone(percent: number | undefined): string {
  if (percent === undefined) {
    return "text-muted-foreground"
  }
  if (percent >= 85) {
    return "text-destructive"
  }
  if (percent >= 70) {
    return "text-[var(--oo-warning-foreground)]"
  }
  return "text-muted-foreground"
}

function contextPanelTokenCount(value: number): string {
  return formatTokenCount(value).toLowerCase()
}

function contextUsagePanelTokens(usage: ContextUsageInfo, t: ReturnType<typeof useT>): string {
  const used = contextPanelTokenCount(usage.usedTokens)
  if (usage.limitTokens !== undefined) {
    if (usage.limitKind === "compaction") {
      return t("chat.contextUsagePanelTokensWithThreshold", {
        limit: contextPanelTokenCount(usage.limitTokens),
        used,
      })
    }
    return t("chat.contextUsagePanelTokens", { limit: contextPanelTokenCount(usage.limitTokens), used })
  }
  return t("chat.contextUsagePanelTokensUnknown", { used })
}

function contextUsagePanelPercent(usage: ContextUsageInfo, t: ReturnType<typeof useT>): string | null {
  if (usage.percent === undefined) {
    return null
  }
  if (usage.limitKind === "compaction") {
    if (usage.compactionThresholdTokens !== undefined && usage.usedTokens >= usage.compactionThresholdTokens) {
      return t("chat.contextUsagePanelOverThreshold")
    }
    return t("chat.contextUsagePanelThresholdPercent", {
      percent: String(usage.percent),
    })
  }
  const remaining = Math.max(0, 100 - usage.percent)
  return t("chat.contextUsagePanelPercent", {
    percent: String(usage.percent),
    remaining: String(remaining),
  })
}

function contextUsagePanelWindow(usage: ContextUsageInfo, t: ReturnType<typeof useT>): string | null {
  if (usage.inputLimitTokens) {
    return t("chat.contextUsagePanelInputLimit", { limit: contextPanelTokenCount(usage.inputLimitTokens) })
  }
  if (usage.contextWindowTokens) {
    return t("chat.contextUsagePanelWindow", { limit: contextPanelTokenCount(usage.contextWindowTokens) })
  }
  return null
}

function contextPanelPlacement(rect: DOMRect): React.CSSProperties {
  const margin = 12
  const width = 320
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), window.innerWidth - width - margin)
  const bottom = Math.max(margin, window.innerHeight - rect.top + 8)
  return { left, bottom, width }
}

function contextBarTone(percent: number | undefined): string {
  if (percent === undefined) {
    return "bg-info"
  }
  if (percent >= 85) {
    return "bg-destructive"
  }
  if (percent >= 70) {
    return "bg-warning"
  }
  return "bg-info"
}

export function ComposerContextUsageIndicator({ usage }: { usage: ContextUsageInfo | null }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({})
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const panelId = React.useId()

  const updatePanelPlacement = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }
    setPanelStyle(contextPanelPlacement(trigger.getBoundingClientRect()))
  }, [])

  React.useLayoutEffect(() => {
    if (open) {
      updatePanelPlacement()
    }
  }, [open, updatePanelPlacement])

  React.useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
    const handleReposition = (): void => updatePanelPlacement()
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleReposition)
    window.addEventListener("scroll", handleReposition, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleReposition)
      window.removeEventListener("scroll", handleReposition, true)
    }
  }, [open, updatePanelPlacement])

  if (!usage) {
    return null
  }
  const title = contextUsageTitle(usage, t)
  const panelPercent = contextUsagePanelPercent(usage, t)
  const panelWindow = contextUsagePanelWindow(usage, t)
  const progress = Math.min(100, Math.max(0, usage.percent ?? 0))
  const radius = 8
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress / 100)
  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          style={panelStyle}
          className="fixed z-50 rounded-xl border bg-popover/95 px-4 py-3.5 text-popover-foreground shadow-xl backdrop-blur"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="oo-text-caption-compact font-medium text-muted-foreground">
              {t("chat.contextUsagePanelTitle")}
            </span>
            {panelWindow ? (
              <span className="oo-text-micro shrink-0 text-muted-foreground/70">{panelWindow}</span>
            ) : null}
          </div>
          <div className="mt-2.5 flex items-end gap-2">
            <span className="text-3xl leading-none font-semibold text-foreground tabular-nums">
              {usage.percent !== undefined ? `${usage.percent}%` : "—"}
            </span>
            <span className="oo-text-caption mb-0.5 leading-none text-muted-foreground">
              {contextUsagePanelTokens(usage, t)}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", contextBarTone(usage.percent))}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {panelPercent ? (
              <span className="oo-text-caption-compact font-medium text-muted-foreground">{panelPercent}</span>
            ) : (
              <span />
            )}
            {usage.cacheHitRate !== undefined ? (
              <span className="oo-text-caption-compact text-muted-foreground">
                {t("chat.contextUsageCacheHit", { percent: String(usage.cacheHitRate) })}
              </span>
            ) : null}
          </div>
          {usage.breakdown ? <ContextUsageBreakdownView breakdown={usage.breakdown} /> : null}
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={title}
        aria-describedby={open ? panelId : undefined}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={title}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full outline-none",
          "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
          contextUsageTone(usage.percent),
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden="true">
          <circle cx="12" cy="12" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.4" />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
          />
        </svg>
      </button>
      {panel}
    </>
  )
}

/** 上下文占用明细：按消息/工具/技能/系统提示/记忆/其他拆分展示（估算值）。 */
function ContextUsageBreakdownView({ breakdown }: { breakdown: ContextUsageBreakdown }) {
  const t = useT()
  const rows: Array<{ key: string; label: string; value: number }> = [
    { key: "messages", label: t("chat.contextUsageMessages"), value: breakdown.messages },
    { key: "tools", label: t("chat.contextUsageTools"), value: breakdown.tools },
    { key: "skills", label: t("chat.contextUsageSkills"), value: breakdown.skills },
    { key: "systemPrompt", label: t("chat.contextUsageSystemPrompt"), value: breakdown.systemPrompt },
    { key: "memory", label: t("chat.contextUsageMemory"), value: breakdown.memory },
    { key: "other", label: t("chat.contextUsageOther"), value: breakdown.other },
  ]
  const total = Math.max(1, breakdown.total)
  return (
    <div className="mt-2 border-t border-[var(--oo-divider)] pt-2 text-left">
      <div className="oo-text-caption-compact font-medium text-muted-foreground">
        {t("chat.contextUsageBreakdownTitle")}
      </div>
      <div className="mt-1 grid gap-1">
        {rows.map((row) => {
          const share = Math.round((row.value / total) * 100)
          return (
            <div key={row.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
              <span className="oo-text-caption w-20 truncate text-muted-foreground">{row.label}</span>
              <div className="h-1 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${Math.max(2, Math.min(100, share))}%` }}
                />
              </div>
              <span className="oo-text-micro w-16 text-right text-muted-foreground tabular-nums">
                {formatTokenCount(row.value)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="oo-text-micro mt-1.5 text-muted-foreground/70">{t("chat.contextUsageEstimated")}</div>
    </div>
  )
}
