import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

/** 单模型 token 用量汇总。 */
export interface ModelTokenStats {
  model: string
  sessions: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
}

export interface TokenStatsResult {
  total: {
    sessions: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    cost: number
  }
  byModel: ModelTokenStats[]
}

/** 某天的活跃消息数（日期 YYYY-MM-DD，本地时区）。 */
export interface ActivityDayStat {
  date: string
  count: number
}

export interface ActivityStatsResult {
  /** 近 90 天按天消息数（热力图数据源）。 */
  days: ActivityDayStat[]
  /** 24 小时分布（本地时区，index = 小时）。 */
  hours: number[]
}

export type UsageService = typeof UsageService
export const UsageService = serviceName("usage-service") as ServiceName<{
  ClientInvokes: {
    getTokenStats(): Promise<TokenStatsResult>
    getActivityStats(): Promise<ActivityStatsResult>
  }
}>
