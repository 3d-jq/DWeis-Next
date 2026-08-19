import type { BrowserPageState, BrowserService } from "../../../electron/browser/common.ts"
import type { RightPanelTab } from "./right-panel-tabs.ts"
import type { AddTabOption } from "./UnifiedTabBar.tsx"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"
import type { ConnectionClientService } from "@oomol/connection"

import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { ARTIFACTS_PANEL_MIN_WIDTH_PX } from "./app-shell-model.ts"
import { RIGHT_PANEL_TABPANEL_ID, tabElementId } from "./right-panel-tabs.ts"
import { UnifiedTabBar } from "./UnifiedTabBar.tsx"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

const ArtifactsPanel = React.lazy(() =>
  import("@/routes/Chat/GeneratedArtifacts").then((module) => ({ default: module.ArtifactsPanel })),
)
const TurnOutputsPanel = React.lazy(() =>
  import("@/routes/Chat/TurnOutputs").then((module) => ({ default: module.TurnOutputsPanel })),
)
const BrowserPanel = React.lazy(() =>
  import("@/routes/Chat/BrowserPanel").then((module) => ({ default: module.BrowserPanel })),
)

interface AppShellRightPanelProps {
  activeTab: RightPanelTab | null
  activeTabId: string | null
  artifactSelection: ArtifactSelection | null
  artifactsPanelContentRef: React.RefObject<HTMLDivElement | null>
  artifactsPanelIsMaximized: boolean
  artifactsPanelMaxWidthState: number | null
  artifactsPanelShellRef: React.RefObject<HTMLDivElement | null>
  browserService: ConnectionClientService<BrowserService>
  browserState: BrowserPageState | null
  handleArtifactsPanelResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  handleArtifactsPanelResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  isArtifactsPanelResizing: boolean
  onActivateTab: (id: string) => void
  /** 标签栏加号菜单选项（空数组时隐藏加号）。 */
  addTabOptions: AddTabOption[]
  onCloseTab: (id: string) => void
  rightPanelVisible: boolean
  setArtifactsPanelMaximizedState: (maximized: boolean) => void
  tabs: RightPanelTab[]
  turnOutputSelection: TurnOutputSelection | null
  visibleRightPanelWidth: number
  onSetTabTitle: (id: string, title: string) => void
}

export const AppShellRightPanel = React.memo(function AppShellRightPanel({
  activeTab,
  activeTabId,
  artifactSelection,
  artifactsPanelContentRef,
  artifactsPanelIsMaximized,
  artifactsPanelMaxWidthState,
  artifactsPanelShellRef,
  browserService,
  browserState,
  handleArtifactsPanelResizeKeyDown,
  handleArtifactsPanelResizeStart,
  isArtifactsPanelResizing,
  onActivateTab,
  addTabOptions,
  onCloseTab,
  rightPanelVisible,
  setArtifactsPanelMaximizedState,
  tabs,
  turnOutputSelection,
  visibleRightPanelWidth,
  onSetTabTitle,
}: AppShellRightPanelProps) {
  const t = useT()

  return (
    <div
      ref={artifactsPanelShellRef}
      className={cn(
        "oo-artifacts-panel-shell min-h-0",
        activeTab?.kind === "browser" && "oo-browser-panel-active",
        // 注意：maximized 时不能带 relative——tailwind utilities layer 会覆盖 @layer components 里的
        // position: fixed（跨 layer 不看特异性），导致面板回到 relative 且宽度 0，铺不满界面。
        artifactsPanelIsMaximized ? "min-w-0 flex-1 shrink" : "relative shrink-0",
        artifactsPanelIsMaximized && "oo-artifacts-panel-maximized",
        isArtifactsPanelResizing ? "transition-none" : "transition-[width,opacity,transform] duration-200 ease-out",
        rightPanelVisible ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0",
      )}
      style={{
        width: rightPanelVisible ? (artifactsPanelIsMaximized ? undefined : "var(--right-panel-width, 0px)") : "0px",
      }}
    >
      {!artifactsPanelIsMaximized ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("aria.resizeRightPanel")}
          aria-valuemin={ARTIFACTS_PANEL_MIN_WIDTH_PX}
          aria-valuemax={artifactsPanelMaxWidthState ?? undefined}
          aria-valuenow={visibleRightPanelWidth}
          title={t("aria.resizeRightPanel")}
          tabIndex={rightPanelVisible ? 0 : -1}
          className="oo-artifacts-panel-resize-handle"
          onPointerDown={handleArtifactsPanelResizeStart}
          onKeyDown={handleArtifactsPanelResizeKeyDown}
        />
      ) : null}
      <div className="flex h-full min-h-0 flex-col">
        <UnifiedTabBar
          activeTabId={activeTabId}
          maximized={artifactsPanelIsMaximized}
          tabs={tabs}
          onActivateTab={onActivateTab}
          addTabOptions={addTabOptions}
          onCloseTab={onCloseTab}
        />
        <div
          ref={artifactsPanelContentRef}
          id={RIGHT_PANEL_TABPANEL_ID}
          role="tabpanel"
          aria-labelledby={activeTabId ? tabElementId(activeTabId) : undefined}
          className="h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab?.id ?? "empty"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="h-full"
            >
              {activeTab?.kind === "browser" && browserState && browserState.sessionId === activeTab.sessionId ? (
                <React.Suspense fallback={null}>
                  <BrowserPanel
                    browserService={browserService}
                    sessionId={browserState.sessionId}
                    state={browserState}
                    onSetTitle={(title) => onSetTabTitle(activeTab.id, title)}
                    maximized={artifactsPanelIsMaximized}
                    onToggleMaximized={() => setArtifactsPanelMaximizedState(!artifactsPanelIsMaximized)}
                  />
                </React.Suspense>
              ) : activeTab?.kind === "turn-output" ? (
                <React.Suspense fallback={null}>
                  <TurnOutputsPanel
                    maximized={artifactsPanelIsMaximized}
                    selection={turnOutputSelection}
                    onToggleMaximized={() => setArtifactsPanelMaximizedState(!artifactsPanelIsMaximized)}
                    onSetTitle={(title) => onSetTabTitle(activeTab.id, title)}
                  />
                </React.Suspense>
              ) : activeTab?.kind === "artifact" ? (
                <React.Suspense fallback={null}>
                  <ArtifactsPanel
                    maximized={artifactsPanelIsMaximized}
                    selection={artifactSelection}
                    onToggleMaximized={() => setArtifactsPanelMaximizedState(!artifactsPanelIsMaximized)}
                    onSetTitle={(title) => onSetTabTitle(activeTab.id, title)}
                  />
                </React.Suspense>
              ) : (
                <RightPanelEmptyState />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
})

function RightPanelEmptyState() {
  const t = useT()
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8 text-center">
      <div className="grid gap-1">
        <div className="oo-text-label text-foreground">{t("rightPanel.emptyTitle")}</div>
        <div className="oo-text-caption text-muted-foreground">{t("rightPanel.emptyDescription")}</div>
      </div>
      <div className="oo-text-micro text-muted-foreground/70">{t("rightPanel.emptyHint")}</div>
    </div>
  )
}
