import { readFile } from "node:fs/promises"
import path from "node:path"

import { atomicWriteText } from "../atomic-file.ts"
import { logStoreReadFailure } from "../store-diagnostics.ts"
import type { AutomationTask } from "./common.ts"
import { defaultTimezone, normalizeAutomationSchedule, scheduleToCron } from "./schedule.ts"

function isAutomationTask(value: unknown): value is AutomationTask {
  if (!value || typeof value !== "object") return false
  const task = value as Record<string, unknown>
  return (
    typeof task.id === "string" &&
    typeof task.name === "string" &&
    typeof task.scheduleText === "string" &&
    typeof task.prompt === "string" &&
    typeof task.enabled === "boolean" &&
    typeof task.schedule === "object" &&
    task.schedule !== null
  )
}

/** 旧数据迁移：cron / timezone / runHistory 缺失时补默认值（cron 从 schedule 推导）。 */
function normalizeTask(task: AutomationTask): AutomationTask {
  const schedule = normalizeAutomationSchedule(task.schedule) ?? { kind: "daily", time: "09:00" }
  return {
    ...task,
    schedule,
    cron: task.cron?.trim() ? task.cron : scheduleToCron(schedule),
    timezone: task.timezone?.trim() ? task.timezone : defaultTimezone(),
    runHistory: Array.isArray(task.runHistory) ? task.runHistory : [],
  }
}

/** 自动化任务持久化到 userData/automation-tasks.json。 */
export class AutomationStore {
  private readonly file: string

  public constructor(dir: string) {
    this.file = path.join(dir, "automation-tasks.json")
  }

  public async read(): Promise<AutomationTask[]> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf-8")) as { tasks?: unknown }
      return Array.isArray(parsed.tasks) ? parsed.tasks.filter(isAutomationTask).map(normalizeTask) : []
    } catch (error) {
      logStoreReadFailure("automation tasks", this.file, error)
      return []
    }
  }

  public async write(tasks: AutomationTask[]): Promise<void> {
    await atomicWriteText(this.file, JSON.stringify({ tasks }, null, 2), { mode: 0o600 })
  }
}
