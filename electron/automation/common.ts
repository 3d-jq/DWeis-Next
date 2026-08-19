import type { AutomationSchedule } from "./schedule.ts"
import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

export type AutomationTaskStatus = "success" | "error" | "running"

/** 单次执行的持久化记录（历史保留最近 N 条）。 */
export interface AutomationRunRecord {
  at: number
  status: "success" | "error"
  /** 执行产生的会话 id（历史记录可跳转查看结果）；agent 未就绪等失败场景可能缺失。 */
  sessionId?: string
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
  /**
   * 一次性任务：执行时刻（绝对 ms）。设置后调度器只在该时刻触发一次，
   * 执行完成（或启动时已过期）自动停用；cron 字段仅作展示近似。
   */
  onceAt?: number
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
  /** 一次性任务执行时刻；常规循环任务为 null/undefined。 */
  onceAt?: number | null
}

export type AutomationService = typeof AutomationService
export const AutomationService = serviceName("automation-service") as ServiceName<{
  ServerEvents: {
    automationChanged: AutomationTask[]
  }
  ClientInvokes: {
    listTasks(): Promise<AutomationTask[]>
    /** 结构化创建：表单字段直接落库（名称/调度规则/指令），无 AI 参与。 */
    createTask(input: AutomationTaskInput): Promise<AutomationTask[]>
    updateTask(id: string, input: AutomationTaskInput): Promise<AutomationTask[]>
    deleteTask(id: string): Promise<AutomationTask[]>
    /** 立即手动运行一次（不影响原调度；正在运行中时拒绝）。 */
    runTaskNow(id: string): Promise<AutomationTask[]>
  }
}>
