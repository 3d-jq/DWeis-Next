/**
 * Read 工具输出卡（对齐 dsh ReadBlock）：
 * 顶部 banner（路径 + 显示 N/M 行 + 复制）+ 行号 gutter + shiki 语法高亮。
 * read 输出格式：`<path>...</path>\n<type>file</type>\n<content>1: line\n2: line\n...</content>`
 */
import { CheckIcon, CopyIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { CodeBlockProps, TokenizedCode } from "@/components/ai-elements/code-block"
import { highlightCode } from "@/components/ai-elements/code-block"
import { Button } from "@/components/ui/button"
import { writeClipboardText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import type { TranslateFn } from "@/i18n/i18n"

const ICON_CLASS = "size-3.5 shrink-0"

const CONTENT_RE = /<content>([\s\S]*?)<\/content>/u
const PATH_RE = /<path>([\s\S]*?)<\/path>/u
const LINE_RE = /^(\d+): ?(.*)$/u

function languageForPath(filePath: string): CodeBlockProps["language"] {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? ""
  if (!extension) {
    return undefined
  }
  const map: Record<string, CodeBlockProps["language"]> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
    toml: "yaml",
    py: "python",
    rb: "rust",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cs: "csharp",
    cpp: "c",
    rsx: "rust",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    xml_diff: "diff",
  }
  return map[extension]
}

interface ReadLine {
  number: number
  text: string
}

function parseReadOutput(output: string): { filePath: string | null; lines: ReadLine[] } {
  const pathMatch = PATH_RE.exec(output)
  const contentMatch = CONTENT_RE.exec(output)
  const filePath = pathMatch?.[1]?.trim() ?? null
  if (!contentMatch) {
    return { filePath, lines: [] }
  }
  const content = contentMatch[1] ?? ""
  const lines: ReadLine[] = []
  for (const line of content.split("\n")) {
    const match = LINE_RE.exec(line)
    if (match) {
      lines.push({ number: Number(match[1]), text: match[2] ?? "" })
    } else if (lines.length > 0 || line.length > 0) {
      // 保留不能匹配行号的内容行（兜底）
      lines.push({ number: lines.length + 1, text: line })
    }
  }
  return { filePath, lines }
}

function isItalic(fontStyle: number | undefined): boolean {
  return fontStyle !== undefined && (fontStyle & 1) !== 0
}

function isBold(fontStyle: number | undefined): boolean {
  return fontStyle !== undefined && (fontStyle & 2) !== 0
}

function isUnderline(fontStyle: number | undefined): boolean {
  return fontStyle !== undefined && (fontStyle & 4) !== 0
}

const DEFAULT_MAX_LINES = 16

export interface ReadCardProps {
  output: string
  t: TranslateFn
}

export function ReadCard({ output, t }: ReadCardProps) {
  const parsed = parseReadOutput(output)
  const language = parsed.filePath ? languageForPath(parsed.filePath) : undefined
  const lines = parsed.lines
  const totalLines = lines.length
  const limit = DEFAULT_MAX_LINES
  const truncated = totalLines > limit
  const visible = truncated ? [...lines.slice(0, limit - 1), ...lines.slice(-1)] : lines
  const fullText = lines.map((line) => line.text).join("\n")

  // shiki 异步高亮
  const [tokenized, setTokenized] = useState<TokenizedCode | null>(null)
  useEffect(() => {
    if (!language || visible.length === 0) {
      setTokenized(null)
      return
    }
    setTokenized(null)
    const result = highlightCode(fullText, language, (next) => {
      setTokenized(next)
    })
    if (result) {
      setTokenized(result)
    }
  }, [fullText, language])

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
    <section className="rounded-xl border border-[var(--oo-divider)] bg-muted/30 p-2.5 space-y-1.5">
      {/* banner：路径 + N/M + 复制 */}
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
          {parsed.filePath ?? t("chat.toolReadGeneric")}
        </span>
        <span className="shrink-0 font-mono text-muted-foreground/60">
          {t("chat.toolReadBanner", { shown: visible.length, total: totalLines })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0"
          aria-label={copied ? t("chat.toolResultPreviewCopied") : t("chat.toolResultPreviewCopy")}
          onClick={() => {
            void writeClipboardText(fullText).then((ok) => {
              if (ok) {
                setCopied(true)
              }
            })
          }}
        >
          {copied ? <CheckIcon className={ICON_CLASS} aria-hidden="true" /> : <CopyIcon className={ICON_CLASS} aria-hidden="true" />}
        </Button>
      </div>
      {/* 文件内容：行号 gutter + shiki 高亮 */}
      <pre
        className={cn(
          "oo-text-micro max-h-72 overflow-auto rounded bg-background p-2 font-mono",
          tokenized ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {visible.map((line, index) => {
          const lineTokens = tokenized?.tokens[index]
          return (
            <span key={line.number} className="block whitespace-pre">
              <span className="inline-block w-10 select-none pr-3 text-right text-muted-foreground/50 tabular-nums">
                {line.number}
              </span>
              <span>
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
                  <span>{line.text || " "}</span>
                )}
              </span>
            </span>
          )
        })}
        {truncated ? (
          <span className="block bg-muted/50 py-0.5 text-center text-muted-foreground/60">
            … {t("chat.toolReadBanner", { shown: limit, total: totalLines })}
          </span>
        ) : null}
      </pre>
    </section>
  )
}
