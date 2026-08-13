import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"

/**
 * 右侧边栏多标签模型：浏览器 / 审查（回合输出）/ 成果（Artifacts）统一在侧边栏显示，
 * 各自对应一个标签。外壳（TabBar + Header）统一，仅内容区随类型变化。
 *
 * 去重规则：
 * - browser 按 sessionId 唯一（浏览器是会话级单页）
 * - artifact 按 messageId 唯一（同一消息的产物只开一个标签，新版本更新内容）
 * - turn-output 按 sessionId + messageId 唯一
 */

export type RightPanelTabSource = "auto" | "manual"

export type RightPanelTab =
  | { id: string; kind: "browser"; sessionId: string; title: string }
  | { id: string; kind: "turn-output"; selection: TurnOutputSelection; source: RightPanelTabSource; title: string }
  | { id: string; kind: "artifact"; selection: ArtifactSelection; source: RightPanelTabSource; title: string }

/** 右侧面板内容区的 tabpanel 元素 id（tab 用 aria-controls 指向它）。 */
export const RIGHT_PANEL_TABPANEL_ID = "right-panel-tabpanel"

/** tab 的 DOM id：标签 id 可含冒号（browser:xxx 等），净化成合法 HTML id。 */
export function tabElementId(tabId: string): string {
  return `right-tab-${tabId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
}

export function browserTabId(sessionId: string): string {
  return `browser:${sessionId}`
}

export function artifactTabId(selection: ArtifactSelection): string {
  return `artifact:${selection.messageId}`
}

export function turnOutputTabId(selection: TurnOutputSelection): string {
  return `turn-output:${selection.record.sessionId}:${selection.record.messageId}`
}

/** 新增或更新一个标签；返回新数组（不变时返回原数组）。 */
export function upsertTab(tabs: readonly RightPanelTab[], tab: RightPanelTab): RightPanelTab[] {
  const existingIndex = tabs.findIndex((candidate) => candidate.id === tab.id)
  if (existingIndex < 0) {
    return [...tabs, tab]
  }
  const next = [...tabs]
  next[existingIndex] = tab
  return next
}

export function closeTab(tabs: readonly RightPanelTab[], id: string): RightPanelTab[] {
  return tabs.filter((tab) => tab.id !== id)
}

/** 关闭标签后应激活的标签 id：优先前一个，否则后一个，全空返回 null。 */
export function activeTabIdAfterClose(
  tabs: readonly RightPanelTab[],
  closedId: string,
  activeId: string | null,
): string | null {
  const closedIndex = tabs.findIndex((tab) => tab.id === closedId)
  if (closedIndex < 0) {
    return activeId
  }
  const remaining = tabs.filter((tab) => tab.id !== closedId)
  if (remaining.length === 0) {
    return null
  }
  if (activeId !== closedId) {
    return activeId
  }
  return (remaining[closedIndex - 1] ?? remaining[closedIndex] ?? null).id
}

/** 更新指定标签的 title；未变化时返回原数组。 */
export function updateTabTitle(tabs: readonly RightPanelTab[], id: string, title: string): RightPanelTab[] {
  const index = tabs.findIndex((tab) => tab.id === id)
  if (index < 0) {
    return tabs as RightPanelTab[]
  }
  const current = tabs[index]
  if (current.title === title) {
    return tabs as RightPanelTab[]
  }
  const next = [...tabs]
  next[index] = { ...current, title }
  return next
}
