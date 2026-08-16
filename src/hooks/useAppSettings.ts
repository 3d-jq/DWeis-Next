import type { DWeisReasoningLevel } from "../../electron/agent/reasoning.ts"
import type {
  AppSettings,
  CompletionNotificationCondition,
  GenerationConfig,
  OperatingMode,
  Persona,
  SearchConfig,
  SubagentModelChoice,
} from "../../electron/settings/common.ts"

import * as React from "react"
import { DEFAULT_APP_SETTINGS } from "../../electron/settings/common.ts"
import { useSettingsService } from "../components/AppContext.ts"
import { reportRendererHandledError } from "../lib/renderer-diagnostics.ts"

export function useAppSettings(): {
  settings: AppSettings
  loading: boolean
  setAutoMemoryReview: (enabled: boolean) => Promise<void>
  setAutoMemoryReviewInterval: (interval: number) => Promise<void>
  setBrowserEnabled: (enabled: boolean) => Promise<void>
  setCompletionNotificationCondition: (condition: CompletionNotificationCondition) => Promise<void>
  setDataDirectory: (dir: string) => Promise<void>
  setKnowledgeBaseBetaEnabled: (enabled: boolean) => Promise<void>
  setNotificationSoundEnabled: (enabled: boolean) => Promise<void>
  setOperatingMode: (mode: OperatingMode) => Promise<void>
  setPersona: (persona: Persona) => Promise<void>
  setSelfManagedSetupDismissed: (dismissed: boolean) => Promise<void>
  setSubagentModelId: (modelId: SubagentModelChoice | null) => Promise<void>
  setSubagentReasoningLevel: (level: DWeisReasoningLevel | null) => Promise<void>
  setExploreModelId: (modelId: SubagentModelChoice | null) => Promise<void>
  setExploreReasoningLevel: (level: DWeisReasoningLevel | null) => Promise<void>
  setGenerationConfig: (config: GenerationConfig | null) => Promise<void>
  setSearchConfig: (config: SearchConfig | null) => Promise<void>
  setToolSecret: (scope: "generation" | "search", secret: string | null) => Promise<void>
  getToolSecret: (scope: "generation" | "search") => Promise<string | null>
  setUnreadBadgeEnabled: (enabled: boolean) => Promise<void>
} {
  const service = useSettingsService()
  const [settings, setSettings] = React.useState<AppSettings>(() => ({ ...DEFAULT_APP_SETTINGS }))
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    void service
      .invoke("getSettings")
      .then(
        (next) => {
          if (active) setSettings(next)
        },
        (error: unknown) => reportRendererHandledError("settings", "load application settings failed", error),
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    const unsubscribe = service.serverEvents.on("settingsChanged", (next) => {
      if (active) setSettings(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [service])

  const setKnowledgeBaseBetaEnabled = React.useCallback(
    async (enabled: boolean) => {
      await service.invoke("setKnowledgeBaseBetaEnabled", enabled)
      setSettings((current) => ({ ...current, knowledgeBaseBetaEnabled: enabled }))
    },
    [service],
  )

  const setAutoMemoryReview = React.useCallback(
    async (enabled: boolean) => {
      await service.invoke("setAutoMemoryReview", enabled)
      setSettings((current) => ({ ...current, autoMemoryReview: enabled }))
    },
    [service],
  )

  const setAutoMemoryReviewInterval = React.useCallback(
    async (interval: number) => {
      await service.invoke("setAutoMemoryReviewInterval", interval)
      setSettings((current) => ({ ...current, autoMemoryReviewInterval: interval }))
    },
    [service],
  )

  const setBrowserEnabled = React.useCallback(
    async (enabled: boolean) => {
      await service.invoke("setBrowserEnabled", enabled)
      setSettings((current) => ({ ...current, browserEnabled: enabled }))
    },
    [service],
  )

  const setCompletionNotificationCondition = React.useCallback(
    async (condition: CompletionNotificationCondition) => {
      await service.invoke("setCompletionNotificationCondition", condition)
      setSettings((current) => ({ ...current, completionNotificationCondition: condition }))
    },
    [service],
  )

  const setNotificationSoundEnabled = React.useCallback(
    async (enabled: boolean) => {
      await service.invoke("setNotificationSoundEnabled", enabled)
      setSettings((current) => ({ ...current, notificationSoundEnabled: enabled }))
    },
    [service],
  )

  const setUnreadBadgeEnabled = React.useCallback(
    async (enabled: boolean) => {
      await service.invoke("setUnreadBadgeEnabled", enabled)
      setSettings((current) => ({ ...current, unreadBadgeEnabled: enabled }))
    },
    [service],
  )

  const setOperatingMode = React.useCallback(
    async (mode: OperatingMode) => {
      await service.invoke("setOperatingMode", mode)
      setSettings((current) => ({ ...current, operatingMode: mode }))
    },
    [service],
  )

  const setPersona = React.useCallback(
    async (persona: Persona) => {
      await service.invoke("setPersona", persona)
      setSettings((current) => ({ ...current, persona }))
    },
    [service],
  )

  const setSelfManagedSetupDismissed = React.useCallback(
    async (dismissed: boolean) => {
      await service.invoke("setSelfManagedSetupDismissed", dismissed)
      setSettings((current) => ({ ...current, selfManagedSetupDismissed: dismissed }))
    },
    [service],
  )

  const setDataDirectory = React.useCallback(
    async (dir: string) => {
      await service.invoke("setDataDirectory", dir)
      // 数据目录迁移后重启生效；立即重启前由设置页展示目标路径，这里不改当前生效值。
    },
    [service],
  )

  const setSubagentModelId = React.useCallback(
    async (modelId: SubagentModelChoice | null) => {
      await service.invoke("setSubagentModelId", modelId)
      setSettings((current) => ({ ...current, subagentModelId: modelId }))
    },
    [service],
  )

  const setSubagentReasoningLevel = React.useCallback(
    async (level: DWeisReasoningLevel | null) => {
      await service.invoke("setSubagentReasoningLevel", level)
      setSettings((current) => ({ ...current, subagentReasoningLevel: level }))
    },
    [service],
  )

  const setExploreModelId = React.useCallback(
    async (modelId: SubagentModelChoice | null) => {
      await service.invoke("setExploreModelId", modelId)
      setSettings((current) => ({ ...current, exploreModelId: modelId }))
    },
    [service],
  )

  const setExploreReasoningLevel = React.useCallback(
    async (level: DWeisReasoningLevel | null) => {
      await service.invoke("setExploreReasoningLevel", level)
      setSettings((current) => ({ ...current, exploreReasoningLevel: level }))
    },
    [service],
  )

  const setGenerationConfig = React.useCallback(
    async (config: GenerationConfig | null) => {
      await service.invoke("setGenerationConfig", config)
      setSettings((current) => ({ ...current, generationConfig: config }))
    },
    [service],
  )

  const setSearchConfig = React.useCallback(
    async (config: SearchConfig | null) => {
      await service.invoke("setSearchConfig", config)
      setSettings((current) => ({ ...current, searchConfig: config }))
    },
    [service],
  )

  const setToolSecret = React.useCallback(
    async (scope: "generation" | "search", secret: string | null) => {
      await service.invoke("setToolSecret", scope, secret)
    },
    [service],
  )

  const getToolSecret = React.useCallback(
    async (scope: "generation" | "search") => {
      return await service.invoke("getToolSecret", scope)
    },
    [service],
  )

  return {
    settings,
    loading,
    setBrowserEnabled,
    setCompletionNotificationCondition,
    setDataDirectory,
    setKnowledgeBaseBetaEnabled,
    setNotificationSoundEnabled,
    setOperatingMode,
    setPersona,
    setSelfManagedSetupDismissed,
    setSubagentModelId,
    setSubagentReasoningLevel,
    setExploreModelId,
    setExploreReasoningLevel,
    setGenerationConfig,
    setSearchConfig,
    setToolSecret,
    getToolSecret,
    setUnreadBadgeEnabled,
    setAutoMemoryReview,
    setAutoMemoryReviewInterval,
  }
}
