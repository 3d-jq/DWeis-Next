import type { ActivityDayStat } from "../../../electron/stats/common.ts"

import * as React from "react"
import { SettingsSection } from "./settings-section.tsx"
import { useUsageStats } from "@/hooks/useUsageStats"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

/** 设置 → 使用统计：活跃热力图（近 90 天）+ 各模型 token 用量。 */
export function UsageStatsSettings() {
  const t = useT()
  const { activity, loading, tokens } = useUsageStats()

  return (
    <SettingsSection title={t("settings.usageTitle")}>
      <div className="grid gap-5 px-4 pb-4">
        <div className="grid gap-2">
          <div className="oo-text-caption-compact font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t("settings.usageActivity")}
          </div>
          {loading || !activity ? (
            <p className="oo-text-caption text-muted-foreground">{t("settings.usageEmpty")}</p>
          ) : (
            <ActivityHeatmap days={activity.days} />
          )}
        </div>
        <div className="grid gap-2">
          <div className="oo-text-caption-compact font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t("settings.usageTokens")}
          </div>
          {loading || !tokens ? (
            <p className="oo-text-caption text-muted-foreground">{t("settings.usageEmpty")}</p>
          ) : tokens.byModel.length === 0 ? (
            <p className="oo-text-caption text-muted-foreground">{t("settings.usageNoData")}</p>
          ) : (
            <TokenStatsTable
              byModel={tokens.byModel}
              total={{
                cacheReadTokens: tokens.total.cacheReadTokens,
                cost: tokens.total.cost,
                inputTokens: tokens.total.inputTokens,
                outputTokens: tokens.total.outputTokens,
                sessions: tokens.total.sessions,
                totalTokens:
                  tokens.total.inputTokens +
                  tokens.total.outputTokens +
                  tokens.total.reasoningTokens +
                  tokens.total.cacheReadTokens +
                  tokens.total.cacheWriteTokens,
              }}
            />
          )}
        </div>
      </div>
    </SettingsSection>
  )
}

/** 活跃热力图：列 = 周，行 = 周一..周日；颜色深浅按当天消息数。无月份/星期标签与总数行
 * （用户要求精简），单元格按容器宽度自适应（正方形填满可用宽度，不固定尺寸不溢出）。 */
