/**
 * Bash 终端输出卡（对齐 dsh TerminalBlock）：
 * 顶部状态行（运行中/退出码/信号 + 状态点）+ ANSI 彩色输出 + 复制原始输出。
 * 输出不软换行（表格/对齐保持），max-height 截断并保留头尾。
 * 颜色走 Tailwind 主题变量（dsh 原生用 16 色 raw，这里桥接到主题色以便深/浅模式一致）。
 */
import { CheckIcon, CopyIcon } from "lucide-react"
import { motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { writeClipboardText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import type { AnsiSpan } from "./ansi.ts"
import { ansiSpanClass, parseAnsi } from "./ansi.ts"
import type { TranslateFn } from "@/i18n/i18n"

const DEFAULT_MAX_LINES = 16

const ICON_CLASS = "size-3.5 shrink-0"

function StatusDot({ state }: { state: "running" | "done" | "failed" }) {
  const colorClass =
    state === "done" ? "text-emerald-500" : state === "failed" ? "text-rose-500" : "text-info"
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn(ICON_CLASS, colorClass)}
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5" />
    </svg>
  )
}

export interface TerminalCardProps {
  /** 原始命令字符串（用于状态行/复制）。 */
  command: string
  /** 原始输出文本（含 ANSI 控制序列）。 */
  output: string
  /** 是否仍在运行中。 */
  running: boolean
  /** 退出码/信号描述（settled 后由调用方解析 "exit code N" / "signal SIGxxx" 传入）。 */
  settledLabel: string | null
  /** 截断前显示的最大行数。 */
  maxLines?: number
  t: TranslateFn
}

function AnsiLine({ line }: { line: AnsiSpan[] }) {
  return (
    <span className="block whitespace-pre font-mono">
      {line.length === 0 ? (
        <span></span>
      ) : (
        line.map((span, index) => (
          <span key={index} className={ansiSpanClass(span)}>
            {span.text}
          </span>
        ))
      )}
    </span>
  )
}

export function TerminalCard({ command, output, running, settledLabel, maxLines, t }: TerminalCardProps) {
  const lines = parseAnsi(output)
  const limit = maxLines ?? DEFAULT_MAX_LINES
  const truncated = lines.length > limit
  const visible = truncated ? [...lines.slice(0, limit - 1), ...lines.slice(-1)] : lines
  const state: "running" | "done" | "failed" =
    running ? "running" : settledLabel ? "failed" : "done"

  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    void writeClipboardText(output).then((ok) => {
      if (ok) {
        setCopied(true)
      }
    })
  }, [output])
  useEffect(() => {
    if (!copied) {
      return
    }
    const id = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(id)
  }, [copied])

  return (
    <section
      className="rounded-xl border border-[var(--oo-divider)] bg-muted/30 p-2.5 space-y-1.5"
      data-tool-state={state}
    >
      {/* 状态行：状态点 + 简短 cwd + 命令 + settled 标签 + 复制 */}
      <div className="flex items-center gap-2 text-xs">
        <StatusDot state={state} />
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
          <span className="select-none">$</span> {command.trim().split("\n").pop() ?? ""}
        </span>
        {settledLabel ? (
          <span className="shrink-0 font-mono text-muted-foreground">{settledLabel}</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          aria-label={copied ? t("chat.toolResultPreviewCopied") : t("chat.toolResultPreviewCopy")}
          onClick={handleCopy}
        >
          {copied ? <CheckIcon className="size-3.5" aria-hidden="true" /> : <CopyIcon className="size-3.5" aria-hidden="true" />}
        </Button>
      </div>
      {/* ANSI 输出：不软换行（保持表格/对齐），max-height 截断后保留头尾 */}
      <motion.pre
        initial={false}
        className="oo-text-micro max-h-72 overflow-auto rounded bg-background p-2 whitespace-pre font-mono text-muted-foreground"
      >
        {visible.length === 0 ? (
          <span className="text-muted-foreground/60">{t("chat.toolNoOutput")}</span>
        ) : (
          visible.map((line, index) => <AnsiLine key={index} line={line} />)
        )}
        {truncated ? (
          <span className="block bg-muted/50 py-0.5 text-center text-muted-foreground/60">
            …{" "}
            {t("chat.toolResultPreviewTruncated", { limit })}
          </span>
        ) : null}
      </motion.pre>
    </section>
  )
}
