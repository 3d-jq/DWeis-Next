import { clipboard, ipcMain } from "electron"
import { WRITE_CLIPBOARD_TEXT_CHANNEL } from "./clipboard-common.ts"
import type { TrustedIpcSenderOptions } from "./ipc-guard.ts"
import { isTrustedIpcSender } from "./ipc-guard.ts"

export function registerClipboardHandler(guard: TrustedIpcSenderOptions): void {
  ipcMain.handle(WRITE_CLIPBOARD_TEXT_CHANNEL, (event, text: unknown): void => {
    if (!isTrustedIpcSender(event, guard)) {
      return
    }
    if (typeof text !== "string") {
      throw new Error("Clipboard text must be a string.")
    }
    clipboard.writeText(text)
  })
}
