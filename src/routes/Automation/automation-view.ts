/** 自动化页面视图纯函数：表单模型、任务构建、排序、相对时间、状态展示、模板。 */

import type { AutomationTask, AutomationTaskInput } from "../../../electron/automation/common.ts"
import type { AutomationSchedule } from "../../../electron/automation/schedule.ts"
import type { MessageKey, TranslateFn } from "@/i18n/i18n"

import {
  cronToSchedule,
  defaultTimezone,
  describeAutomationSchedule,
  nextRunAtInTimezone,
  normalizeCron,
  scheduleToCron,
} from "../../../electron/automation/schedule.ts"

// ── 下次执行与展示 ──

/** 下次执行时刻（禁用任务为 null；一次性任务过期后也为 null）。 */
export function automationNextRunAt(task: AutomationTask, now: Date = new Date()): Date | null {
  if (!task.enabled) return null
  if (task.onceAt !== undefined) {
    return task.onceAt > now.getTime() ? new Date(task.onceAt) : null
  }
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
  return formatMonthDayTime(next)
}

/** "MM-DD HH:mm"（卡片与预览共用）。 */
export function formatMonthDayTime(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${month}-${day} ${hour}:${minute}`
}

/** 任务调度的人类可读描述（一次性任务显示具体时刻）。 */
export function describeAutomationTask(task: Pick<AutomationTask, "onceAt" | "schedule">): string {
  if (task.onceAt !== undefined) {
    return `单次 ${formatDateTime(task.onceAt)}`
  }
  return describeAutomationSchedule(task.schedule)
}

function formatDateTime(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day} ${hour}:${minute}`
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
  return t("automation.lastRunAt", { time: formatMonthDayTime(new Date(at)) })
}

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

// ── 结构化表单模型（对齐 LobsterAI TaskForm）──

export type AutomationPlanType = "once" | "hourly" | "daily" | "weekly" | "monthly" | "cron"

/** cron 可视化构建器：5 个字段各自独立选择。 */
export interface CronBuilder {
  minute: string
  hour: string
  dom: string
  month: string
  dow: string
}

export interface TaskFormValue {
  name: string
  prompt: string
  planType: AutomationPlanType
  /** once：日期（yyyy-MM-dd）+ 时间（HH:mm）。 */
  date: string
  time: string
  /** hourly：每小时第几分执行。 */
  hourMinute: number
  /** weekly：选中的星期（0=周一…6=周日）。 */
  weekdays: number[]
  /** monthly：每月几号。 */
  monthDay: number
  /** cron：原始表达式 + 构建器双模式。 */
  cronExpr: string
  cronMode: "builder" | "raw"
  cronBuilder: CronBuilder
}

export function cronBuilderToExpr(builder: CronBuilder): string {
  return `${builder.minute} ${builder.hour} ${builder.dom} ${builder.month} ${builder.dow}`
}

/** 尽力把 5 段表达式拆回构建器字段；字段数不对返回 null。 */
export function exprToCronBuilder(expr: string): CronBuilder | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minute, hour, dom, month, dow] = parts
  return { minute, hour, dom, month, dow }
}

function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/** 新建任务的默认表单：每天 09:00。 */
export function emptyTaskFormValue(now: Date = new Date()): TaskFormValue {
  return {
    name: "",
    prompt: "",
    planType: "daily",
    date: toDateString(now),
    time: "09:00",
    hourMinute: 0,
    weekdays: [0, 1, 2, 3, 4],
    monthDay: 1,
    cronExpr: "",
    cronMode: "builder",
    cronBuilder: { minute: "0", hour: "9", dom: "*", month: "*", dow: "*" },
  }
}

/** 编辑回填：任务 → 表单值（一次性/每小时/每天/每周/每月/原始 cron 六路映射）。 */
export function taskToFormValue(task: AutomationTask, now: Date = new Date()): TaskFormValue {
  const base = { ...emptyTaskFormValue(now), name: task.name, prompt: task.prompt }
  if (task.onceAt !== undefined) {
    const date = new Date(task.onceAt)
    return { ...base, planType: "once", date: toDateString(date), time: toTimeString(date) }
  }
  switch (task.schedule.kind) {
    case "hourly":
      return { ...base, planType: "hourly", hourMinute: task.schedule.minute }
    case "daily":
      return { ...base, planType: "daily", time: task.schedule.time }
    case "weekly":
      return { ...base, planType: "weekly", time: task.schedule.time, weekdays: task.schedule.weekdays }
    case "monthly":
      return { ...base, planType: "monthly", monthDay: task.schedule.day, time: task.schedule.time }
    default:
      return { ...base, planType: "cron", cronMode: "raw", cronExpr: task.cron }
  }
}

/** once 表单值 → 触发时刻；日期/时间不合法返回 null。 */
export function parseOnceAt(value: TaskFormValue): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.date.trim())
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(value.time.trim())
  if (!dateMatch || !timeMatch) return null
  const date = new Date(
    Number.parseInt(dateMatch[1], 10),
    Number.parseInt(dateMatch[2], 10) - 1,
    Number.parseInt(dateMatch[3], 10),
    Number.parseInt(timeMatch[1], 10),
    Number.parseInt(timeMatch[2], 10),
  )
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

