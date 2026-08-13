import type { AppCommand } from "./app-command.ts"
import type { AppLocale } from "./app-locale.ts"
import type { AttachmentPickerKind, SaveClipboardAttachmentInput, SelectedAttachmentPath } from "./attachment-picker.ts"

export type { AttachmentPickerKind, SaveClipboardAttachmentInput, SelectedAttachmentPath } from "./attachment-picker.ts"

import { setupConnectionPreload } from "@oomol/connection-electron-adapter/preload"
import { contextBridge, ipcRenderer, webUtils } from "electron"
import { APP_COMMAND_CHANNEL, isAppCommand } from "./app-command.ts"
import { APP_LOCALE_CHANNEL } from "./app-locale.ts"
import { branding } from "./branding.ts"
import { WRITE_CLIPBOARD_TEXT_CHANNEL } from "./clipboard-common.ts"

declare const __APP_COMMIT__: string | undefined
declare const __APP_VERSION__: string | undefined

export interface RendererErrorReport {
  message: string
  source: "error" | "handled" | "unhandledrejection"
  scope?: string
  stack?: string
  suppressedCount?: number
}

export interface DWeisBridge {
  appCommit: string
  onAppCommand(callback: (command: AppCommand) => void): () => void
  platform: NodeJS.Platform
  reportRendererError(input: RendererErrorReport): void
  releaseAttachmentPaths(filePaths: string[]): Promise<void>
  saveClipboardAttachment(input: SaveClipboardAttachmentInput): Promise<SelectedAttachmentPath>
  selectedAttachmentPathForFile(file: File): Promise<SelectedAttachmentPath | null>
  selectAttachmentPaths(kind: AttachmentPickerKind): Promise<SelectedAttachmentPath[]>
  selectProjectDirectory(): Promise<SelectedAttachmentPath | null>
  selectDataDirectory(): Promise<string | null>
  relaunchApp(): Promise<void>
  setAppLocale(locale: AppLocale): void
  version: string
  writeClipboardText(text: string): Promise<void>
  getWindowBounds(): Promise<{ x: number; y: number; width: number; height: number }>
  setWindowBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>
}

declare global {
  // 全局 bridge 名与 branding.windowBridge 一致（值为 "dweisnext"）。
  var dweisnext: DWeisBridge
}

// @oomol/connection 的 RPC 桥接，仅此一行即可让 renderer 的 ElectronClientAdapter 找到通道。
setupConnectionPreload()

const dweis: DWeisBridge = {
  appCommit: typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "unknown",
  onAppCommand: (callback: (command: AppCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: unknown): void => {
      if (isAppCommand(command)) {
        callback(command)
      }
    }
    ipcRenderer.on(APP_COMMAND_CHANNEL, listener)
    return () => ipcRenderer.removeListener(APP_COMMAND_CHANNEL, listener)
  },
  platform: process.platform,
  reportRendererError: (input: RendererErrorReport) => ipcRenderer.send("dweis:renderer-error", input),
  releaseAttachmentPaths: (filePaths: string[]) =>
    ipcRenderer.invoke("dweis:release-attachment-paths", filePaths) as Promise<void>,
  saveClipboardAttachment: (input: SaveClipboardAttachmentInput) =>
    ipcRenderer.invoke("dweis:save-clipboard-attachment", input) as Promise<SelectedAttachmentPath>,
  selectedAttachmentPathForFile: (file: File) => {
    let filePath = ""
    try {
      filePath = webUtils.getPathForFile(file)
    } catch {
      return Promise.resolve(null)
    }
    return filePath
      ? (ipcRenderer.invoke(
          "dweis:selected-attachment-path-for-file",
          filePath,
        ) as Promise<SelectedAttachmentPath | null>)
      : Promise.resolve(null)
  },
  selectAttachmentPaths: (kind: AttachmentPickerKind) =>
    ipcRenderer.invoke("dweis:select-attachment-paths", kind) as Promise<SelectedAttachmentPath[]>,
  selectProjectDirectory: () =>
    ipcRenderer.invoke("dweis:select-project-directory") as Promise<SelectedAttachmentPath | null>,
  selectDataDirectory: () => ipcRenderer.invoke("dweis:select-data-directory") as Promise<string | null>,
  relaunchApp: () => ipcRenderer.invoke("dweis:relaunch-app") as Promise<void>,
  setAppLocale: (locale: AppLocale) => ipcRenderer.send(APP_LOCALE_CHANNEL, locale),
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
  writeClipboardText: (text: string) => ipcRenderer.invoke(WRITE_CLIPBOARD_TEXT_CHANNEL, text) as Promise<void>,
  getWindowBounds: () =>
    ipcRenderer.invoke("dweis:window:get-bounds") as Promise<{ x: number; y: number; width: number; height: number }>,
  setWindowBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke("dweis:window:set-bounds", bounds) as Promise<void>,
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld(branding.windowBridge, dweis)
  } catch (error) {
    console.error("[dweis] failed to expose preload bridge:", error)
    ipcRenderer.send("dweis:renderer-error", {
      message: "Failed to expose preload bridge",
      source: "handled",
      scope: "preload.exposeBridge",
      stack: error instanceof Error ? error.stack : undefined,
    } satisfies RendererErrorReport)
  }
} else {
  window.dweisnext = dweis
}
