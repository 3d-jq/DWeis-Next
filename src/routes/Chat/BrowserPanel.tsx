import type { BrowserPageState, BrowserViewBounds } from "../../../electron/browser/common.ts"
import type { BrowserService } from "../../../electron/browser/common.ts"
import type { PanelHeaderAction } from "@/components/app-shell/PanelHeader.tsx"
import type { ConnectionClientService } from "@oomol/connection"

import { ArrowLeft, ArrowRight, ExternalLink, LoaderCircle, RotateCw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { PanelHeader } from "@/components/app-shell/PanelHeader.tsx"
import { useT } from "@/i18n/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { cn } from "@/lib/utils"

interface BrowserPanelProps {
  browserService: ConnectionClientService<BrowserService>
  sessionId: string
  state: BrowserPageState
  onSetTitle: (title: string) => void
  maximized: boolean
  onToggleMaximized: () => void
}

const toolbarButtonClass =
  "oo-toolbar-button flex size-8 shrink-0 items-center justify-center rounded-md [-webkit-app-region:no-drag] hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-40"

function browserViewIsOccluded(root: ParentNode = document): boolean {
  return Boolean(root.querySelector('[aria-modal="true"]'))
}

export function BrowserPanel({
  browserService,
  sessionId,
  state,
  onSetTitle,
  maximized,
  onToggleMaximized,
}: BrowserPanelProps) {
  const t = useT()
  const browserSlotRef = React.useRef<HTMLDivElement | null>(null)
  const previewRequestRef = React.useRef(0)
  const [address, setAddress] = React.useState(state.navigation.url === "about:blank" ? "" : state.navigation.url)
  const [previewDataUrl, setPreviewDataUrl] = React.useState<string | null>(null)
  /** Whether the native WebContentsView is currently visible (shown via IPC). */
  const nativeViewVisibleRef = React.useRef(false)

  React.useEffect(() => {
    setAddress(state.navigation.url === "about:blank" ? "" : state.navigation.url)
  }, [state.navigation.url])

  // Sync page title to tab.
  React.useEffect(() => {
    const title = state.navigation.title || state.navigation.url || "Browser"
    onSetTitle(title)
  }, [state.navigation.title, state.navigation.url, onSetTitle])

  const refreshPreview = React.useCallback((): void => {
    // No need for a snapshot when the native view is visible — it would only cause visual overlap
    if (nativeViewVisibleRef.current) return
    const request = ++previewRequestRef.current
    void browserService
      .invoke("capturePreview", sessionId)
      .then((preview) => {
        if (request === previewRequestRef.current) setPreviewDataUrl(preview)
      })
      .catch((cause: unknown) => {
        reportRendererHandledError("browser", "capture browser modal backdrop preview failed", cause)
      })
  }, [browserService, sessionId])

  React.useEffect(() => {
    previewRequestRef.current += 1
    setPreviewDataUrl(null)
  }, [sessionId])

  React.useEffect(() => {
    // Only capture snapshot when native view is hidden/occluded
    if (!state.navigation.loading && !nativeViewVisibleRef.current) refreshPreview()
  }, [refreshPreview, state.navigation.loading, state.navigation.url])

  React.useLayoutEffect(() => {
    const slot = browserSlotRef.current
    if (!slot) return

    let frame: number | null = null
    let lastBoundsKey = ""
    let snapshotShown = false

    const computeBounds = (): BrowserViewBounds | null => {
      const rect = slot.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return null
      return { height: rect.height, width: rect.width, x: rect.x, y: rect.y }
    }

    const syncView = (): void => {
      frame = null
      if (browserViewIsOccluded()) {
        if (nativeViewVisibleRef.current) {
          nativeViewVisibleRef.current = false
          lastBoundsKey = ""
        }
        // Always ensure the native view is hidden behind a modal (idempotent)
        void browserService.invoke("hide", sessionId).catch((cause: unknown) => {
          reportRendererHandledError("browser", "hide browser page behind renderer surface failed", cause)
        })
        // Capture a placeholder snapshot only once (avoid re-capturing every frame)
        if (!snapshotShown) {
          snapshotShown = true
          refreshPreview()
        }
        return
      }
      const bounds = computeBounds()
      if (!bounds) {
        if (nativeViewVisibleRef.current) {
          nativeViewVisibleRef.current = false
          lastBoundsKey = ""
          void browserService.invoke("hide", sessionId).catch(() => undefined)
        }
        return
      }
      // Only re-position when the rect actually changed — avoids redundant IPC every frame
      const key = `${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.width)},${Math.round(bounds.height)}`
      if (key === lastBoundsKey) return
      lastBoundsKey = key
      nativeViewVisibleRef.current = true
      setPreviewDataUrl(null)
      snapshotShown = false
      void browserService.invoke("show", { bounds, sessionId }).catch((cause: unknown) => {
        reportRendererHandledError("browser", "show browser page failed", cause)
      })
    }

    const schedule = (): void => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(syncView)
    }

    schedule()
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(slot)
    const overlayObserver = new MutationObserver(schedule)
    overlayObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-modal"],
      childList: true,
      subtree: true,
    })
    window.addEventListener("resize", schedule)
    return () => {
      resizeObserver.disconnect()
      overlayObserver.disconnect()
      window.removeEventListener("resize", schedule)
      if (frame !== null) window.cancelAnimationFrame(frame)
      nativeViewVisibleRef.current = false
      void browserService.invoke("hide", sessionId).catch(() => undefined)
    }
  }, [browserService, refreshPreview, sessionId])

  const runNavigationAction = React.useCallback(
    (action: "goBack" | "goForward" | "reload"): void => {
      void browserService.invoke(action, sessionId).catch((cause: unknown) => {
        reportRendererHandledError("browser", `browser ${action} failed`, cause)
        toast.error(t("browser.actionFailed"))
      })
    },
    [browserService, sessionId, t],
  )

  const navigate = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault()
      void browserService.invoke("navigate", { sessionId, url: address }).catch((cause: unknown) => {
        reportRendererHandledError("browser", "browser navigation failed", cause)
        toast.error(t("browser.invalidAddress"))
      })
    },
    [address, browserService, sessionId, t],
  )

  const openInSystemBrowser = React.useCallback((): void => {
    void browserService.invoke("openInSystemBrowser", sessionId).catch((cause: unknown) => {
      reportRendererHandledError("browser", "open browser page in system browser failed", cause)
      toast.error(t("browser.actionFailed"))
    })
  }, [browserService, sessionId, t])

  const pageTitle = state.navigation.title || state.navigation.url || t("rightPanel.tabBrowser")

  const headerActions: PanelHeaderAction[] = React.useMemo(
    () => [
      {
        id: "open-in-browser",
        icon: <ExternalLink className="size-4" />,
        label: t("browser.openInSystem"),
        onClick: openInSystemBrowser,
        disabled: !state.navigation.url || state.navigation.url === "about:blank",
      },
    ],
    [openInSystemBrowser, state.navigation.url, t],
  )

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <PanelHeader
        title={pageTitle}
        actions={headerActions}
        maximized={maximized}
        onToggleMaximized={onToggleMaximized}
      />
      <div className="flex h-[33px] shrink-0 items-center gap-1 border-b border-border px-2 [-webkit-app-region:drag]">
        <button
          type="button"
          className={toolbarButtonClass}
          disabled={!state.navigation.canGoBack}
          title={t("browser.back")}
          aria-label={t("browser.back")}
          onClick={() => runNavigationAction("goBack")}
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          disabled={!state.navigation.canGoForward}
          title={t("browser.forward")}
          aria-label={t("browser.forward")}
          onClick={() => runNavigationAction("goForward")}
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          title={t("browser.reload")}
          aria-label={t("browser.reload")}
          onClick={() => runNavigationAction("reload")}
        >
          <LoaderCircle className={cn("size-4 animate-spin", !state.navigation.loading && "hidden")} />
          <RotateCw className={cn("size-4", state.navigation.loading && "hidden")} />
        </button>
        <form className="min-w-0 flex-1 [-webkit-app-region:no-drag]" onSubmit={navigate}>
          <input
            value={address}
            aria-label={t("browser.address")}
            placeholder={t("browser.addressPlaceholder")}
            className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-ring"
            onChange={(event) => setAddress(event.currentTarget.value)}
          />
        </form>
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        <div ref={browserSlotRef} className="absolute inset-y-0 right-0 left-3 overflow-hidden">
          {previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full select-none"
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
