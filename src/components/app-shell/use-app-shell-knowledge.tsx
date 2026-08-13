import type { KnowledgeBaseSummary } from "../../../electron/knowledge/common.ts"
import type { UseKnowledgeBases } from "@/hooks/useKnowledgeBases"
import type { AppShellRoute as Route } from "./app-shell-types.ts"

import * as React from "react"
import { KNOWLEDGE_LIBRARY_CONTEXT_ID } from "../../../electron/knowledge/common.ts"
import { useT } from "@/i18n/i18n"
import { KnowledgeContextBar } from "./KnowledgeContextBar.tsx"

interface KnowledgeMention {
  id: string
  kind: "knowledge"
  name: string
  scope: "library" | "archive"
}

interface UseAppShellKnowledgeOptions {
  activeChatSessionId: string | null
  activeKnowledgeBaseIds: string[]
  activeQueuedMessageCount: number
  appSettingsLoading: boolean
  handleNewTaskSession: () => void
  knowledgeBaseBetaEnabled: boolean
  knowledgeLibrary: UseKnowledgeBases
  persistKnowledgeBaseIds: (sessionId: string, update: (current: string[]) => string[]) => void
  route: Route
  setDraftKnowledgeBaseIds: React.Dispatch<React.SetStateAction<string[]>>
  setRoute: (route: Route) => void
}

/**
 * 知识库域：目录导航状态、KB 引用派生、剪枝与增删 handler。
 *
 * 输入输出均为值与稳定回调，无内部 effect 顺序依赖（路由守卫 effect
 * 随本 hook 迁移，保持与原声明位置一致的语义）。
 */
export function useAppShellKnowledge({
  activeChatSessionId,
  activeKnowledgeBaseIds,
  activeQueuedMessageCount,
  appSettingsLoading,
  handleNewTaskSession,
  knowledgeBaseBetaEnabled,
  knowledgeLibrary,
  persistKnowledgeBaseIds,
  route,
  setDraftKnowledgeBaseIds,
  setRoute,
}: UseAppShellKnowledgeOptions): {
  handleAddKnowledgeBaseReference: (id: string) => void
  handleOpenKnowledgeLibrary: () => void
  handleStartKnowledgeChat: (item: KnowledgeBaseSummary) => void
  handleToggleKnowledgeBaseReference: (id: string) => void
  knowledgeDirectory: string
  knowledgeTitlebarNavigationVersion: number
  pinnedKnowledgeContextBar: React.ReactNode
  pinnedKnowledgeMentions: KnowledgeMention[]
  setKnowledgeDirectory: React.Dispatch<React.SetStateAction<string>>
  setKnowledgeTitlebarNavigationVersion: React.Dispatch<React.SetStateAction<number>>
} {
  const t = useT()
  const [knowledgeDirectory, setKnowledgeDirectory] = React.useState("")
  const [knowledgeTitlebarNavigationVersion, setKnowledgeTitlebarNavigationVersion] = React.useState(0)

  const activeKnowledgeBases = React.useMemo(
    () =>
      knowledgeBaseBetaEnabled
        ? activeKnowledgeBaseIds.flatMap((id) => {
            if (id === KNOWLEDGE_LIBRARY_CONTEXT_ID) {
              return [
                {
                  authors: [],
                  capabilities: {
                    fullTextSearch: true,
                    knowledgeGraph: true,
                    readingGraph: true,
                    summary: true,
                  },
                  id: KNOWLEDGE_LIBRARY_CONTEXT_ID,
                  importedAt: Number.MAX_SAFE_INTEGER,
                  relativePath: KNOWLEDGE_LIBRARY_CONTEXT_ID,
                  size: 0,
                  sourceFileName: "",
                  statistics: {},
                  title: t("knowledge.libraryContextName"),
                } satisfies KnowledgeBaseSummary,
              ]
            }
            const item = knowledgeLibrary.items.find((candidate) => candidate.id === id)
            return item ? [item] : []
          })
        : [],
    [activeKnowledgeBaseIds, knowledgeBaseBetaEnabled, knowledgeLibrary.items, t],
  )

  React.useEffect(() => {
    if (!knowledgeBaseBetaEnabled || knowledgeLibrary.loading || knowledgeLibrary.error) return
    const availableIds = new Set([KNOWLEDGE_LIBRARY_CONTEXT_ID, ...knowledgeLibrary.items.map((item) => item.id)])
    setDraftKnowledgeBaseIds((current) => {
      const next = current.filter((id) => availableIds.has(id))
      return next.length === current.length ? current : next
    })
  }, [knowledgeBaseBetaEnabled, knowledgeLibrary.error, knowledgeLibrary.items, knowledgeLibrary.loading])

  const pinnedKnowledgeMentions = React.useMemo(
    () =>
      activeKnowledgeBases.map((item) => ({
        id: item.id,
        kind: "knowledge" as const,
        name: item.title,
        scope: item.id === KNOWLEDGE_LIBRARY_CONTEXT_ID ? ("library" as const) : ("archive" as const),
      })),
    [activeKnowledgeBases],
  )

  React.useEffect(() => {
    if (!appSettingsLoading && !knowledgeBaseBetaEnabled && route === "knowledge") {
      setRoute("chat")
    }
  }, [appSettingsLoading, knowledgeBaseBetaEnabled, route])

  const handleOpenKnowledgeLibrary = React.useCallback((): void => {
    setRoute("knowledge")
  }, [])

  const handleStartKnowledgeChat = React.useCallback(
    (item: KnowledgeBaseSummary): void => {
      handleNewTaskSession()
      setDraftKnowledgeBaseIds([item.id])
    },
    [handleNewTaskSession],
  )

  const handleToggleKnowledgeBaseReference = React.useCallback(
    (id: string): void => {
      const toggle = (current: string[]): string[] =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      if (activeChatSessionId) persistKnowledgeBaseIds(activeChatSessionId, toggle)
      else setDraftKnowledgeBaseIds(toggle)
    },
    [activeChatSessionId, persistKnowledgeBaseIds],
  )

  const handleAddKnowledgeBaseReference = React.useCallback(
    (id: string): void => {
      const add = (current: string[]): string[] => (current.includes(id) ? current : [...current, id])
      if (activeChatSessionId) persistKnowledgeBaseIds(activeChatSessionId, add)
      else setDraftKnowledgeBaseIds(add)
    },
    [activeChatSessionId, persistKnowledgeBaseIds],
  )

  const pinnedKnowledgeContextBar = React.useMemo(
    () =>
      activeKnowledgeBases.length > 0 ? (
        <KnowledgeContextBar
          activeItems={activeKnowledgeBases}
          items={knowledgeLibrary.items}
          queuedMessageCount={activeQueuedMessageCount}
          onOpenLibrary={() => setRoute("knowledge")}
          onToggle={handleToggleKnowledgeBaseReference}
        />
      ) : null,
    [activeKnowledgeBases, activeQueuedMessageCount, handleToggleKnowledgeBaseReference, knowledgeLibrary.items],
  )

  return {
    handleAddKnowledgeBaseReference,
    handleOpenKnowledgeLibrary,
    handleStartKnowledgeChat,
    handleToggleKnowledgeBaseReference,
    knowledgeDirectory,
    knowledgeTitlebarNavigationVersion,
    pinnedKnowledgeContextBar,
    pinnedKnowledgeMentions,
    setKnowledgeDirectory,
    setKnowledgeTitlebarNavigationVersion,
  }
}
