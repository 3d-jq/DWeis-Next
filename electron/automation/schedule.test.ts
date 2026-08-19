import { describe, expect, it } from "vitest"
import {
  cronToSchedule,
  describeAutomationSchedule,
  nextRunAt,
  nextRunAtFromCron,
  nextRunAtInTimezone,
  normalizeAutomationSchedule,
  normalizeCron,
  parseAutomationSchedule,
  scheduleToCron,
} from "./schedule.ts"

describe("parseAutomationSchedule", () => {
  it("parses daily schedules", () => {
    expect(parseAutomationSchedule("每天早上9点")).toEqual({ kind: "daily", time: "09:00" })
    expect(parseAutomationSchedule("每天 09:00")).toEqual({ kind: "daily", time: "09:00" })
    expect(parseAutomationSchedule("每天9:30")).toEqual({ kind: "daily", time: "09:30" })
    expect(parseAutomationSchedule("每天下午3点半")).toEqual({ kind: "daily", time: "15:30" })
    expect(parseAutomationSchedule("每天晚上10点")).toEqual({ kind: "daily", time: "22:00" })
  })

  it("parses weekly schedules with Chinese weekdays", () => {
    // weekdays 约定：0=周一 … 6=周日
    expect(parseAutomationSchedule("每周一上午10点")).toEqual({ kind: "weekly", weekdays: [0], time: "10:00" })
    expect(parseAutomationSchedule("每周一、周三 10:00")).toEqual({ kind: "weekly", weekdays: [0, 2], time: "10:00" })
    expect(parseAutomationSchedule("每周日 08:00")).toEqual({ kind: "weekly", weekdays: [6], time: "08:00" })
  })

  it("parses weekday (Mon-Fri) schedules", () => {
    expect(parseAutomationSchedule("工作日9点")).toEqual({
      kind: "weekly",
      weekdays: [0, 1, 2, 3, 4],
      time: "09:00",
    })
  })

  it("parses intervals", () => {
    expect(parseAutomationSchedule("每30分钟")).toEqual({ kind: "interval", minutes: 30 })
    expect(parseAutomationSchedule("每2小时")).toEqual({ kind: "interval", minutes: 120 })
    expect(parseAutomationSchedule("每隔5分钟")).toEqual({ kind: "interval", minutes: 5 })
  })

  it("returns null for invalid input", () => {
    expect(parseAutomationSchedule("")).toBeNull()
    expect(parseAutomationSchedule("随机内容")).toBeNull()
    expect(parseAutomationSchedule("每天")).toBeNull()
    expect(parseAutomationSchedule("每30秒")).toBeNull()
  })
})

describe("scheduleToCron", () => {
  it("converts structured schedules to standard cron", () => {
    expect(scheduleToCron({ kind: "daily", time: "09:00" })).toBe("0 9 * * *")
    expect(scheduleToCron({ kind: "weekly", weekdays: [0], time: "10:00" })).toBe("0 10 * * 1")
    expect(scheduleToCron({ kind: "weekly", weekdays: [0, 4], time: "10:00" })).toBe("0 10 * * 1,5")
    expect(scheduleToCron({ kind: "interval", minutes: 30 })).toBe("*/30 * * * *")
  })
})

describe("cronToSchedule", () => {
  it("derives display schedules from cron", () => {
    expect(cronToSchedule("0 9 * * *")).toEqual({ kind: "daily", time: "09:00" })
    expect(cronToSchedule("0 10 * * 1,5")).toEqual({ kind: "weekly", weekdays: [0, 4], time: "10:00" })
    expect(cronToSchedule("0 9 * * 1-5")).toEqual({ kind: "weekly", weekdays: [0, 1, 2, 3, 4], time: "09:00" })
    expect(cronToSchedule("*/30 * * * *")).toEqual({ kind: "interval", minutes: 30 })
  })
})

describe("nextRunAtFromCron", () => {
  it("computes the next daily run", () => {
    const from = new Date("2026-08-02T08:00:00")
    expect(nextRunAtFromCron("0 9 * * *", from)?.getTime()).toBe(new Date("2026-08-02T09:00:00").getTime())
    const after = new Date("2026-08-02T10:00:00")
    expect(nextRunAtFromCron("0 9 * * *", after)?.getTime()).toBe(new Date("2026-08-03T09:00:00").getTime())
  })

  it("computes the next weekly run (cron dow 1 = Monday)", () => {
    // 2026-08-02 是周日；cron "0 10 * * 1"（周一）的下一次是 08-03。
    const from = new Date("2026-08-02T08:00:00")
    expect(nextRunAtFromCron("0 10 * * 1", from)?.getTime()).toBe(new Date("2026-08-03T10:00:00").getTime())
  })

  it("computes interval runs aligned to cron steps", () => {
    const from = new Date("2026-08-02T08:05:00")
    expect(nextRunAtFromCron("*/30 * * * *", from)?.getTime()).toBe(new Date("2026-08-02T08:30:00").getTime())
  })

  it("supports ranges and lists", () => {
    const from = new Date("2026-08-02T08:00:00") // 周日
    expect(nextRunAtFromCron("0 9 * * 1-5", from)?.getTime()).toBe(new Date("2026-08-03T09:00:00").getTime())
    expect(nextRunAtFromCron("30 9 * * 0,6", from)?.getTime()).toBe(new Date("2026-08-02T09:30:00").getTime())
  })

  it("returns null for malformed cron", () => {
    expect(nextRunAtFromCron("not a cron", new Date())).toBeNull()
    expect(nextRunAtFromCron("60 9 * * *", new Date())).toBeNull()
    expect(nextRunAtFromCron("0 24 * * *", new Date())).toBeNull()
  })
})

