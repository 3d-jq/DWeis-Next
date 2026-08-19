import type { AutomationTask } from "../../../electron/automation/common.ts"

import { describe, expect, it } from "vitest"
import {
  automationDisplayStatus,
  automationNextRunAt,
  formatLastRun,
  formatRelativeNextRun,
  sortAutomationTasks,
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