/** 提交前校验：返回错误文案 key 列表（空数组 = 可提交）。 */
export function validateTaskForm(value: TaskFormValue, now: Date = new Date()): string[] {
  const errors: string[] = []
  if (!value.name.trim()) errors.push("automation.form.nameRequired")
  if (!value.prompt.trim()) errors.push("automation.form.promptRequired")
  if (value.planType === "once") {
    const onceAt = parseOnceAt(value)
    if (onceAt === null || onceAt <= now.getTime()) errors.push("automation.form.onceFuture")
  }
  if (value.planType === "weekly" && value.weekdays.length === 0) errors.push("automation.form.weekdayRequired")
  if (value.planType === "cron") {
    const expr = value.cronMode === "builder" ? cronBuilderToExpr(value.cronBuilder) : value.cronExpr.trim()
    if (!normalizeCron(expr)) errors.push("automation.form.cronInvalid")
  }
  return errors
}

/** 表单值 → 萃取结构化调度（once 的 schedule 仅作展示近似）。 */
export function formValueToSchedule(value: TaskFormValue): AutomationSchedule {
  switch (value.planType) {
    case "hourly":
      return { kind: "hourly", minute: value.hourMinute }
    case "daily":
      return { kind: "daily", time: value.time }
    case "weekly":
      return { kind: "weekly", weekdays: [...new Set(value.weekdays)].sort((a, b) => a - b), time: value.time }
    case "monthly":
      return { kind: "monthly", day: value.monthDay, time: value.time }
    case "once": {
      const onceAt = parseOnceAt(value) ?? Date.now() + 60_000
      const date = new Date(onceAt)
      return { kind: "monthly", day: date.getDate(), time: toTimeString(date) }
    }
    default: {
      const expr = value.cronMode === "builder" ? cronBuilderToExpr(value.cronBuilder) : value.cronExpr.trim()
      const normalized = normalizeCron(expr)
      return cronToSchedule(normalized ?? "0 9 * * *")
    }
  }
}

/** 表单值 → 任务输入（调度描述与 cron 一并派生）。 */
export function buildTaskInput(
  value: TaskFormValue,
  now: Date = new Date(),
  timezone: string = defaultTimezone(),
): AutomationTaskInput {
  const schedule = formValueToSchedule(value)
  const onceAt = value.planType === "once" ? (parseOnceAt(value) ?? now.getTime() + 60_000) : null
  const cron =
    value.planType === "cron"
      ? (normalizeCron(value.cronMode === "builder" ? cronBuilderToExpr(value.cronBuilder) : value.cronExpr.trim()) ??
        "0 9 * * *")
      : scheduleToCron(schedule)
  return {
    name: value.name.trim(),
    prompt: value.prompt.trim(),
    enabled: true,
    ...(onceAt !== null ? { onceAt } : {}),
    cron,
    schedule,
    timezone,
    scheduleText: describeAutomationTask({ onceAt: onceAt ?? undefined, schedule }),
  }
}

/** cron 快捷预设（表单自定义模式下的 chips）。 */
export const CRON_QUICK_PICKS: { labelKey: MessageKey; expr: string }[] = [
  { labelKey: "automation.cronQuickDaily", expr: "0 9 * * *" },
  { labelKey: "automation.cronQuickWeekday", expr: "0 9 * * 1-5" },
  { labelKey: "automation.cronQuickHourly", expr: "0 * * * *" },
  { labelKey: "automation.cronQuick15min", expr: "*/15 * * * *" },
]

// ── 空状态模板：一键预填结构化表单 ──

export interface AutomationTemplate {
  title: string
  name: string
  prompt: string
  plan:
    | { type: "daily"; time: string }
    | { type: "weekly"; weekdays: number[]; time: string }
    | { type: "interval"; minutes: number }
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    title: "每日待办简报",
    name: "每日待办简报",
    prompt: "整理今天的待办事项并生成一份简报",
    plan: { type: "daily", time: "09:00" },
  },
  {
    title: "工作日日报",
    name: "工作日日报",
    prompt: "总结今天的工作进展，生成一份日报",
    plan: { type: "weekly", weekdays: [0, 1, 2, 3, 4], time: "18:00" },
  },
  {
    title: "每周复盘",
    name: "每周复盘",
    prompt: "回顾本周完成的事项，生成本周复盘报告",
    plan: { type: "weekly", weekdays: [4], time: "17:00" },
  },
  {
    title: "资讯速递",
    name: "资讯速递",
    prompt: "汇总行业最新资讯并生成摘要",
    plan: { type: "interval", minutes: 120 },
  },
]

/** 模板 → 预填表单值（interval 走 cron 原始表达式）。 */
export function templateToFormValue(template: AutomationTemplate, now: Date = new Date()): TaskFormValue {
  const base = { ...emptyTaskFormValue(now), name: template.name, prompt: template.prompt }
  if (template.plan.type === "daily") {
    return { ...base, planType: "daily", time: template.plan.time }
  }
  if (template.plan.type === "weekly") {
    return { ...base, planType: "weekly", weekdays: template.plan.weekdays, time: template.plan.time }
  }
  return { ...base, planType: "cron", cronMode: "raw", cronExpr: `*/${template.plan.minutes} * * * *` }
}
