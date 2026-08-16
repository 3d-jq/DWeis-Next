import type { SkillInventory } from "../../electron/skills/common.ts"
import type { AppDataResources } from "@/components/AppDataContext"

import * as React from "react"
import { useAppContext } from "@/components/AppContext"
import { AppDataContext } from "@/components/AppDataContext"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { createResource } from "@/lib/resource-store"

const backgroundRefreshMs = 60_000
const refreshMetadataKeys = new Set(["updatedAt", "checkedAt"])

function normalizeRefreshData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeRefreshData)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !refreshMetadataKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeRefreshData(entryValue)]),
  )
}

function isRefreshDataEqual<T>(current: T, next: T): boolean {
  return JSON.stringify(normalizeRefreshData(current)) === JSON.stringify(normalizeRefreshData(next))
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { skillService } = useAppContext()
  const resources = React.useMemo<AppDataResources>(
    () => ({
      skillInventory: createResource<SkillInventory>({
        isEqualData: isRefreshDataEqual,
        // 主进程 watcher 会在技能变化时主动失效；较长 TTL 仅兜底发现启动时尚不存在的技能目录。
        staleTimeMs: 5 * 60_000,
        load: () => skillService.invoke("getSkillInventory"),
      }),
    }),
    [skillService],
  )

  React.useEffect(() => {
    return skillService.serverEvents.on("skillInventoryChanged", () => {
      void resources.skillInventory
        .refresh({ forceRefresh: true, silent: true })
        .catch((error: unknown) =>
          reportRendererHandledError("app-data", "silent skill inventory refresh failed after inventory event", error),
        )
    })
  }, [resources, skillService.serverEvents])

  React.useEffect(() => {
    let timer: number | undefined

    const refresh = () => {
      if (document.visibilityState !== "visible") {
        return
      }
      void resources.skillInventory
        .refresh({ silent: true })
        .catch((error: unknown) =>
          reportRendererHandledError("app-data", "silent skill inventory refresh failed", error),
        )
    }

    const sync = () => {
      if (document.visibilityState === "visible") {
        refresh()
        timer ??= window.setInterval(refresh, backgroundRefreshMs)
        return
      }
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }

    document.addEventListener("visibilitychange", sync)
    window.addEventListener("focus", refresh)
    sync()

    return () => {
      document.removeEventListener("visibilitychange", sync)
      window.removeEventListener("focus", refresh)
      if (timer !== undefined) {
        window.clearInterval(timer)
      }
    }
  }, [resources])

  return <AppDataContext.Provider value={resources}>{children}</AppDataContext.Provider>
}
