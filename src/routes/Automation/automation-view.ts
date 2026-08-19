/** 自动化页面视图纯函数：排序、相对时间、状态展示、创建模板。 */

import type { AutomationTask } from "../../../electron/automation/common.ts"
import type { TranslateFn } from "@/i18n/i18n"

import { nextRunAtInTimezone } from "../../../electron/automation/schedule.ts"

/** 下次执行时刻（禁用任务为 null）。 */
export function automationNextRunAt(task: AutomationTask, now: Date = new Date()): Date | null {
  if (!task.enabled) return null
  return nextRunAtInTimezone(task.cron, now, task.timezone)
}

/** 相对时间短标签：1 小时内 → "N 分钟后"，24 小时内 → "N 小时后"，更远 → "M月D日 HH:mm"。 */
export function formatRelativeNextRun(next: Date, now: Date = new Date()): string {
  const deltaMs = next.getTime() - now.getTime()
  if (deltaMs < 0) return "—"
  const minutes = Math.round(deltaMs / 60_000)
  if (minutes < 1) return "<1 分钟"
  if (minutes < 60) return `${minutes} 分钟后`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时后`
  const month = String(next.getMonth() + 1).padStart(2, "0")
  const day = String(next.getDate()).padStart(2, "0")
  const hour = String(next.getHours()).padStart(2, "0")
  const minute = String(next.getMinutes()).padStart(2, "0")
  return `${month}-${day} ${hour}:${minute}`
}

/**
 * 列表排序：运行中 → 已启用（按下次执行时间升序）→ 已停用（按名称）。
 * 运行中置顶让用户第一眼看到正在执行的任务。
 */
export function sortAutomationTasks(tasks: AutomationTask[], now: Date = new Date()): AutomationTask[] {
  return [...tasks].sort((left, right) => {
    const leftRunning = left.lastRunStatus === "running"
    const rightRunning = right.lastRunStatus === "running"
    if (leftRunning !== rightRunning) return leftRunning ? -1 : 1
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    if (left.enabled && right.enabled) {
      const diff = (automationNextRunAt(left, now)?.getTime() ?? 0) - (automationNextRunAt(right, now)?.getTime() ?? 0)
      if (diff !== 0) return diff
    }
    return left.name.localeCompare(right.name)
  })
}

export type AutomationDisplayStatus = "running" | "success" | "error" | "idle"

/** 卡片状态 chip：从未运行过显示 idle（首次等待），否则跟随 lastRunStatus。 */
export function automationDisplayStatus(task: AutomationTask): AutomationDisplayStatus {
  if (task.lastRunStatus === "running") return "running"
  if (task.lastRunStatus === "success") return "success"
  if (task.lastRunStatus === "error") return "error"
  return "idle"
}

export function automationStatusLabel(status: AutomationDisplayStatus, t: TranslateFn): string {
  if (status === "running") return t("automation.statusRunning")
  if (status === "success") return t("automation.statusSuccess")
  if (status === "error") return t("automation.statusError")
  return t("automation.statusIdle")
}

/** 上次执行绝对时间（chip 的 hover title）。 */
export function formatLastRun(at: number | undefined, t: TranslateFn): string | undefined {
  if (!at) return undefined
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return t("automation.lastRunAt", { time: `${month}-${day} ${hour}:${minute}` })
}

/** 空状态创建模板：点击填入输入框，配合"一句话创建"交互。 */
export const AUTOMATION_TEMPLATES: { text: string; title: string }[] = [
  { text: "每天早上9点整理今日待办并生成简报", title: "每日待办简报" },
  { text: "工作日晚上6点总结今天的工作进展", title: "工作日日报" },
  { text: "每周五下午5点生成本周复盘报告", title: "每周复盘" },
  { text: "每2小时汇总一次行业最新资讯", title: "资讯速递" },
]

/** 按关键词过滤任务（名称/指令/调度原文，忽略大小写）。 */
export function filterAutomationTasks(tasks: AutomationTask[], query: string): AutomationTask[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return tasks
  return tasks.filter((task) => [task.name, task.prompt, task.scheduleText].join("\n").toLowerCase().includes(keyword))
}

/** 全局执行历史条目：跨任务聚合，按时间降序。 */
export interface AutomationHistoryEntry {
  at: number
  sessionId?: string
  status: "success" | "error"
  taskName: string
}

/** 聚合所有任务的执行历史（跳过 running 占位前的记录天然只有终态）。 */
export function automationRunHistory(tasks: AutomationTask[]): AutomationHistoryEntry[] {
  return tasks
    .flatMap((task) =>
      (task.runHistory ?? []).map((record) => ({
        at: record.at,
        sessionId: record.sessionId,
        status: record.status,
        taskName: task.name,
      })),
    )
    .sort((left, right) => right.at - left.at)
}