describe("normalizeCron", () => {
  it("accepts valid 5-field expressions", () => {
    expect(normalizeCron("0 9 * * *")).toBe("0 9 * * *")
    expect(normalizeCron("*/30 9-17 * * 1-5")).toBe("*/30 9-17 * * 1-5")
    expect(normalizeCron("0 10 * * 7")).toBe("0 10 * * 7")
  })

  it("rejects invalid expressions", () => {
    expect(normalizeCron(null)).toBeNull()
    expect(normalizeCron("0 9 * *")).toBeNull()
    expect(normalizeCron("0 9 * * * *")).toBeNull()
    expect(normalizeCron("0 99 * * *")).toBeNull()
    expect(normalizeCron("x 9 * * *")).toBeNull()
  })
})

describe("nextRunAt", () => {
  it("computes the next daily run via cron", () => {
    const schedule = { kind: "daily" as const, time: "09:00" }
    const from = new Date("2026-08-02T08:00:00")
    expect(nextRunAt(schedule, from).getTime()).toBe(new Date("2026-08-02T09:00:00").getTime())
    const after = new Date("2026-08-02T10:00:00")
    expect(nextRunAt(schedule, after).getTime()).toBe(new Date("2026-08-03T09:00:00").getTime())
  })

  it("computes the next weekly run", () => {
    // 2026-08-02 是周日；每周一（weekdays [0]）10:00 的下一次是 08-03。
    const schedule = { kind: "weekly" as const, weekdays: [0], time: "10:00" }
    const from = new Date("2026-08-02T08:00:00")
    expect(nextRunAt(schedule, from).getTime()).toBe(new Date("2026-08-03T10:00:00").getTime())
  })
})

describe("nextRunAtInTimezone", () => {
  it("interprets cron in the task timezone", () => {
    // UTC+8 的每天 9 点 = UTC 的 1 点；from 之后的下一次是 08-02T01:00:00Z。
    const from = new Date("2026-08-02T00:00:00Z")
    const next = nextRunAtInTimezone("0 9 * * *", from, "Asia/Shanghai")
    expect(next.getTime()).toBe(new Date("2026-08-02T01:00:00Z").getTime())
  })
})

describe("normalizeAutomationSchedule", () => {
  it("accepts valid schedule objects", () => {
    expect(normalizeAutomationSchedule({ kind: "daily", time: "9:00" })).toEqual({ kind: "daily", time: "09:00" })
    expect(normalizeAutomationSchedule({ kind: "weekly", weekdays: [5, 1], time: "10:00" })).toEqual({
      kind: "weekly",
      weekdays: [1, 5],
      time: "10:00",
    })
    expect(normalizeAutomationSchedule({ kind: "interval", minutes: 30 })).toEqual({ kind: "interval", minutes: 30 })
    expect(normalizeAutomationSchedule({ kind: "monthly", day: 15, time: "09:30" })).toEqual({
      kind: "monthly",
      day: 15,
      time: "09:30",
    })
    expect(normalizeAutomationSchedule({ kind: "hourly", minute: 30 })).toEqual({ kind: "hourly", minute: 30 })
  })

  it("rejects malformed schedule objects", () => {
    expect(normalizeAutomationSchedule(null)).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "daily", time: "25:00" })).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "weekly", weekdays: [], time: "10:00" })).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "weekly", weekdays: [8], time: "10:00" })).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "interval", minutes: 0 })).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "interval", minutes: 99999 })).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "hourly" })).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "hourly", minute: 60 })).toBeNull()
    expect(normalizeAutomationSchedule({ kind: "monthly", day: 32, time: "09:00" })).toBeNull()
  })
})

describe("describeAutomationSchedule", () => {
  it("describes schedules in Chinese", () => {
    expect(describeAutomationSchedule({ kind: "daily", time: "09:00" })).toBe("每天 09:00")
    expect(describeAutomationSchedule({ kind: "weekly", weekdays: [0, 4], time: "10:00" })).toBe("周一、周五 10:00")
    expect(describeAutomationSchedule({ kind: "interval", minutes: 120 })).toBe("每2小时")
    expect(describeAutomationSchedule({ kind: "monthly", day: 1, time: "09:00" })).toBe("每月 1 日 09:00")
    expect(describeAutomationSchedule({ kind: "hourly", minute: 30 })).toBe("每小时 30 分")
  })
})
