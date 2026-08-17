/**
 * Edit 工具差异卡（对齐 dsh DiffBlock）：增删行着色 + 复制。
 * edit 工具输出格式未定（opencode apply_patch），按 shiki `diff` 语言高亮 fallback。
 * 状态行加 "added/removed" 计数。
 */
import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { TokenizedCode } from "@/components/ai-elements/code-block"
import { highlightCode } from "@/components/ai-elements/code-block"
import { Button } from "@/components/ui/button"
import { writeClipboardText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import type { TranslateFn } from "@/i18n/i18n"

const ICON_CLASS = "size-3.5 shrink-0"
const DEFAULT_MAX_LINES = 24

function isItalic(fontStyle: number | undefined): boolean {
  return fontStyle !== undefined && (fontStyle & 1) !== 0
}

function isBold(fontStyle: number | undefined): boolean {
  return fontStyle !== undefined && (fontStyle & 2) !== 0
}

function isUnderline(fontStyle: number | undefined): boolean {
  return fontStyle !== undefined && (fontStyle & 4) !== 0
}

function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added += 1
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed += 1
    }
  }
  return { added, removed }
}

export interface DiffCardProps {
  output: string
  t: TranslateFn
}

export function DiffCard({ output, t }: DiffCardProps) {
  const lines = output.split("\n")
  const limit = DEFAULT_MAX_LINES
  const truncated = lines.length > limit
  const visible = truncated ? [...lines.slice(0, limit - 1), ...lines.slice(-1)] : lines
  const counts = countDiffLines(output)

  // shiki diff 高亮
  const [tokenized, setTokenized] = useState<TokenizedCode | null>(null)
  useEffect(() => {
    if (lines.length === 0) {
      return
    }
    const result = highlightCode(output, "diff", (next) => {
      setTokenized(next)
    })
    if (result) {
      setTokenized(result)
    }
  }, [output, lines.length])

  // 复制
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) {
      return
    }
    const id = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(id)
  }, [copied])

  if (lines.length === 0) {
    return null
  }

  return (
    <section className="rounded-md border border-[var(--oo-divider)] bg-muted/30 p-2.5 space-y-1.5">
      {/* 状态行：增删计数 + 复制 */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono tabular-nums">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">+{counts.added}</span>
          <span className="mx-1 text-muted-foreground/50">/</span>
          <span className="font-medium text-rose-600 dark:text-rose-400">-{counts.removed}</span>
        </span>
        <span className="ml-auto" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          aria-label={copied ? t("chat.toolResultPreviewCopied") : t("chat.toolResultPreviewCopy")}
          onClick={() => {
            void writeClipboardText(output).then((ok) => {
              if (ok) {
                setCopied(true)
              }
            })
          }}
        >
          {copied ? <CheckIcon className={ICON_CLASS} aria-hidden="true" /> : <CopyIcon className={ICON_CLASS} aria-hidden="true" />}
        </Button>
      </div>
      {/* diff 内容：shiki diff 语法高亮（每行 token 颜色对应 +/-/上下文） */}
      <pre
        className={cn(
          "oo-text-micro max-h-72 overflow-auto rounded bg-background p-2 font-mono",
          tokenized ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {visible.map((line, index) => {
          const lineTokens = tokenized?.tokens[index]
          return (
            <span key={index} className="block whitespace-pre">
              {lineTokens && lineTokens.length > 0 ? (
                lineTokens.map((token, tokenIndex) => (
                  <span
                    key={tokenIndex}
                    style={{
                      color: token.color,
                      backgroundColor: token.bgColor,
                      fontStyle: isItalic(token.fontStyle) ? "italic" : undefined,
                      fontWeight: isBold(token.fontStyle) ? "bold" : undefined,
                      textDecoration: isUnderline(token.fontStyle) ? "underline" : undefined,
                    }}
                  >
                    {token.content || " "}
                  </span>
                ))
              ) : (
                <span>{line || " "}</span>
              )}
            </span>
          )
        })}
        {truncated ? (
          <span className="block bg-muted/50 py-0.5 text-center text-muted-foreground/60">
            … {t("chat.toolResultPreviewTruncated", { limit })}
          </span>
        ) : null}
      </pre>
    </section>
  )
}
