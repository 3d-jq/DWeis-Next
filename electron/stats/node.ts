import type { ActivityStatsResult, TokenStatsResult, UsageService } from "./common.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { DatabaseSync } from "node:sqlite"
import { UsageService as UsageServiceName } from "./common.ts"

/** 活跃统计的时间窗口（近一年，热力图 52 周铺满）。 */
const activityWindowDays = 365

/**
 * 使用统计服务：只读查询 opencode 的 SQLite（userData/agent/isolation/xdg-data/opencode/opencode.db），
 * 汇总各模型 token 用量与会话活跃度。数据库缺失/损坏/无会话时返回空统计，不影响主流程。
 */
export class UsageServiceImpl extends ConnectionService<UsageService> implements IConnectionService<UsageService> {
  private readonly dbPath: string

  public constructor(dbPath: string) {
    super(UsageServiceName)
    this.dbPath = dbPath
  }

  public getTokenStats(): Promise<TokenStatsResult> {
    return Promise.resolve(this.queryTokenStats())
  }

  public getActivityStats(): Promise<ActivityStatsResult> {
    return Promise.resolve(this.queryActivityStats())
  }

  private queryTokenStats(): TokenStatsResult {
    const empty = (): TokenStatsResult => ({
      total: {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        sessions: 0,
      },
      byModel: [],
    })
    const db = this.openDatabase()
    if (!db) {
      return empty()
    }
    try {
      const rows = db
        .prepare(
          `SELECT model, COUNT(*) AS sessions,
                  SUM(tokens_input) AS inputTokens,
                  SUM(tokens_output) AS outputTokens,
                  SUM(tokens_reasoning) AS reasoningTokens,
                  SUM(tokens_cache_read) AS cacheReadTokens,
                  SUM(tokens_cache_write) AS cacheWriteTokens,
                  SUM(cost) AS cost
             FROM session
            WHERE model IS NOT NULL AND model != ''
            GROUP BY model`,
        )
        .all() as Array<Record<string, number | string>>

      // 数据库里 model 是 JSON（{id, providerID, variant}），GROUP BY 按完整 JSON 分组会让
      // 同一模型的不同 variant 拆成多行；这里按 modelLabel 解析出的模型 id 合并统计。
      const merged = new Map<
        string,
        {
          cacheReadTokens: number
          cacheWriteTokens: number
          cost: number
          inputTokens: number
          model: string
          outputTokens: number
          reasoningTokens: number
          sessions: number
        }
      >()
      for (const row of rows) {
        const model = modelLabel(String(row.model ?? ""))
        const current = merged.get(model) ?? {
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0,
          inputTokens: 0,
          model,
          outputTokens: 0,
          reasoningTokens: 0,
          sessions: 0,
        }
        current.sessions += Number(row.sessions ?? 0)
        current.inputTokens += Number(row.inputTokens ?? 0)
        current.outputTokens += Number(row.outputTokens ?? 0)
        current.reasoningTokens += Number(row.reasoningTokens ?? 0)
        current.cacheReadTokens += Number(row.cacheReadTokens ?? 0)
        current.cacheWriteTokens += Number(row.cacheWriteTokens ?? 0)
        current.cost += Number(row.cost ?? 0)
        merged.set(model, current)
      }
      const byModel = [...merged.values()].sort(
        (left, right) => right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens),
      )
      const total = byModel.reduce(
        (acc, row) => ({
          cacheReadTokens: acc.cacheReadTokens + row.cacheReadTokens,
          cacheWriteTokens: acc.cacheWriteTokens + row.cacheWriteTokens,
          cost: acc.cost + row.cost,
          inputTokens: acc.inputTokens + row.inputTokens,
          outputTokens: acc.outputTokens + row.outputTokens,
          reasoningTokens: acc.reasoningTokens + row.reasoningTokens,
          sessions: acc.sessions + row.sessions,
        }),
        {
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          sessions: 0,
        },
      )
      return { byModel, total }
    } catch (error) {
      console.warn("[dweis] token stats query failed:", error)
      return empty()
    } finally {
      db.close()
    }
  }

  private queryActivityStats(): ActivityStatsResult {
    const empty = (): ActivityStatsResult => ({ days: [], hours: Array.from({ length: 24 }, () => 0) })
    const db = this.openDatabase()
    if (!db) {
      return empty()
    }
    try {
      const since = Date.now() - activityWindowDays * 24 * 60 * 60 * 1_000
      const dayRows = db
        .prepare(
          `SELECT strftime('%Y-%m-%d', time_created / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
             FROM message
            WHERE time_created >= ?
            GROUP BY day`,
        )
        .all(since) as Array<{ day: string; count: number }>
      const hourRows = db
        .prepare(
          `SELECT CAST(strftime('%H', time_created / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour, COUNT(*) AS count
             FROM message
            WHERE time_created >= ?
            GROUP BY hour`,
        )
        .all(since) as Array<{ hour: number; count: number }>

      const days = dayRows.map((row) => ({ date: String(row.day), count: Number(row.count) }))
      const hours = Array.from({ length: 24 }, () => 0)
      for (const row of hourRows) {
        const hour = Number(row.hour)
        if (hour >= 0 && hour <= 23) {
          hours[hour] = Number(row.count)
        }
      }
      return { days, hours }
    } catch (error) {
      console.warn("[dweis] activity stats query failed:", error)
      return empty()
    } finally {
      db.close()
    }
  }

  private openDatabase(): DatabaseSync | null {
    try {
      return new DatabaseSync(this.dbPath, { readOnly: true })
    } catch (error) {
      // 数据库尚未创建（首次使用/无会话）或不可读：返回 null，调用方给空统计。
      console.warn(`[dweis] usage stats database unavailable (${this.dbPath}):`, error)
      return null
    }
  }
}

/** model 字段是 JSON 字符串（{id, providerID, variant}），取 id 展示；解析失败回退原文。 */
function modelLabel(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { id?: unknown }
    return typeof parsed.id === "string" && parsed.id ? parsed.id : raw
  } catch {
    return raw
  }
}
