import { describe, expect, it } from "vitest"
import { isTrustedIpcSender } from "./ipc-guard.ts"

const guardOptions = { viteDevServerUrl: "http://localhost:5273", rendererBaseUrl: "file:///C:/app/dist/" }

function fakeEvent(url: string, isMainFrame: boolean): Parameters<typeof isTrustedIpcSender>[0] {
  // 真实 WebContents 中主 frame 的 senderFrame 与 sender.mainFrame 是同一对象引用。
  const mainFrame = { url }
  const sender = { mainFrame: isMainFrame ? mainFrame : {} } as unknown as Electron.WebContents
  return {
    sender,
    senderFrame: isMainFrame ? mainFrame : { url },
  } as unknown as Parameters<typeof isTrustedIpcSender>[0]
}

describe("isTrustedIpcSender", () => {
  it("accepts the dev server main frame", () => {
    expect(isTrustedIpcSender(fakeEvent("http://localhost:5273/chat", true), guardOptions)).toBe(true)
  })

  it("rejects a different origin even in the main frame", () => {
    expect(isTrustedIpcSender(fakeEvent("http://evil.example.com/", true), guardOptions)).toBe(false)
  })

  it("rejects a subframe (iframe/webview) even with a trusted URL", () => {
    expect(isTrustedIpcSender(fakeEvent("http://localhost:5273/chat", false), guardOptions)).toBe(false)
  })

  it("rejects a missing sender frame", () => {
    const event = { sender: { mainFrame: { url: "http://localhost:5273/" } } } as unknown as Parameters<
      typeof isTrustedIpcSender
    >[0]
    expect(isTrustedIpcSender(event, guardOptions)).toBe(false)
  })

  it("accepts a packaged renderer file URL inside the dist directory", () => {
    const packaged = { viteDevServerUrl: undefined, rendererBaseUrl: "file:///C:/app/resources/app.asar/dist/" }
    expect(isTrustedIpcSender(fakeEvent("file:///C:/app/resources/app.asar/dist/index.html", true), packaged)).toBe(
      true,
    )
  })

  it("rejects a file URL outside the dist directory", () => {
    const packaged = { viteDevServerUrl: undefined, rendererBaseUrl: "file:///C:/app/resources/app.asar/dist/" }
    expect(isTrustedIpcSender(fakeEvent("file:///C:/Users/evil/secret.html", true), packaged)).toBe(false)
  })
})
