import type { BrowserPageState, BrowserService } from "../../../electron/browser/common.ts"
import type { RightPanelTab } from "./right-panel-tabs.ts"
import type { AddTabOption } from "./UnifiedTabBar.tsx"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"
import type { ConnectionClientService } from "@oomol/connection"

import { LoaderCircle } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { ARTIFACTS_PANEL_MIN_WIDTH_PX } from "./app-shell-model.ts"
import { RIGHT_PANEL_TABPANEL_ID, tabElementId } from "./right-panel-tabs.ts"
import { UnifiedTabBar } from "./UnifiedTabBar.tsx"
import { useT } from "@/i18n/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
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

/** 草稿态浏览器的稳定会话 key：无真实会话时也建一个真实空白页，保证「点浏览器就能打开」。 */
const DRAFT_BROWSER_SESSION = "dweis:draft-browser"

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
  /** 成果列表点击产物 → 打开该产物的独立预览标签（成果本身不预览）。 */
  onOpenArtifact: (selection: ArtifactSelection) => void
  rightPanelVisible: boolean
  /** 当前会话 id：供「成果」总列表拉取全量产物。 */
  sessionId: string | null
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
  onOpenArtifact,
  rightPanelVisible,
  sessionId,
  setArtifactsPanelMaximizedState,
  tabs,
  turnOutputSelection,
  visibleRightPanelWidth,
  onSetTabTitle,
}: AppShellRightPanelProps) {
  const t = useT()
  // 草稿态浏览器：无真实会话（sessionId 为 null）时用一个稳定 key 建真实空白页，
  // 并订阅其 stateChanged 维持可用，避免「点浏览器打不开」。发首条消息后升级为真实会话浏览器。
  const [draftBrowserState, setDraftBrowserState] = React.useState<BrowserPageState | null>(null)
  const draftBrowserActive = activeTab?.kind === "browser" && !activeTab.sessionId
  React.useEffect(() => {
    if (!draftBrowserActive) {
      return
    }
    const off = browserService.serverEvents.on("stateChanged", (state) => {
      if (state.sessionId === DRAFT_BROWSER_SESSION) {
        setDraftBrowserState(state)
      }
    })
    void browserService.invoke("loadBlank", DRAFT_BROWSER_SESSION).catch((cause: unknown) => {
      reportRendererHandledError("browser", "open draft browser failed", cause)
    })
    return off
  }, [browserService, draftBrowserActive])

  // 真实会话的浏览器 tab：browserState 未就绪时自动拉起页面（对齐 LobsterAI 打开即见浏览器），
  // 面板先显示 loading，stateChanged 回填后再渲染 BrowserPanel。
  React.useEffect(() => {
    if (activeTab?.kind !== "browser" || !activeTab.sessionId) {
      return
    }
    if (browserState?.sessionId === activeTab.sessionId) {
      return
    }
    void browserService.invoke("loadBlank", activeTab.sessionId).catch((cause: unknown) => {
      reportRendererHandledError("browser", "open browser page failed", cause)
    })
  }, [activeTab, browserService, browserState])

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
              ) : activeTab?.kind === "browser" && activeTab.sessionId ? (
                <BrowserPending />
              ) : activeTab?.kind === "browser" && draftBrowserState ? (
                <React.Suspense fallback={null}>
                  <BrowserPanel
                    browserService={browserService}
                    sessionId={DRAFT_BROWSER_SESSION}
                    state={draftBrowserState}
                    onSetTitle={(title) => onSetTabTitle(activeTab.id, title)}
                    maximized={artifactsPanelIsMaximized}
                    onToggleMaximized={() => setArtifactsPanelMaximizedState(!artifactsPanelIsMaximized)}
                  />
                </React.Suspense>
              ) : activeTab?.kind === "browser" ? (
                <BrowserPending />
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
                    sessionId={sessionId}
                    onOpenArtifact={onOpenArtifact}
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

/** 真实会话浏览器页面加载中：stateChanged 回填前短暂显示，避免“点了没反应”。 */
function BrowserPending() {
  const t = useT()
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground/60" />
      <div className="oo-text-caption text-muted-foreground">{t("rightPanel.browserPending")}</div>
    </div>
  )
}
