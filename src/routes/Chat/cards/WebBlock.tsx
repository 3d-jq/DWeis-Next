import type { TranslateFn } from "@/i18n/i18n"

import { ArrowUpRight } from "lucide-react"
/**
 * Web 来源/抓取卡（dweis_websearch / webfetch）：
 * websearch 输出 JSON：{ok, results:[{title,url,snippet}]} → 标题链接 + URL + 摘要
 * webfetch 输出：纯文本/HTML 预览 → 截断 pre fallback
 */
import { useMemo } from "react"
import { cn } from "@/lib/utils"

interface WebResult {
  title: string
  url: string
  snippet: string
}

function tryParseWebsearch(output: string): WebResult[] | null {
  try {
    const parsed = JSON.parse(output) as { ok?: boolean; results?: WebResult[] }
    if (!parsed || !Array.isArray(parsed.results)) {
      return null
    }
    return parsed.results.filter((item) => item && typeof item.url === "string")
  } catch {
    return null
  }
}

export interface WebCardProps {
  output: string
  t: TranslateFn
}

export function WebCard({ output, t }: WebCardProps) {
  const results = useMemo(() => tryParseWebsearch(output), [output])

  if (results && results.length > 0) {
    return (
      <section className="space-y-1.5 rounded-xl border border-[var(--oo-divider)] bg-muted/30 p-2.5 text-xs">
        <div className="px-1 pb-0.5 text-muted-foreground/60">
          {t("chat.toolAttachments", { count: results.length })}
        </div>
        {results.map((result, index) => (
          <a
            key={`${result.url}-${index}`}
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "group/web flex flex-col gap-0.5 rounded px-1.5 py-1 hover:bg-muted/50",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <span className="flex items-center gap-1 font-medium text-foreground">
              <span className="truncate">{result.title || result.url}</span>
              <ArrowUpRight
                className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/web:opacity-100"
                aria-hidden="true"
              />
            </span>
            <span className="truncate font-mono text-muted-foreground/60">{result.url}</span>
            {result.snippet ? <span className="line-clamp-2 text-muted-foreground/80">{result.snippet}</span> : null}
          </a>
        ))}
      </section>
    )
  }

  // fallback：截断 pre（webfetch 纯文本/HTML fallback）
  const truncated = output.length > 800
  return (
    <section className="rounded-xl border border-[var(--oo-divider)] bg-muted/30 p-2.5">
      <pre className="oo-text-micro max-h-72 overflow-auto rounded bg-background p-2 break-words whitespace-pre-wrap text-muted-foreground">
        {truncated ? `${output.slice(0, 800)}…` : output}
      </pre>
    </section>
  )
}
