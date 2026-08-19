import type { BrowserPageState, BrowserViewBounds } from "../../../electron/browser/common.ts"
import type { BrowserService } from "../../../electron/browser/common.ts"
import type { PanelHeaderAction } from "@/components/app-shell/PanelHeader.tsx"
import type { ConnectionClientService } from "@oomol/connection"

import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Camera,
  EllipsisVertical,
  ExternalLink,
  FileX2,
  LoaderCircle,
  Minus,
  Plus,
  RotateCw,
  Smartphone,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import {
  BROWSER_DEVICE_PRESETS,
  DEVICE_CUSTOM_USER_AGENT,
  deviceFitScale,
  deviceViewport,
  matchDevicePreset,
  parseDeviceDimension,
} from "./browser-device.ts"
import { PanelHeader } from "@/components/app-shell/PanelHeader.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

/** 面板侧的模拟状态：竖屏尺寸 + 横屏标志 + 当前 UA（id 仅用于 Select 显示）。 */
interface DeviceEmulationState {
  height: number
  id: string
  landscape: boolean
  userAgent: string
  width: number
}

/** 从主进程回传的模拟配置恢复面板状态（面板重建后仍显示模拟中）。 */
function restoreDeviceState(emulation: BrowserPageState["device"]): DeviceEmulationState | null {
  if (!emulation) return null
  const landscape = emulation.width > emulation.height
  return {
    height: landscape ? emulation.width : emulation.height,
    id: matchDevicePreset({ height: emulation.height, width: emulation.width }),
    landscape,
    userAgent: emulation.userAgent ?? DEVICE_CUSTOM_USER_AGENT,
    width: landscape ? emulation.height : emulation.width,
  }
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
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const previewRequestRef = React.useRef(0)
  const [address, setAddress] = React.useState(state.navigation.url === "about:blank" ? "" : state.navigation.url)
  const [previewDataUrl, setPreviewDataUrl] = React.useState<string | null>(null)
  const [device, setDevice] = React.useState<DeviceEmulationState | null>(() => restoreDeviceState(state.device))
  const [stageSize, setStageSize] = React.useState({ height: 0, width: 0 })
  /** 宽高输入草稿（聚焦编辑中）；失焦/回车提交，非法值丢弃。 */
  const [sizeDraft, setSizeDraft] = React.useState<{ h: string; w: string } | null>(null)
  /** Whether the native WebContentsView is currently visible (shown via IPC). */
  const nativeViewVisibleRef = React.useRef(false)
  /** Mount 时若未在模拟，跳过首次 applyDeviceOverrides（主进程本就是默认态）。 */
  const skipInitialDeviceSyncRef = React.useRef(!state.device)
  /** 用户手动缩放（独立于设备模拟的 fit 缩放）；ref 供 show 闭包读取。 */
  const [zoom, setZoomState] = React.useState(1)
  const zoomRef = React.useRef(1)

  React.useEffect(() => {
    setAddress(state.navigation.url === "about:blank" ? "" : state.navigation.url)
  }, [state.navigation.url])

  // 测量舞台可用空间，模拟设备框按 min(1, fit) 缩放置中。
  React.useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(() => {
      const rect = stage.getBoundingClientRect()
      setStageSize({ height: rect.height, width: rect.width })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const emulatedViewport = device ? deviceViewport(device) : null
  const deviceScale = emulatedViewport
    ? deviceFitScale(
        { height: Math.max(0, stageSize.height - 24), width: Math.max(0, stageSize.width - 24) },
        emulatedViewport,
      )
    : 1

  // 设备/UA 变化 → 通知主进程（UA 变化时主进程负责 reload）。
  React.useEffect(() => {
    if (skipInitialDeviceSyncRef.current) {
      skipInitialDeviceSyncRef.current = false
      if (!device) return
    }
    const viewport = device ? deviceViewport(device) : null
    void browserService
      .invoke("applyDeviceOverrides", {
        device:
          device && viewport ? { height: viewport.height, userAgent: device.userAgent, width: viewport.width } : null,
        sessionId,
      })
      .catch((cause: unknown) => {
        reportRendererHandledError("browser", "apply device overrides failed", cause)
      })
  }, [browserService, device, sessionId])

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
      // 模拟视口按设备框实际宽 / 目标 CSS 宽换算缩放；普通模式用用户手动缩放。
      const viewport = device ? deviceViewport(device) : null
      void browserService
        .invoke("show", { bounds, sessionId, zoom: viewport ? bounds.width / viewport.width : zoomRef.current })
        .catch((cause: unknown) => {
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
  }, [browserService, device, refreshPreview, sessionId])

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

  const runPanelAction = React.useCallback(
    (action: "saveScreenshot" | "clearCookies" | "clearCache", successMessage: string): void => {
      const promise =
        action === "saveScreenshot" ? browserService.invoke("saveScreenshot", sessionId) : browserService.invoke(action)
      void promise
        .then(() => toast.success(successMessage))
        .catch((cause: unknown) => {
          reportRendererHandledError("browser", `browser ${action} failed`, cause)
          toast.error(t("browser.actionFailed"))
        })
    },
    [browserService, sessionId, t],
  )

  const loadBlank = React.useCallback((): void => {
    void browserService.invoke("loadBlank", sessionId).catch((cause: unknown) => {
      reportRendererHandledError("browser", "load blank page failed", cause)
      toast.error(t("browser.actionFailed"))
    })
  }, [browserService, sessionId, t])

  // 手动缩放：设备模拟时由 fit 自动控制，忽略手动档位。
  const changeZoom = React.useCallback(
    (next: number): void => {
      if (device) return
      const clamped = Math.min(5, Math.max(0.25, Math.round(next * 100) / 100))
      zoomRef.current = clamped
      setZoomState(clamped)
      void browserService.invoke("setZoom", sessionId, clamped).catch((cause: unknown) => {
        reportRendererHandledError("browser", "set browser zoom failed", cause)
      })
    },
    [browserService, device, sessionId],
  )

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

  const toggleDevice = (): void => {
    setSizeDraft(null)
    if (device) {
      setDevice(null)
      return
    }
    const preset = BROWSER_DEVICE_PRESETS.find((item) => item.id === "iphone-15-pro") ?? BROWSER_DEVICE_PRESETS[0]!
    setDevice({
      height: preset.height,
      id: preset.id,
      landscape: false,
      userAgent: preset.userAgent,
      width: preset.width,
    })
  }

  const applyPreset = (presetId: string): void => {
    const preset = BROWSER_DEVICE_PRESETS.find((item) => item.id === presetId)
    if (!preset || !device) return
    setSizeDraft(null)
    setDevice({
      height: preset.height,
      id: preset.id,
      landscape: false,
      userAgent: preset.userAgent,
      width: preset.width,
    })
  }

  const commitSizeDraft = (): void => {
    if (sizeDraft && device) {
      const width = parseDeviceDimension(sizeDraft.w)
      const height = parseDeviceDimension(sizeDraft.h)
      if (width && height) setDevice({ ...device, id: "custom", width, height })
    }
    setSizeDraft(null)
  }

  const deviceSizeInputClass =
    "h-7 w-14 rounded-md border border-border bg-background px-1.5 text-center text-xs tabular-nums outline-none focus:border-ring"

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
        <button
          type="button"
          className={cn(toolbarButtonClass, device && "bg-accent text-foreground")}
          title={t("browser.deviceEmulation")}
          aria-label={t("browser.deviceEmulation")}
          aria-pressed={Boolean(device)}
          onClick={toggleDevice}
        >
          <Smartphone className="size-4" />
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
        <DropdownMenu>
          <DropdownMenuTrigger className={toolbarButtonClass} title={t("browser.more")} aria-label={t("browser.more")}>
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onSelect={() => runPanelAction("saveScreenshot", t("browser.screenshotSaved"))}
              disabled={!state.navigation.url || state.navigation.url === "about:blank"}
            >
              <Camera />
              {t("browser.saveScreenshot")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={loadBlank}>
              <FileX2 />
              {t("browser.blankPage")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* 缩放行：设备模拟时由 fit 自动控制，禁用手动档位。 */}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className={cn("text-xs", device && "text-muted-foreground/60")}>{t("browser.zoom")}</span>
              <div
                className="flex h-7 items-center overflow-hidden rounded-md border border-border"
                title={device ? t("browser.zoomUnavailable") : undefined}
              >
                <button
                  type="button"
                  className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  disabled={Boolean(device) || zoom <= 0.25}
                  aria-label={t("browser.zoomOut")}
                  onClick={() => changeZoom(zoom - 0.1)}
                >
                  <Minus className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="min-w-12 border-x border-border px-1.5 text-center text-xs text-foreground tabular-nums transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
                  disabled={Boolean(device)}
                  aria-label={t("browser.zoomReset")}
                  title={t("browser.zoomReset")}
                  onClick={() => changeZoom(1)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  disabled={Boolean(device) || zoom >= 5}
                  aria-label={t("browser.zoomIn")}
                  onClick={() => changeZoom(zoom + 0.1)}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => runPanelAction("clearCookies", t("browser.clearDone"))}>
              {t("browser.clearCookies")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runPanelAction("clearCache", t("browser.clearDone"))}>
              {t("browser.clearCache")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {device ? (
        <div className="flex h-[33px] shrink-0 items-center gap-1.5 border-b border-border px-2 [-webkit-app-region:no-drag]">
          <Select value={device.id} onValueChange={applyPreset}>
            <SelectTrigger className="h-7 w-36 rounded-md text-xs" aria-label={t("browser.devicePreset")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
              {BROWSER_DEVICE_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">{t("browser.deviceCustom")}</SelectItem>
            </SelectContent>
          </Select>
          <input
            value={sizeDraft?.w ?? String(emulatedViewport?.width ?? "")}
            aria-label={t("browser.deviceWidth")}
            inputMode="numeric"
            className={deviceSizeInputClass}
            onFocus={(event) =>
              setSizeDraft({ h: String(emulatedViewport?.height ?? ""), w: event.currentTarget.value })
            }
            onChange={(event) => setSizeDraft((draft) => ({ h: draft?.h ?? "", w: event.currentTarget.value }))}
            onBlur={commitSizeDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
          <span className="text-xs text-muted-foreground">×</span>
          <input
            value={sizeDraft?.h ?? String(emulatedViewport?.height ?? "")}
            aria-label={t("browser.deviceHeight")}
            inputMode="numeric"
            className={deviceSizeInputClass}
            onFocus={(event) =>
              setSizeDraft({ w: String(emulatedViewport?.width ?? ""), h: event.currentTarget.value })
            }
            onChange={(event) => setSizeDraft((draft) => ({ w: draft?.w ?? "", h: event.currentTarget.value }))}
            onBlur={commitSizeDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
          <button
            type="button"
            className={toolbarButtonClass}
            title={t("browser.deviceRotate")}
            aria-label={t("browser.deviceRotate")}
            onClick={() => setDevice({ ...device, landscape: !device.landscape })}
          >
            <ArrowLeftRight className="size-4" />
          </button>
        </div>
      ) : null}
      <div ref={stageRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        {emulatedViewport ? (
          <div className="absolute inset-0 grid place-items-center overflow-hidden bg-muted/30 p-3">
            <div
              ref={browserSlotRef}
              className="relative overflow-hidden rounded-xl border border-border shadow-sm"
              style={{ height: emulatedViewport.height * deviceScale, width: emulatedViewport.width * deviceScale }}
            >
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
        ) : (
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
        )}
      </div>
    </section>
  )
}
