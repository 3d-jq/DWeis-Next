import type { RightPanelTab, RightPanelTabSource } from "./right-panel-tabs.ts"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"

import * as React from "react"
import {
  activeTabIdAfterClose,
  artifactTabId,
  browserTabId,
  closeTab,
  turnOutputTabId,
  updateTabTitle,
  upsertTab,
} from "./right-panel-tabs.ts"

interface UseRightPanelTabsOptions {
  /** 会话切换时清空全部标签（与原面板行为一致）。 */
  activeSessionId: string | null
}

interface UseRightPanelTabsResult {
  tabs: RightPanelTab[]
  activeTab: RightPanelTab | null
  activeTabId: string | null
  /** 最近一次自动可用的成果（供聊天区成果入口展示）。 */
  latestArtifactSelection: ArtifactSelection | null
  /** 最近一次自动可用的审查记录（供标签栏加号菜单手动打开）。 */
  latestTurnOutputSelection: TurnOutputSelection | null
  closeTabById: (id: string) => void
  /** selection 可为 null（会话无成果时打开空态标签，对齐 LobsterAI 文件列表）。 */
  openArtifact: (selection: ArtifactSelection | null, source: RightPanelTabSource) => void
  openBrowser: (sessionId: string | null) => void
  openTurnOutput: (selection: TurnOutputSelection, source: RightPanelTabSource) => void
  setActiveTabId: (id: string) => void
  setTabTitle: (id: string, title: string) => void
  /** 会话重置：清空全部标签。 */
  clearTabs: () => void
}

const DEFAULT_BROWSER_TITLE = "Browser"
const DEFAULT_ARTIFACT_TITLE = "Artifacts"
const DEFAULT_TURNOUTPUT_TITLE = "Review"

export function useRightPanelTabs({ activeSessionId }: UseRightPanelTabsOptions): UseRightPanelTabsResult {
  const [tabs, setTabs] = React.useState<RightPanelTab[]>([])
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null)
  const [latestArtifactSelection, setLatestArtifactSelection] = React.useState<ArtifactSelection | null>(null)
  const [latestTurnOutputSelection, setLatestTurnOutputSelection] = React.useState<TurnOutputSelection | null>(null)

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  )

  const closeTabById = React.useCallback((id: string) => {
    setTabs((current) => {
      const next = closeTab(current, id)
      setActiveTabId((currentActive) => activeTabIdAfterClose(current, id, currentActive))
      return next
    })
  }, [])

  const setTabTitle = React.useCallback((id: string, title: string) => {
    setTabs((current) => updateTabTitle(current, id, title))
  }, [])

  const openBrowser = React.useCallback((sessionId: string | null) => {
    const tab: RightPanelTab = { id: browserTabId(sessionId), kind: "browser", sessionId, title: DEFAULT_BROWSER_TITLE }
    setTabs((current) => upsertTab(current, tab))
    setActiveTabId(tab.id)
  }, [])

  const openArtifact = React.useCallback((selection: ArtifactSelection | null, source: RightPanelTabSource) => {
    if (source === "auto" && selection) {
      setLatestArtifactSelection(selection)
    }
    const tab: RightPanelTab = {
      id: artifactTabId(selection),
      kind: "artifact",
      selection,
      source,
      title: DEFAULT_ARTIFACT_TITLE,
    }
    setTabs((current) => {
      const exists = current.some((candidate) => candidate.id === tab.id)
      if (!exists && source === "auto") {
        return current
      }
      const next = upsertTab(current, tab)
      if (source === "manual") {
        setActiveTabId(tab.id)
      }
      return next
    })
  }, [])

  const openTurnOutput = React.useCallback((selection: TurnOutputSelection, source: RightPanelTabSource) => {
    if (source === "auto") {
      setLatestTurnOutputSelection(selection)
    }
    const tab: RightPanelTab = {
      id: turnOutputTabId(selection),
      kind: "turn-output",
      selection,
      source,
      title: DEFAULT_TURNOUTPUT_TITLE,
    }
    setTabs((current) => {
      const exists = current.some((candidate) => candidate.id === tab.id)
      if (!exists && source === "auto") {
        return current
      }
      const next = upsertTab(current, tab)
      if (source === "manual") {
        setActiveTabId(tab.id)
      }
      return next
    })
  }, [])

  const clearTabs = React.useCallback(() => {
    setTabs([])
    setActiveTabId(null)
    setLatestArtifactSelection(null)
    setLatestTurnOutputSelection(null)
  }, [])

  // 会话切换：清空全部标签（与原 handleArtifactsReset 行为一致）。
  React.useEffect(() => {
    clearTabs()
  }, [activeSessionId, clearTabs])

  return {
    tabs,
    activeTab,
    activeTabId,
    latestArtifactSelection,
    latestTurnOutputSelection,
    closeTabById,
    openArtifact,
    openBrowser,
    openTurnOutput,
    setActiveTabId,
    setTabTitle,
    clearTabs,
  }
}
