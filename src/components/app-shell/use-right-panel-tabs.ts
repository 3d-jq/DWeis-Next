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

interface RightPanelTabsState {
  tabs: RightPanelTab[]
  activeTabId: string | null
}

interface UseRightPanelTabsResult {
  tabs: RightPanelTab[]
  activeTab: RightPanelTab | null
  activeTabId: string | null
  /** 最近一次自动可用的成果（供聊天区成果入口显示）。 */
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
  // tabs 与 activeTabId 必须原子更新：拆成两个 state 时激活写入若被丢弃
  // （React 可重放/丢弃不纯 updater），会出现"点了成果但面板停在旧标签"的失联表现。
  const [state, setState] = React.useState<RightPanelTabsState>({ tabs: [], activeTabId: null })
  const [latestArtifactSelection, setLatestArtifactSelection] = React.useState<ArtifactSelection | null>(null)
  const [latestTurnOutputSelection, setLatestTurnOutputSelection] = React.useState<TurnOutputSelection | null>(null)

  const activeTab = React.useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0] ?? null,
    [state],
  )

  const closeTabById = React.useCallback((id: string) => {
    setState((current) => ({
      tabs: closeTab(current.tabs, id),
      activeTabId: activeTabIdAfterClose(current.tabs, id, current.activeTabId),
    }))
  }, [])

  const setTabTitle = React.useCallback((id: string, title: string) => {
    setState((current) => {
      const tabs = updateTabTitle(current.tabs, id, title)
      return tabs === current.tabs ? current : { ...current, tabs }
    })
  }, [])

  const setActiveTabId = React.useCallback((id: string) => {
    setState((current) => (current.activeTabId === id ? current : { ...current, activeTabId: id }))
  }, [])

  const openBrowser = React.useCallback((sessionId: string | null) => {
    const tab: RightPanelTab = { id: browserTabId(sessionId), kind: "browser", sessionId, title: DEFAULT_BROWSER_TITLE }
    setState((current) => ({ tabs: upsertTab(current.tabs, tab), activeTabId: tab.id }))
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
    setState((current) => {
      // 自动通知只更新已打开的标签，不新开；手动打开始终新建/更新并激活。
      if (!current.tabs.some((candidate) => candidate.id === tab.id) && source === "auto") {
        return current
      }
      return {
        tabs: upsertTab(current.tabs, tab),
        activeTabId: source === "manual" ? tab.id : current.activeTabId,
      }
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
    setState((current) => {
      if (!current.tabs.some((candidate) => candidate.id === tab.id) && source === "auto") {
        return current
      }
      return {
        tabs: upsertTab(current.tabs, tab),
        activeTabId: source === "manual" ? tab.id : current.activeTabId,
      }
    })
  }, [])

  const clearTabs = React.useCallback(() => {
    setState({ tabs: [], activeTabId: null })
    setLatestArtifactSelection(null)
    setLatestTurnOutputSelection(null)
  }, [])

  // 会话切换：清空全部标签（与原 handleArtifactsReset 行为一致）。
  React.useEffect(() => {
    clearTabs()
  }, [activeSessionId, clearTabs])

  return {
    tabs: state.tabs,
    activeTab,
    activeTabId: state.activeTabId,
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
