import { beforeEach, describe, expect, it, vi } from "vitest"

const { handle, writeText } = vi.hoisted(() => ({
  handle: vi.fn(),
  writeText: vi.fn(),
}))

vi.mock("electron", () => ({
  clipboard: { writeText },
  ipcMain: { handle },
}))

import { WRITE_CLIPBOARD_TEXT_CHANNEL } from "./clipboard-common.ts"
import { registerClipboardHandler } from "./clipboard-handler.ts"

const guard = { viteDevServerUrl: "http://localhost:5273", rendererBaseUrl: "file:///C:/app/dist/" }

function trustedEvent(): unknown {
  const mainFrame = { url: "http://localhost:5273/chat" }
  return { sender: { mainFrame }, senderFrame: mainFrame }
}

function untrustedEvent(): unknown {
  const mainFrame = { url: "http://evil.example.com/" }
  return { sender: { mainFrame }, senderFrame: mainFrame }
}

describe("registerClipboardHandler", () => {
  beforeEach(() => {
    writeText.mockReset()
    handle.mockReset()
  })

  it("writes validated text through Electron's native clipboard", () => {
    registerClipboardHandler(guard)
    expect(handle).toHaveBeenCalledWith(WRITE_CLIPBOARD_TEXT_CHANNEL, expect.any(Function))

    const handler = handle.mock.calls[0]?.[1] as (event: unknown, text: unknown) => void
    handler(trustedEvent(), "UID: user-123")

    expect(writeText).toHaveBeenCalledWith("UID: user-123")
  })

  it("rejects non-string values", () => {
    registerClipboardHandler(guard)
    const handler = handle.mock.calls[0]?.[1] as (event: unknown, text: unknown) => void

    expect(() => handler(trustedEvent(), { text: "not allowed" })).toThrow("Clipboard text must be a string.")
    expect(writeText).not.toHaveBeenCalled()
  })

  it("ignores calls from an untrusted sender", () => {
    registerClipboardHandler(guard)
    const handler = handle.mock.calls[0]?.[1] as (event: unknown, text: unknown) => void

    handler(untrustedEvent(), "UID: user-123")

    expect(writeText).not.toHaveBeenCalled()
  })
})
