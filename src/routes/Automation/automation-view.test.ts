import type { AutomationTask } from "../../../electron/automation/common.ts"

import { describe, expect, it } from "vitest"
import {
  AUTOMATION_TEMPLATES,
  automationDisplayStatus,
  automationNextRunAt,
  automationRunHistory,
  buildTaskInput,
  describeAutomationTask,
  emptyTaskFormValue,
  filterAutomationTasks,
  formatLastRun,
  formatRelativeNextRun,
  sortAutomationTasks,
  taskToFormValue,
  templateToFormValue,
  validateTaskForm,
} from "./automation-view.ts"

function task(overrides: Partial<AutomationTask>): AutomationTask {
  return {
    id: "id",
    name: "任务",
    scheduleText: "每天早上9点",
    cron: "0 9 * * *",
    schedule: { kind: "daily", time: "09:00" },
    timezone: "Asia/Shanghai",
    prompt: "整理待办",
    enabled: true,
    ...overrides,
  }
}

describe("automationNextRunAt", () => {
  it("computes the next run for an enabled daily task", () => {
    const now = new Date("2026-08-19T08:00:00")
    expect(automationNextRunAt(task({}), now)?.getTime()).toBe(new Date("2026-08-19T09:00:00").getTime())
  })

  it("rolls to the next day when the time already passed", () => {
    const now = new Date("2026-08-19T10:00:00")
    expect(automationNextRunAt(task({}), now)?.getDate()).toBe(20)
  })

  it("returns null for a disabled task", () => {
    expect(automationNextRunAt(task({ enabled: false }), new Date())).toBeNull()
  })

  it("uses onceAt directly for one-shot tasks and hides expired ones", () => {
    const now = new Date("2026-08-19T08:00:00")
    const future = task({ onceAt: new Date("2026-08-19T10:30:00").getTime() })
    expect(automationNextRunAt(future, now)?.getTime()).toBe(new Date("2026-08-19T10:30:00").getTime())
    const past = task({ onceAt: new Date("2026-08-19T07:00:00").getTime() })
    expect(automationNextRunAt(past, now)).toBeNull()
  })
})

describe("describeAutomationTask", () => {
  it("describes recurring tasks via their schedule", () => {
    expect(describeAutomationTask({ schedule: { kind: "daily", time: "09:00" } })).toBe("每天 09:00")
    expect(describeAutomationTask({ schedule: { kind: "monthly", day: 1, time: "09:00" } })).toBe("每月 1 日 09:00")
  })

  it("describes one-shot tasks with the concrete time", () => {
    expect(
      describeAutomationTask({
        onceAt: new Date("2026-08-20T09:05:00").getTime(),
        schedule: { kind: "daily", time: "09:00" },
      }),
    ).toBe("单次 2026-08-20 09:05")
  })
})

describe("formatRelativeNextRun", () => {
  const now = new Date("2026-08-19T10:00:00")

  it("formats minutes and hours relatively", () => {
    expect(formatRelativeNextRun(new Date("2026-08-19T10:00:20"), now)).toBe("<1 分钟")
    expect(formatRelativeNextRun(new Date("2026-08-19T10:00:30"), now)).toBe("1 分钟后")
    expect(formatRelativeNextRun(new Date("2026-08-19T10:25:00"), now)).toBe("25 分钟后")
    expect(formatRelativeNextRun(new Date("2026-08-19T15:00:00"), now)).toBe("5 小时后")
  })

  it("switches to an absolute label beyond 24 hours", () => {
    expect(formatRelativeNextRun(new Date("2026-08-21T09:30:00"), now)).toBe("08-21 09:30")
  })

  it("returns a dash when the next run is in the past", () => {
    expect(formatRelativeNextRun(new Date("2026-08-19T09:00:00"), now)).toBe("—")
  })
})

describe("automationDisplayStatus", () => {
  it("follows lastRunStatus when present", () => {
    expect(automationDisplayStatus(task({ lastRunStatus: "running" }))).toBe("running")
    expect(automationDisplayStatus(task({ lastRunStatus: "success" }))).toBe("success")
    expect(automationDisplayStatus(task({ lastRunStatus: "error" }))).toBe("error")
  })

  it("falls back to idle before the first run", () => {
    expect(automationDisplayStatus(task({}))).toBe("idle")
  })
})

describe("sortAutomationTasks", () => {
  it("puts running first, then enabled by soonest next run, then disabled", () => {
    const now = new Date("2026-08-19T08:00:00")
    const sorted = sortAutomationTasks(
      [
        task({ id: "disabled", name: "停用", enabled: false }),
        task({ id: "evening", name: "晚上", cron: "0 20 * * *", schedule: { kind: "daily", time: "20:00" } }),
        task({ id: "running", name: "运行中", lastRunStatus: "running" }),
        task({ id: "noon", name: "中午", cron: "0 12 * * *", schedule: { kind: "daily", time: "12:00" } }),
      ],
      now,
    )
    expect(sorted.map((entry) => entry.id)).toEqual(["running", "noon", "evening", "disabled"])
  })
})

