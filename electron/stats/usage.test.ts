import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { UsageServiceImpl } from "./node.ts"

const dirs: string[] = []
function tempDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "dweis-usage-"))
  dirs.push(dir)
  return path.join(dir, "opencode.db")
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** 造一个与 opencode 同构的最小 db（session/message 表 + 示例数据）。 */
function seedDatabase(dbPath: string): void {
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      model TEXT,
      cost REAL DEFAULT 0,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      tokens_reasoning INTEGER DEFAULT 0,
      tokens_cache_read INTEGER DEFAULT 0,
      tokens_cache_write INTEGER DEFAULT 0,
      time_created INTEGER NOT NULL
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL
    );
  `)
  const now = Date.now()
  const insertSession = db.prepare(
    `INSERT INTO session (id, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  insertSession.run("s1", JSON.stringify({ id: "deepseek-v4-flash", providerID: "p" }), 0.01, 1000, 500, 200, 300, 100, now - 2 * 24 * 3600 * 1000)
  insertSession.run("s2", JSON.stringify({ id: "deepseek-v4-flash", providerID: "p" }), 0.02, 2000, 800, 0, 0, 0, now - 24 * 3600 * 1000)
  insertSession.run("s3", JSON.stringify({ id: "other-model", providerID: "p" }), 0.005, 500, 100, 0, 0, 0, now - 3 * 24 * 3600 * 1000)
  insertSession.run("s4", "", 0, 0, 0, 0, 0, 0, now) // 无模型名的会话不计入统计

  const insertMessage = db.prepare("INSERT INTO message (id, session_id, time_created) VALUES (?, ?, ?)")
  // 今天 9 点 3 条 + 10 点 2 条；91 天前 1 条（窗口外）
  const today9 = new Date()
  today9.setHours(9, 0, 0, 0)
  const today10 = new Date()
  today10.setHours(10, 0, 0, 0)
  for (let i = 0; i < 3; i += 1) {
    insertMessage.run(`m-${i}`, "s1", today9.getTime() + i)
  }
  for (let i = 0; i < 2; i += 1) {
    insertMessage.run(`m2-${i}`, "s2", today10.getTime() + i)
  }
  insertMessage.run("m-old", "s3", now - 366 * 24 * 3600 * 1000) // 366 天前：在 365 天窗口外
  db.close()
}

describe("UsageServiceImpl", () => {
  it("aggregates token stats by model and skips empty model names", async () => {
    const dbPath = tempDbPath()
    seedDatabase(dbPath)
    const service = new UsageServiceImpl(dbPath)
    const stats = await service.getTokenStats()
    expect(stats.byModel).toHaveLength(2)
    const deepseek = stats.byModel.find((row) => row.model === "deepseek-v4-flash")
    expect(deepseek).toMatchObject({
      sessions: 2,
      inputTokens: 3000,
      outputTokens: 1300,
      reasoningTokens: 200,
      cacheReadTokens: 300,
      cacheWriteTokens: 100,
      cost: 0.03,
    })
    expect(stats.total.sessions).toBe(3)
    expect(stats.total.inputTokens).toBe(3500)
    expect(stats.total.outputTokens).toBe(1400)
  })

  it("returns empty stats when the database does not exist", async () => {
    const service = new UsageServiceImpl(path.join(tempDbPath(), "missing", "opencode.db"))
    expect(await service.getTokenStats()).toEqual({
      byModel: [],
      total: {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        sessions: 0,
      },
    })
    expect(await service.getActivityStats()).toEqual({ days: [], hours: Array.from({ length: 24 }, () => 0) })
  })

  it("computes activity days within the window and hourly distribution", async () => {
    const dbPath = tempDbPath()
    seedDatabase(dbPath)
    const service = new UsageServiceImpl(dbPath)
    const activity = await service.getActivityStats()
    // 366 天前的消息在窗口外
    const windowCount = activity.days.reduce((sum, day) => sum + day.count, 0)
    expect(windowCount).toBe(5)
    expect(activity.hours.reduce((sum, count) => sum + count, 0)).toBe(5)
    const today = new Date()
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const todayStat = activity.days.find((day) => day.date === key)
    expect(todayStat?.count).toBe(5)
    expect(activity.hours[9]).toBe(3)
    expect(activity.hours[10]).toBe(2)
  })
})
