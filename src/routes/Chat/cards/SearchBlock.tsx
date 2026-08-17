/**
 * 搜索/文件列表卡（grep / glob）：按文件分组匹配行（path:line:content）。
 * glob 输出为换行分隔的路径列表（可能含 "Found N matches" 头），无行号。
 */
import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { TranslateFn } from "@/i18n/i18n"

interface SearchHit {
  filePath: string
  line: number | null
  content: string
}

const GREP_LINE_RE = /^(.+?):(\d+):(.*)$/u

function parseSearch(output: string): { kind: "grep" | "list"; hits: SearchHit[] } {
  const lines = output.split("\n")
  const firstLine = lines[0] ?? ""
  if (firstLine.startsWith("Found ") || firstLine.startsWith("No matches")) {
    return { kind: "grep", hits: lines.slice(1).map((line) => parseGrepLine(line)).filter(Boolean) as SearchHit[] }
  }
  // ripgrep with files-with-matches
  if (lines.length > 0 && lines.every((line) => !line.includes(":"))) {
    return {
      kind: "list",
      hits: lines.filter((line) => line.trim().length > 0).map((filePath) => ({ filePath, line: null, content: "" })),
    }
  }
  // 通用：尝试每行 grep 格式
  const hits = lines
    .map((line) => parseGrepLine(line))
    .filter(Boolean) as SearchHit[]
  return { kind: hits.length > 0 ? "grep" : "list", hits }
}

function parseGrepLine(line: string): SearchHit | null {
  const match = GREP_LINE_RE.exec(line)
  if (!match) {
    return null
  }
  return { filePath: match[1] ?? "", line: Number(match[2]), content: match[3] ?? "" }
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/u)
  return parts[parts.length - 1] ?? path
}

export interface SearchCardProps {
  output: string
  t: TranslateFn
}

export function SearchCard({ output, t }: SearchCardProps) {
  const parsed = useMemo(() => parseSearch(output), [output])
  const groups = useMemo(() => {
    const map = new Map<string, SearchHit[]>()
    for (const hit of parsed.hits) {
      const list = map.get(hit.filePath) ?? []
      list.push(hit)
      map.set(hit.filePath, list)
    }
    return Array.from(map.entries())
  }, [parsed.hits])

  if (parsed.hits.length === 0) {
    return (
      <section className="rounded-md border border-[var(--oo-divider)] bg-muted/30 p-2.5 text-xs text-muted-foreground">
        {t("chat.toolNoMatches")}
      </section>
    )
  }

  if (parsed.kind === "list") {
    return (
      <section className="rounded-md border border-[var(--oo-divider)] bg-muted/30 p-2.5 space-y-0.5 text-xs">
        <div className="px-1 pb-1 text-muted-foreground/60">
          {t("chat.toolAttachments", { count: parsed.hits.length })}
        </div>
        {groups.map(([filePath]) => (
          <div key={filePath} className="rounded px-1 py-0.5 font-mono text-muted-foreground hover:bg-muted/40">
            <span className="select-none text-muted-foreground/50">·</span> {filePath}
          </div>
        ))}
      </section>
    )
  }

  return (
    <section className="rounded-md border border-[var(--oo-divider)] bg-muted/30 p-2.5 space-y-1.5 text-xs">
      {groups.map(([filePath, hits]) => (
        <div key={filePath} className="space-y-0.5">
          <div className="flex items-baseline gap-1.5 px-1 font-mono text-muted-foreground">
            <span className="font-medium">{fileName(filePath)}</span>
            <span className="text-muted-foreground/50">{filePath}</span>
            <span className="ml-auto tabular-nums text-muted-foreground/60">
              {hits.length} {hits.length === 1 ? t("chat.toolResultPreviewMatch") : t("chat.toolResultPreviewMatches")}
            </span>
          </div>
          {hits.map((hit, index) => (
            <div
              key={`${hit.filePath}-${hit.line}-${index}`}
              className={cn(
                "grid grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-2 rounded px-1 py-0.5 font-mono",
                "hover:bg-muted/40",
              )}
            >
              {hit.line !== null ? (
                <span className="w-10 select-none text-right tabular-nums text-muted-foreground/50">
                  {hit.line}
                </span>
              ) : (
                <span className="w-10" />
              )}
              <span className="select-none text-muted-foreground/50">:</span>
              <span className="truncate text-foreground/90">{hit.content || " "}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
