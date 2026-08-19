// @vitest-environment happy-dom

import type { BrowserPageState } from "../../../electron/browser/common.ts"
import type { BrowserService } from "../../../electron/browser/common.ts"
import type { ConnectionClientService } from "@oomol/connection"
import type { Root } from "react-dom/client"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BrowserPanel } from "./BrowserPanel.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

const state: BrowserPageState = {
  crashed: false,
  device: null,
  sessionId: "session-1",
  visible: true,
  navigation: {
    canGoBack: true,
    canGoForward: true,
    loading: false,
    title: "Example",
    url: "https://example.com",
  },
}

function panelElement(browserService: ConnectionClientService<BrowserService>): React.ReactElement {
  return React.createElement(
    I18nContext.Provider,
    {
      value: {
        locale: "zh-CN",
        setLocale: () => undefined,
        t: (key, vars) => translate("zh-CN", key, vars),
      },
    },
    React.createElement(BrowserPanel, {
      browserService,
      sessionId: "session-1",
      state,
      onSetTitle: () => undefined,
      maximized: false,
      onToggleMaximized: () => undefined,
    }),
  )
}

function renderPanel(): string {
  return renderToStaticMarkup(panelElement({} as ConnectionClientService<BrowserService>))
}

async function renderInteractivePanel(invoke: ReturnType<typeof vi.fn>): Promise<Root> {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      panelElement({
        invoke,
      } as unknown as ConnectionClientService<BrowserService>),
    )
  })
  return root
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("BrowserPanel native view visibility", () => {
  it("hides the native page behind a modal and restores it after the modal closes", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 600,
      right: 1100,
      top: 100,
      width: 500,
      x: 600,
      y: 100,
      toJSON: () => undefined,
    })
    const previewDataUrl = "data:image/png;base64,cHJldmlldw=="
    const invoke = vi.fn(async (action: string) => (action === "capturePreview" ? previewDataUrl : undefined))
    const overlay = document.createElement("div")
    overlay.setAttribute("aria-modal", "true")
    document.body.append(overlay)
    const root = await renderInteractivePanel(invoke)

    expect(invoke).toHaveBeenCalledWith("hide", "session-1")
    expect(document.querySelector(`img[src="${previewDataUrl}"]`)).not.toBeNull()

    overlay.remove()
    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })

    expect(invoke).toHaveBeenCalledWith("show", {
      bounds: { height: 400, width: 500, x: 600, y: 100 },
      sessionId: "session-1",
      zoom: 1,
    })
    // After show succeeds the snapshot must be cleared to avoid overlapping the native view
    expect(document.querySelector("img")).toBeNull()

    act(() => root.unmount())
  })

  it("hides after an in-flight show when a modal opens", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 600,
      right: 1100,
      top: 100,
      width: 500,
      x: 600,
      y: 100,
      toJSON: () => undefined,
    })
    let resolveShow!: () => void
    const pendingShow = new Promise<void>((resolve) => {
      resolveShow = resolve
    })
    const invoke = vi.fn((action: string) => {
      if (action === "show") return pendingShow
      return Promise.resolve(null)
    })
    const root = await renderInteractivePanel(invoke)

    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })
    expect(invoke).toHaveBeenCalledWith("show", {
      bounds: { height: 400, width: 500, x: 600, y: 100 },
      sessionId: "session-1",
      zoom: 1,
    })

    const overlay = document.createElement("div")
    overlay.setAttribute("aria-modal", "true")
    await act(async () => {
      document.body.append(overlay)
      await Promise.resolve()
    })

    resolveShow()
    await act(async () => {
      await pendingShow
      await Promise.resolve()
    })

    const visibilityActions = invoke.mock.calls
      .map(([action]) => action)
      .filter((action) => action === "show" || action === "hide")
    expect(visibilityActions.at(-1)).toBe("hide")

    act(() => root.unmount())
  })

  it("clears the preview snapshot when the native view becomes visible", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 600,
      right: 1100,
      top: 100,
      width: 500,
      x: 600,
      y: 100,
      toJSON: () => undefined,
    })
    const invoke = vi.fn(async (action: string) =>
      action === "capturePreview" ? "data:image/png;base64,cHJldmlldw==" : undefined,
    )
    const root = await renderInteractivePanel(invoke)

    // Wait for show to complete and the loading-effect snapshot to be captured
    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      await Promise.resolve()
    })

    expect(invoke).toHaveBeenCalledWith("show", {
      bounds: { height: 400, width: 500, x: 600, y: 100 },
      sessionId: "session-1",
      zoom: 1,
    })

    // After show succeeds, preview must be cleared (no overlapping snapshot on native view)
    expect(document.querySelector("img")).toBeNull()

    act(() => root.unmount())
  })
})

describe("BrowserPanel titlebar drag regions", () => {
  it("makes toolbar whitespace draggable while keeping every control interactive", () => {
    const html = renderPanel()

    expect(html).toMatch(/oo-titlebar[^"]*\[-webkit-app-region:drag\]/u)
    expect(html.match(/\[-webkit-app-region:no-drag\]/gu)).toHaveLength(7)
    expect(html).toMatch(/<form class="[^"]*\[-webkit-app-region:no-drag\]/u)
  })
})
