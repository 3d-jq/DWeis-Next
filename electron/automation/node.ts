import type { AutomationService, AutomationTask, AutomationTaskInput, AutomationRunRecord } from "./common.ts"
import type { AutomationStore } from "./store.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { randomUUID } from "node:crypto"
import { AutomationService as AutomationServiceName } from "./common.ts"
import { nextRunAtInTimezone } from "./schedule.ts"

export interface AutomationServiceDeps {
  store: AutomationStore
  /** 到点执行任务：创建新会话并让 agent 执行 prompt（结果留在新会话）；返回会话 id。 */
  runTask: (task: AutomationTask) => Promise<string | null>
}

/** 保留的历史记录条数上限。 */
const runHistoryLimit = 20

interface PendingTimer {
  timer: NodeJS.Timeout
  taskId: string
}

/**
 * 自动化定时任务服务：任务 CRUD + 自实现调度（setTimeout + unref，
 * 秒级精度，仿 agent-refresh-scheduler）。应用退出时调度自然失效。
 */
export class AutomationServiceImpl
  extends ConnectionService<AutomationService>
  implements IConnectionService<AutomationService>
{
  private readonly deps: AutomationServiceDeps
  private tasks: AutomationTask[] = []
  private pendingTimers = new Map<string, PendingTimer>()
  private loaded = false

  public constructor(deps: AutomationServiceDeps) {
    super(AutomationServiceName)
    this.deps = deps
  }

  /** 启动时加载任务并重建调度（main.ts 在服务注册后调用）。 */
  public async start(): Promise<void> {
    this.tasks = await this.deps.store.read()
    this.loaded = true
    // 一次性任务错过触发时刻（应用未运行）则自动停用，不再补偿执行。
    const now = Date.now()
    let expired = false
    this.tasks = this.tasks.map((task) => {
      if (task.enabled && task.onceAt !== undefined && task.onceAt <= now) {
        expired = true
        return { ...task, enabled: false }
      }
      return task
    })
    if (expired) {
      await this.deps.store.write(this.tasks)
    }
    this.rebuildSchedule()
  }

  public override dispose(): void {
    for (const { timer } of this.pendingTimers.values()) {
      clearTimeout(timer)
    }
    this.pendingTimers.clear()
    super.dispose()
  }

  public listTasks(): Promise<AutomationTask[]> {
    return Promise.resolve(this.tasks)
  }

  public async createTask(input: AutomationTaskInput): Promise<AutomationTask[]> {
    const task: AutomationTask = {
      ...normalizeTaskInput(input),
      id: randomUUID(),
      enabled: true,
    }
    this.tasks = [...this.tasks, task]
    await this.persistAndSchedule()
    return this.tasks
  }

  public async updateTask(id: string, input: AutomationTaskInput): Promise<AutomationTask[]> {
    const index = this.tasks.findIndex((task) => task.id === id)
    if (index < 0) {
      return this.tasks
    }
    const previous = this.tasks[index]
    this.tasks = [
      ...this.tasks.slice(0, index),
      { ...previous, ...normalizeTaskInput(input), id: previous.id },
      ...this.tasks.slice(index + 1),
    ]
    await this.persistAndSchedule()
    return this.tasks
  }

  public async deleteTask(id: string): Promise<AutomationTask[]> {
    this.tasks = this.tasks.filter((task) => task.id !== id)
    await this.persistAndSchedule()
    return this.tasks
  }

  public async runTaskNow(id: string): Promise<AutomationTask[]> {
    const task = this.tasks.find((entry) => entry.id === id)
    if (!task || task.lastRunStatus === "running") {
      return this.tasks
    }
    void this.fireTask(task)
    return this.tasks
  }

  private async persistAndSchedule(): Promise<void> {
    await this.deps.store.write(this.tasks)
    this.rebuildSchedule()
    void this.send("automationChanged", this.tasks).catch((error: unknown) => {
      console.warn("[dweis] automation broadcast failed:", error)
    })
  }

  private rebuildSchedule(): void {
    for (const { timer } of this.pendingTimers.values()) {
      clearTimeout(timer)
    }
    this.pendingTimers.clear()
    for (const task of this.tasks) {
      if (!task.enabled) continue
      this.scheduleTask(task)
    }
  }

  private scheduleTask(task: AutomationTask): void {
    if (task.onceAt !== undefined) {
      // 一次性任务：直接定时到指定时刻；已过期则不排（start 时已自动停用）。
      const delay = task.onceAt - Date.now()
      if (delay <= 0) {
        return
      }
      const timer = setTimeout(() => {
        this.pendingTimers.delete(task.id)
        void this.fireTask(task)
      }, delay)
      timer.unref()
      this.pendingTimers.set(task.id, { timer, taskId: task.id })
      return
    }
    const next = nextRunAtInTimezone(task.cron, new Date(), task.timezone)
    const delay = Math.max(1_000, next.getTime() - Date.now())
    const timer = setTimeout(() => {
      this.pendingTimers.delete(task.id)
      void this.fireTask(task)
    }, delay)
    timer.unref()
    this.pendingTimers.set(task.id, { timer, taskId: task.id })
  }

  private async fireTask(task: AutomationTask): Promise<void> {
    const now = Date.now()
    const running = { ...task, lastRunAt: now, lastRunStatus: "running" as const }
    const runningIndex = this.tasks.findIndex((entry) => entry.id === task.id)
    if (runningIndex >= 0) {
      this.tasks = [...this.tasks.slice(0, runningIndex), running, ...this.tasks.slice(runningIndex + 1)]
      // 广播 running 状态，让 UI（尤其手动运行）立即看到"运行中"。
      void this.send("automationChanged", this.tasks).catch((error: unknown) => {
        console.warn("[dweis] automation broadcast failed:", error)
      })
    }
    try {
      const sessionId = await this.deps.runTask(task)
      await this.recordRunResult(task.id, "success", sessionId ?? undefined)
    } catch (error) {
      console.warn("[dweis] automation task failed:", task.id, error)
      await this.recordRunResult(task.id, "error")
    }
    // 任务可能已被删除/停用；仍启用的循环任务排下一次，一次性任务自动停用。
    const current = this.tasks.find((entry) => entry.id === task.id)
    if (!current) {
      return
    }
    if (current.onceAt !== undefined) {
      await this.patchTask(current.id, { enabled: false })
      return
    }
    if (current.enabled) {
      this.scheduleTask(current)
    }
  }

  private async recordRunResult(id: string, status: "success" | "error", sessionId?: string): Promise<void> {
    const index = this.tasks.findIndex((task) => task.id === id)
    if (index < 0) return
    const current = this.tasks[index]
    const record: AutomationRunRecord = sessionId ? { at: Date.now(), sessionId, status } : { at: Date.now(), status }
    const runHistory = [record, ...(current.runHistory ?? [])].slice(0, runHistoryLimit)
    this.tasks = [
      ...this.tasks.slice(0, index),
      { ...current, lastRunAt: record.at, lastRunStatus: status, runHistory },
      ...this.tasks.slice(index + 1),
    ]
    await this.deps.store.write(this.tasks)
    void this.send("automationChanged", this.tasks).catch((error: unknown) => {
      console.warn("[dweis] automation broadcast failed:", error)
    })
  }

  /** 内部局部更新（如一次性任务执行完自动停用）：改字段 + 落库 + 重建调度 + 广播。 */
  private async patchTask(id: string, patch: Partial<Omit<AutomationTask, "id">>): Promise<void> {
    const index = this.tasks.findIndex((task) => task.id === id)
    if (index < 0) return
    const previous = this.tasks[index]
    this.tasks = [
      ...this.tasks.slice(0, index),
      { ...previous, ...patch, id: previous.id },
      ...this.tasks.slice(index + 1),
    ]
    await this.deps.store.write(this.tasks)
    this.rebuildSchedule()
    void this.send("automationChanged", this.tasks).catch((error: unknown) => {
      console.warn("[dweis] automation broadcast failed:", error)
    })
  }
}

/** onceAt 归一化：null/undefined 统一省略，避免脏字段落库。 */
function normalizeTaskInput(input: AutomationTaskInput): Omit<AutomationTask, "id"> {
  const { onceAt, ...rest } = input
  return onceAt != null ? { ...rest, onceAt } : rest
}