describe("filterAutomationTasks", () => {
  const tasks = [
    task({ id: "a", name: "日报", prompt: "总结今天的工作", scheduleText: "工作日晚上6点" }),
    task({ id: "b", name: "资讯", prompt: "汇总行业最新资讯", scheduleText: "每2小时" }),
  ]

  it("matches name, prompt, and schedule text case-insensitively", () => {
    expect(filterAutomationTasks(tasks, "日报").map((entry) => entry.id)).toEqual(["a"])
    expect(filterAutomationTasks(tasks, "资讯").map((entry) => entry.id)).toEqual(["b"])
    expect(filterAutomationTasks(tasks, "工作日").map((entry) => entry.id)).toEqual(["a"])
    expect(filterAutomationTasks(tasks, "")).toEqual(tasks)
  })

  it("returns nothing when no task matches", () => {
    expect(filterAutomationTasks(tasks, "不存在")).toEqual([])
  })
})

describe("automationRunHistory", () => {
  it("aggregates run records across tasks in reverse chronological order", () => {
    const entries = automationRunHistory([
      task({
        id: "a",
        name: "日报",
        runHistory: [
          { at: 300, sessionId: "s3", status: "success" },
          { at: 100, status: "error" },
        ],
      }),
      task({ id: "b", name: "资讯", runHistory: [{ at: 200, sessionId: "s2", status: "success" }] }),
    ])
    expect(entries).toEqual([
      { at: 300, sessionId: "s3", status: "success", taskName: "日报" },
      { at: 200, sessionId: "s2", status: "success", taskName: "资讯" },
      { at: 100, sessionId: undefined, status: "error", taskName: "日报" },
    ])
  })

  it("returns empty for tasks without history", () => {
    expect(automationRunHistory([task({})])).toEqual([])
  })
})

describe("formatLastRun", () => {
  it("formats the last run timestamp", () => {
    expect(formatLastRun(new Date("2026-08-19T09:05:00").getTime(), (key, vars) => `${key}:${vars?.time}`)).toBe(
      "automation.lastRunAt:08-19 09:05",
    )
  })

  it("returns undefined before the first run", () => {
    expect(formatLastRun(undefined, (key) => key)).toBeUndefined()
  })
})

describe("task form", () => {
  const now = new Date("2026-08-19T08:00:00")

  it("builds inputs for every plan type", () => {
    const base = { ...emptyTaskFormValue(now), name: "日报", prompt: "总结今天" }

    const daily = buildTaskInput({ ...base, planType: "daily", time: "09:30" })
    expect(daily).toMatchObject({
      cron: "30 9 * * *",
      schedule: { kind: "daily", time: "09:30" },
      scheduleText: "每天 09:30",
    })
    expect("onceAt" in daily).toBe(false)
    expect(buildTaskInput({ ...base, planType: "hourly", hourMinute: 30 })).toMatchObject({
      cron: "30 * * * *",
      schedule: { kind: "hourly", minute: 30 },
    })
    expect(buildTaskInput({ ...base, planType: "weekly", weekdays: [0, 4], time: "10:00" })).toMatchObject({
      cron: "0 10 * * 1,5",
      schedule: { kind: "weekly", weekdays: [0, 4], time: "10:00" },
    })
    expect(buildTaskInput({ ...base, planType: "monthly", monthDay: 1, time: "09:00" })).toMatchObject({
      cron: "0 9 1 * *",
      schedule: { kind: "monthly", day: 1, time: "09:00" },
    })
    expect(buildTaskInput({ ...base, planType: "cron", cronMode: "raw", cronExpr: "*/15 * * * *" })).toMatchObject({
      cron: "*/15 * * * *",
      schedule: { kind: "interval", minutes: 15 },
    })
    const once = buildTaskInput({ ...base, planType: "once", date: "2026-08-20", time: "09:05" }, now)
    expect(once.onceAt).toBe(new Date("2026-08-20T09:05:00").getTime())
    expect(once.scheduleText).toBe("单次 2026-08-20 09:05")
  })

  it("validates required fields and plan-specific rules", () => {
    const base = emptyTaskFormValue(now)
    expect(validateTaskForm(base, now)).toEqual(["automation.form.nameRequired", "automation.form.promptRequired"])
    const named = { ...base, name: "日报", prompt: "总结今天" }
    expect(validateTaskForm(named, now)).toEqual([])
    expect(validateTaskForm({ ...named, planType: "weekly", weekdays: [] }, now)).toEqual([
      "automation.form.weekdayRequired",
    ])
    expect(validateTaskForm({ ...named, planType: "cron", cronMode: "raw", cronExpr: "bad" }, now)).toEqual([
      "automation.form.cronInvalid",
    ])
    expect(validateTaskForm({ ...named, planType: "once", date: "2026-08-01", time: "09:00" }, now)).toEqual([
      "automation.form.onceFuture",
    ])
  })

  it("round-trips tasks back into form values", () => {
    expect(taskToFormValue(task({}), now)).toMatchObject({ planType: "daily", time: "09:00" })
    expect(taskToFormValue(task({ onceAt: new Date("2026-08-20T09:05:00").getTime() }), now)).toMatchObject({
      planType: "once",
      date: "2026-08-20",
      time: "09:05",
    })
    expect(
      taskToFormValue(task({ cron: "*/30 * * * *", schedule: { kind: "interval", minutes: 30 } }), now),
    ).toMatchObject({ planType: "cron", cronMode: "raw", cronExpr: "*/30 * * * *" })
  })

  it("prefills the form from templates", () => {
    const [daily, , , interval] = AUTOMATION_TEMPLATES
    expect(templateToFormValue(daily, now)).toMatchObject({ planType: "daily", time: "09:00", name: daily.name })
    expect(templateToFormValue(interval, now)).toMatchObject({
      planType: "cron",
      cronMode: "raw",
      cronExpr: "*/120 * * * *",
    })
  })
})