function ActivityHeatmap({ days }: { days: ActivityDayStat[] }) {
  const t = useT()
  const gridRef = React.useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = React.useState(12)
  const gap = 2

  const byDate = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const day of days) {
      map.set(day.date, day.count)
    }
    return map
  }, [days])

  const weeks = React.useMemo(() => buildWeekGrid(byDate), [byDate])
  // 非零活跃值升序排列，用于分位数分桶（1 条消息落在最浅档，而不是相对比例顶到最深）。
  const sortedActive = React.useMemo(
    () =>
      days
        .map((day) => day.count)
        .filter((count) => count > 0)
        .sort((a, b) => a - b),
    [days],
  )

  // 按容器宽度反推单元格尺寸（保持正方形）：监听外层包裹（宽度随窗口缩放），
  // 而不是内层网格——内层网格 52 列有最小固有宽度，窗口缩小时不会自己变窄。
  React.useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) {
      return
    }
    const update = () => {
      setCellSize(Math.max(2, Math.floor((el.clientWidth - (weeks.length - 1) * gap) / weeks.length)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [weeks.length])

  return (
    <div ref={gridRef} className="grid gap-3">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, ${cellSize}px)` }}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid gap-[2px]" style={{ gridTemplateRows: `repeat(7, ${cellSize}px)` }}>
            {week.map((cell) =>
              cell ? (
                <div
                  key={cell.date}
                  title={`${cell.date}: ${cell.count} ${t("settings.usageMessages")}`}
                  className={cn(
                    "rounded-[3px] transition-colors hover:ring-1 hover:ring-foreground/40",
                    heatmapCellClass(heatmapLevel(cell.count, sortedActive)),
                  )}
                />
              ) : (
                <div key={`empty-${weekIndex}`} className="rounded-[3px] bg-muted/40" />
              ),
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{t("settings.usageLess")}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div key={level} className={cn("size-[10px] rounded-[2px]", heatmapCellClass(level))} />
        ))}
        <span>{t("settings.usageMore")}</span>
      </div>
    </div>
  )
}

/** 从今天往前推 N 周，生成 GitHub 风格周网格（每天一个格子，含占位）。 */
function buildWeekGrid(byDate: Map<string, number>): Array<Array<{ count: number; date: string } | null>> {
  const weeks: Array<Array<{ count: number; date: string } | null>> = []
  const today = new Date()
  // 当前周从周一开始
  const weekStart = new Date(today)
  weekStart.setHours(0, 0, 0, 0)
  const dayOfWeek = (today.getDay() + 6) % 7 // 0=周一
  weekStart.setDate(today.getDate() - dayOfWeek)

  for (let weekOffset = 0; weekOffset < 52; weekOffset += 1) {
    const weekStartDate = new Date(weekStart)
    weekStartDate.setDate(weekStart.getDate() - weekOffset * 7)
    const week: Array<{ count: number; date: string } | null> = []
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(weekStartDate)
      date.setDate(weekStartDate.getDate() + day)
      const key = formatDateKey(date)
      const count = byDate.get(key) ?? 0
      week.push({ count, date: key })
    }
    weeks.push(week)
  }
  return weeks.reverse()
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * 活跃度分位数分桶：非零值排序后按位置分 5 档（0 最浅 … 4 最深）。
 * 只有 1 条消息时落在最浅档；均匀活跃时整体偏浅，避免"问一句就全黑"。
 */
function heatmapLevel(count: number, sortedActive: number[]): number {
  if (count <= 0) {
    return -1
  }
  if (sortedActive.length <= 1) {
    return 0
  }
  const index = sortedActive.indexOf(count)
  const percentile = index / (sortedActive.length - 1)
  return Math.min(4, Math.floor(percentile * 5))
}

function heatmapCellClass(level: number): string {
  if (level < 0) {
    return "bg-muted/50"
  }
  return ["bg-primary/25", "bg-primary/45", "bg-primary/65", "bg-primary/85", "bg-primary"][level] ?? "bg-primary"
}

function formatTokens(value: number): string {
  // 直接用完整数字（千分位），不用 K/M 缩写。
  return Math.round(value).toLocaleString("en-US")
}

function TokenStatsTable({
  byModel,
  total,
}: {
  byModel: Array<{
    cacheReadTokens: number
    cacheWriteTokens: number
    cost: number
    inputTokens: number
    model: string
    outputTokens: number
    reasoningTokens: number
    sessions: number
  }>
  total: {
    cacheReadTokens: number
    cost: number
    inputTokens: number
    outputTokens: number
    sessions: number
    totalTokens: number
  }
}) {
  const t = useT()
  // 统一口径：行内总计 = 底部总计 = 输入 + 输出 + 推理 + 缓存读取 + 缓存写入（全部 token 流量）。
  const rows = byModel.map((row) => ({
    ...row,
    totalTokens: row.inputTokens + row.outputTokens + row.reasoningTokens + row.cacheReadTokens + row.cacheWriteTokens,
  }))
  const grandTotal = Math.max(
    1,
    rows.reduce((sum, row) => sum + row.totalTokens, 0),
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--oo-divider)] bg-muted/5">
      <table className="oo-text-caption w-full border-collapse text-left">
        <thead>
          <tr className="oo-text-micro bg-muted/30 font-mono font-bold tracking-[0.08em] text-muted-foreground uppercase">
            <th className="border-b border-[var(--oo-divider)] px-3 py-2 font-medium">{t("settings.usageModel")}</th>
            <th className="border-b border-[var(--oo-divider)] px-3 py-2 text-right font-medium">
              {t("settings.usageSessions")}
            </th>
            <th className="border-b border-[var(--oo-divider)] px-3 py-2 text-right font-medium">
              {t("settings.usageInput")}
            </th>
            <th className="border-b border-[var(--oo-divider)] px-3 py-2 text-right font-medium">
              {t("settings.usageOutput")}
            </th>
            <th className="border-b border-[var(--oo-divider)] px-3 py-2 text-right font-medium">
              {t("settings.usageCacheRead")}
            </th>
            <th className="border-b border-[var(--oo-divider)] px-3 py-2 text-right font-medium">
              {t("settings.usageTotal")}
            </th>
            <th className="border-b border-[var(--oo-divider)] px-3 py-2 text-right font-medium">
              {t("settings.usageCost")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const share = Math.round((row.totalTokens / grandTotal) * 100)
            return (
              <tr key={row.model} className="transition-colors hover:bg-muted/20">
                <td className="max-w-48 border-b border-[var(--oo-divider)] px-3 py-2">
                  <div className="truncate font-mono text-[0.8125rem] font-medium text-foreground" title={row.model}>
                    {row.model}
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max(2, share)}%` }}
                      title={`${share}%`}
                    />
                  </div>
                </td>
                <td className="border-b border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
                  {row.sessions}
                </td>
                <td className="border-b border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
                  {formatTokens(row.inputTokens)}
                </td>
                <td className="border-b border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
                  {formatTokens(row.outputTokens)}
                </td>
                <td className="border-b border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
                  {formatTokens(row.cacheReadTokens)}
                </td>
                <td className="border-b border-[var(--oo-divider)] px-3 py-2 text-right font-medium tabular-nums">
                  {formatTokens(row.totalTokens)}
                </td>
                <td className="border-b border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
                  {formatCost(row.cost)}
                </td>
              </tr>
            )
          })}
          <tr className="bg-muted/15 font-medium">
            <td className="border-t-2 border-[var(--oo-divider)] px-3 py-2 text-foreground">
              {t("settings.usageTotal")}
            </td>
            <td className="border-t-2 border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
              {total.sessions}
            </td>
            <td className="border-t-2 border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
              {formatTokens(total.inputTokens)}
            </td>
            <td className="border-t-2 border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
              {formatTokens(total.outputTokens)}
            </td>
            <td className="border-t-2 border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
              {formatTokens(total.cacheReadTokens)}
            </td>
            <td className="border-t-2 border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
              {formatTokens(total.totalTokens)}
            </td>
            <td className="border-t-2 border-[var(--oo-divider)] px-3 py-2 text-right tabular-nums">
              {formatCost(total.cost)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** 汇率常量（USD→CNY，展示用近似值；央行中间价 2026-08 ≈ 6.79，取 6.8）。 */
const USD_TO_CNY_RATE = 6.8

/** 费用格式化：opencode 记账为美元，展示转换为人民币，按大小自适应小数位。 */
function formatCost(usd: number): string {
  const value = usd * USD_TO_CNY_RATE
  if (value <= 0) {
    return "¥0"
  }
  if (value >= 100) {
    return `¥${value.toFixed(0)}`
  }
  if (value >= 1) {
    return `¥${value.toFixed(2)}`
  }
  return `¥${value.toFixed(4)}`
}
