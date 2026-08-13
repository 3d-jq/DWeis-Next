import type { AttachmentPickerKind, SaveClipboardAttachmentInput, SelectedAttachmentPath } from "./attachment-picker.ts"
import type { CreateSpreadsheetPreview } from "./chat/spreadsheet-agent-input.ts"
import type { TrustedIpcSenderOptions } from "./ipc-guard.ts"

import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { branding } from "./branding.ts"
import { randomUUID } from "node:crypto"
import { chmod, copyFile, mkdir, rename, rm, stat } from "node:fs/promises"
import path from "node:path"
import { isAttachmentPickerKind } from "./attachment-picker.ts"
import { mimeFromFile } from "./chat/artifacts.ts"
import { saveClipboardAttachment } from "./chat/clipboard-attachment.ts"
import { createSpreadsheetAgentInput } from "./chat/spreadsheet-agent-input.ts"
import { isTrustedIpcSender } from "./ipc-guard.ts"

interface AttachmentDialogHandlerOptions {
  createSpreadsheetPreview?: CreateSpreadsheetPreview
  rememberProjectPath?: (directoryPath: string) => void
  userDataDir?: string
}

interface TrustedPathSink {
  add(filePath: string): unknown
  delete(filePath: string): boolean
}

function managedAttachmentName(name: string): string {
  const normalized = path
    .basename(name)
    .replace(/[<>:"/\\|?*]/g, "_")
    .replaceAll(/./g, (character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .trim()
    .slice(0, 160)
  return normalized && normalized !== "." && normalized !== ".." ? normalized : "attachment"
}

export async function releaseManagedAttachmentPaths(
  userDataDir: string,
  trustedPaths: Pick<TrustedPathSink, "delete">,
  filePaths: readonly string[],
): Promise<void> {
  const attachmentRoot = path.resolve(userDataDir, "attachments")
  const originalRoot = path.join(attachmentRoot, "originals")
  const removableFileRoots = new Set([path.join(attachmentRoot, "agent"), path.join(attachmentRoot, "clipboard")])
  for (const candidate of new Set(filePaths.map((item) => item.trim()).filter(Boolean))) {
    if (!trustedPaths.delete(candidate)) continue
    const resolved = path.resolve(candidate)
    const directory = path.dirname(resolved)
    if (path.dirname(directory) === originalRoot) {
      await chmod(directory, 0o700).catch(() => undefined)
      await rm(directory, { force: true, recursive: true })
    } else if (removableFileRoots.has(directory)) {
      await rm(resolved, { force: true })
    }
  }
}

/** 文件附件先冻结到 DWeis 私有目录；后续预览、提取和 agent 工具均不得读写用户源文件。 */
export async function snapshotSelectedAttachment(
  userDataDir: string,
  item: SelectedAttachmentPath,
): Promise<SelectedAttachmentPath> {
  if (item.kind !== "file") return item
  const snapshotDirectory = path.join(userDataDir, "attachments", "originals", randomUUID())
  const finalPath = path.join(snapshotDirectory, managedAttachmentName(item.name))
  const temporaryPath = `${finalPath}.tmp-${process.pid}-${randomUUID()}`
  try {
    const sourceBefore = await stat(item.path)
    if (!sourceBefore.isFile() || sourceBefore.size !== item.size) {
      throw new Error(`Attachment changed before ${branding.appName} could create its immutable snapshot.`)
    }
    await mkdir(snapshotDirectory, { recursive: true })
    await copyFile(item.path, temporaryPath)
    await chmod(temporaryPath, 0o600)
    const [copied, sourceAfter] = await Promise.all([stat(temporaryPath), stat(item.path)])
    if (
      !copied.isFile() ||
      copied.size !== item.size ||
      sourceAfter.size !== sourceBefore.size ||
      sourceAfter.mtimeMs !== sourceBefore.mtimeMs
    ) {
      throw new Error(`Attachment changed while ${branding.appName} was creating its immutable snapshot.`)
    }
    await rename(temporaryPath, finalPath)
    await chmod(finalPath, 0o400)
    await chmod(snapshotDirectory, 0o500)
    return { ...item, path: finalPath }
  } catch (error) {
    await rm(snapshotDirectory, { force: true, recursive: true })
    throw error
  }
}

export async function prepareSelectedAttachment(
  userDataDir: string,
  item: SelectedAttachmentPath | null,
  createSpreadsheetPreview: CreateSpreadsheetPreview | undefined,
  remember: (filePath: string) => void,
  reportFailure: (error: unknown) => void,
): Promise<SelectedAttachmentPath | null> {
  if (!item || item.kind !== "file") return item
  let snapshot: SelectedAttachmentPath
  try {
    snapshot = await snapshotSelectedAttachment(userDataDir, item)
  } catch (error) {
    reportFailure(error)
    throw error
  }
  if (!createSpreadsheetPreview) return snapshot
  try {
    const agentInput = await createSpreadsheetAgentInput(userDataDir, snapshot, createSpreadsheetPreview)
    if (!agentInput) return snapshot
    remember(agentInput.agentPath)
    return { ...snapshot, ...agentInput }
  } catch (error) {
    reportFailure(error)
    return snapshot
  }
}

export function registerAttachmentDialogHandlers(
  trustedPaths: TrustedPathSink,
  ipcGuard: TrustedIpcSenderOptions,
  options: AttachmentDialogHandlerOptions = {},
): void {
  const userDataDir = options.userDataDir ?? app.getPath("userData")
  const guard = ipcGuard
  const remember = (filePath: string): void => {
    if (filePath.trim()) trustedPaths.add(filePath)
  }

  const prepare = (item: SelectedAttachmentPath | null): Promise<SelectedAttachmentPath | null> =>
    prepareSelectedAttachment(userDataDir, item, options.createSpreadsheetPreview, remember, (error) => {
      console.warn("[dweis] failed to prepare spreadsheet attachment:", error)
    })

  ipcMain.handle("dweis:select-attachment-paths", async (event, kind: unknown): Promise<SelectedAttachmentPath[]> => {
    if (!isTrustedIpcSender(event, guard)) return []
    assertAttachmentPickerKind(kind)
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const properties = attachmentDialogProperties(kind, process.platform)
    const result = parent
      ? await dialog.showOpenDialog(parent, { properties })
      : await dialog.showOpenDialog({ properties })
    if (result.canceled) return []
    const items: SelectedAttachmentPath[] = []
    for (const filePath of result.filePaths) {
      const item = await prepare(await selectedAttachmentPath(filePath))
      if (item) items.push(item)
    }
    for (const item of items) remember(item.path)
    return items
  })

  ipcMain.handle(
    "dweis:save-clipboard-attachment",
    async (event, req: SaveClipboardAttachmentInput): Promise<SelectedAttachmentPath> => {
      if (!isTrustedIpcSender(event, guard)) {
        throw new Error("Untrusted IPC sender.")
      }
      const attachment = await saveClipboardAttachment(userDataDir, req)
      try {
        const prepared = (await prepare({ ...attachment, kind: "file" })) ?? { ...attachment, kind: "file" }
        remember(prepared.path)
        return prepared
      } finally {
        await rm(attachment.path, { force: true })
      }
    },
  )

  ipcMain.handle("dweis:release-attachment-paths", async (event, filePaths: unknown): Promise<void> => {
    if (!isTrustedIpcSender(event, guard)) return
    if (!Array.isArray(filePaths) || !filePaths.every((item) => typeof item === "string")) {
      throw new Error("Invalid attachment paths.")
    }
    await releaseManagedAttachmentPaths(userDataDir, trustedPaths, filePaths)
  })

  ipcMain.handle("dweis:selected-attachment-path-for-file", async (event, filePath: unknown) => {
    if (!isTrustedIpcSender(event, guard)) return null
    if (typeof filePath !== "string" || !filePath.trim()) return null
    const item = await prepare(await selectedAttachmentPath(filePath))
    if (item) remember(item.path)
    return item
  })

  ipcMain.handle("dweis:select-project-directory", async (event): Promise<SelectedAttachmentPath | null> => {
    if (!isTrustedIpcSender(event, guard)) return null
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const dialogOptions: Electron.OpenDialogOptions = { properties: ["openDirectory", "createDirectory"] }
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || !result.filePaths[0]) return null
    const directoryPath = result.filePaths[0]
    options.rememberProjectPath?.(directoryPath)
    return {
      name: path.basename(directoryPath.replace(/[\\/]+$/, "")) || directoryPath,
      mime: "inode/directory",
      size: 0,
      path: directoryPath,
      kind: "directory",
    }
  })

  // 数据根目录选择：仅返回路径，不进入附件信任链（设置页数据迁移用）。
  ipcMain.handle("dweis:select-data-directory", async (event): Promise<string | null> => {
    if (!isTrustedIpcSender(event, guard)) return null
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "Select data directory",
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
}

function assertAttachmentPickerKind(kind: unknown): asserts kind is AttachmentPickerKind {
  if (!isAttachmentPickerKind(kind)) throw new Error("Invalid attachment picker kind.")
}

function attachmentDialogProperties(
  kind: AttachmentPickerKind,
  platform: NodeJS.Platform,
): NonNullable<Electron.OpenDialogOptions["properties"]> {
  switch (kind) {
    case "file":
      return ["openFile", "multiSelections"]
    case "directory":
      return ["openDirectory", "multiSelections"]
    case "file-or-directory":
      if (platform !== "darwin") throw new Error("Selecting files and folders together is only supported on macOS.")
      return ["openFile", "openDirectory", "multiSelections"]
  }
}

async function selectedAttachmentPath(filePath: string): Promise<SelectedAttachmentPath | null> {
  try {
    const info = await stat(filePath)
    const kind = info.isDirectory() ? "directory" : "file"
    return {
      name: path.basename(filePath.replace(/[\\/]+$/, "")) || filePath,
      mime: kind === "directory" ? "inode/directory" : await mimeFromFile(filePath, info.size),
      size: kind === "file" ? info.size : 0,
      path: filePath,
      kind,
    }
  } catch {
    return null
  }
}
