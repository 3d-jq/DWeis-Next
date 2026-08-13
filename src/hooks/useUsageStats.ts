import type { ActivityStatsResult, TokenStatsResult } from "../../electron/stats/common.ts"

import * as React from "react"
import { useUsageService } from "../components/AppContext.ts"
import { reportRendererHandledError } from "../lib/renderer-diagnostics.ts"

export function useUsageStats(): {
  activity: ActivityStatsResult | null
  loading: boolean
  refresh: () => void
  tokens: TokenStatsResult | null
} {
  const service = useUsageService()
  const [tokens, setTokens] = React.useState<TokenStatsResult | null>(null)
  const [activity, setActivity] = React.useState<ActivityStatsResult | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(() => {
    setLoading(true)
    void Promise.all([
      service.invoke("getTokenStats"),
      service.invoke("getActivityStats"),
    ])
      .then(([tokenStats, activityStats]) => {
        setTokens(tokenStats)
        setActivity(activityStats)
      })
      .catch((error: unknown) => {
        reportRendererHandledError("usage", "load usage stats failed", error)
      })
      .finally(() => setLoading(false))
  }, [service])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  return { activity, loading, refresh, tokens }
}
