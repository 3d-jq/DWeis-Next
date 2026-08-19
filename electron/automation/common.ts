import type { AutomationSchedule } from "./schedule.ts"
import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

export type AutomationTaskStatus = "success" | "error" | "running"

/** 单次执行的持久化记录（历史保留最近 N 条）。 */
export interface AutomationRunRecord {
  at: number
  status: "success" | "error"
}

export interface AutomationTask {
  id: string
  name: string
  /** 用户输入的自然语言触发规则原文。 */
  scheduleText: string
  /** 调度层：标准 5 段 cron 表达式（调度器按它计算下次触发）。 */
  cron: string
  /** 展示用结构化规则（由 cron 派生，读旧数据时自动补算）。 */
  schedule: AutomationSchedule
  /** 时区（IANA，如 "Asia/Shanghai"）；调度按任务时区解释 cron。 */
  timezone: string
  /** 到点后交给 AI 执行的任务指令。 */
  prompt: string
  enabled: boolean
  lastRunAt?: number
  lastRunStatus?: AutomationTaskStatus
  /** 执行历史（最近 N 条，含 running 期间的占位记录）。 */
  runHistory?: AutomationRunRecord[]
}

export interface AutomationTaskInput {
  name: string
  scheduleText: string
  cron: string
  schedule: AutomationSchedule
  timezone: string
  prompt: string
  enabled: boolean
}

/** AI 从用户一句话里解析出的任务草稿；本地兜底解析失败时为 null。 */
export interface ParsedTaskDraft {
  name: string
  scheduleText: string
  cron: string
  schedule: AutomationSchedule
  timezone: string
  prompt: string
}

export type AutomationService = typeof AutomationService
export const AutomationService = serviceName("automation-service") as ServiceName<{
  ServerEvents: {
    automationChanged: AutomationTask[]
  }
  ClientInvokes: {
    listTasks(): Promise<AutomationTask[]>
    /** 输入是一句自然语言（如"每天早上9点提醒我喝水"），AI 解析触发规则与指令。 */
    createTask(text: string): Promise<AutomationTask[]>
    updateTask(id: string, input: AutomationTaskInput): Promise<AutomationTask[]>
    deleteTask(id: string): Promise<AutomationTask[]>
    /** 立即手动运行一次（不影响原调度；正在运行中时拒绝）。 */
    runTaskNow(id: string): Promise<AutomationTask[]>
  }
}>
