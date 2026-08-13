import { app } from "electron"
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import path from "node:path"
import type { PersistedSettings } from "./settings/store.ts"
import { SettingsStore } from "./settings/store.ts"

/**
 * 数据存储路径：应用数据（会话、技能、设置、Agent 工作区等）的根目录。
 *
 * 设计：
 * - 默认值为 `用户主目录/DWeisNext`（与 Electron 默认的 %APPDATA%/dweisnext 解耦，方便用户找到数据）。
 * - 启动早期（main.ts，所有 store 构造之前）调用 applyPersistedDataDirectory()：
 *   从"固定默认位置"的 settings.json 读取 dataDirectory 记录并 setPath；无记录时（首次/升级）
 *   自动把默认位置已有数据复制到默认目标并记录，之后数据一律落在目标位置。
 * - 设置页修改路径时由 SettingsServiceImpl.setDataDirectory 复制数据，并把新路径记录到
 *   固定默认位置的 settings.json（下次启动据此定位，与本次 setPath 无关）。
 */

/** 固定默认位置：未做任何覆盖时 Electron 的 userData（如 %APPDATA%/dweisnext）。 */
export function legacyDefaultUserDataDir(): string {
  return app.getPath("userData")
}

/** 数据根目录默认值：用户主目录下的 DWeisNext 文件夹。 */
export function defaultDataDirectory(): string {
  return path.join(app.getPath("home"), "DWeisNext")
}

function readPersistedSettings(dir: string): Record<string, unknown> {
  try {
    const parsed = new SettingsStore(dir).read()
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 读取指定位置 settings.json 中记录的 dataDirectory（未设置/非法返回 undefined）。 */
function readDataDirectoryRecord(dir: string): string | undefined {
  const value = readPersistedSettings(dir)["dataDirectory"]
  if (typeof value !== "string") {
    return undefined
  }
  const normalized = value.trim()
  if (!normalized || !path.isAbsolute(normalized)) {
    return undefined
  }
  return path.normalize(normalized)
}

/** 读取默认位置 settings.json 中记录的 dataDirectory（未设置/非法返回 undefined）。 */
export function readPersistedDataDirectory(): string | undefined {
  // 1. 当前固定默认位置（%APPDATA%/<appName>）。
  const fromCurrent = readDataDirectoryRecord(legacyDefaultUserDataDir())
  if (fromCurrent) {
    return fromCurrent
  }
  // 2. 早期版本的记录位置 bug：记录被写进数据目录自身（~/DWeisNext/settings.json）
  //    而非固定默认位置，导致退出重开后读不到、数据目录"消失"。数据目录自描述时兜底使用。
  //    注意：不能读取 %APPDATA%/dweis——那是同名的另一个应用（原版 DWeis）的数据目录。
  const selfRecorded = readDataDirectoryRecord(defaultDataDirectory())
  if (selfRecorded) {
    return selfRecorded
  }
  return undefined
}

/** 把 dataDirectory 记录写入固定默认位置 + 数据目录自身的 settings.json（合并保留其他字段）。
 * 双写原因：主记录在默认位置（%APPDATA%），但完全重装时旧版卸载/清理可能把它一起删掉，
 * 导致数据目录"消失"；数据目录自记录供 readPersistedDataDirectory 兜底（见其第 2 步）。 */
export function writeDataDirectoryRecord(dir: string): void {
  const target = path.normalize(dir)
  for (const location of new Set([legacyDefaultUserDataDir(), target])) {
    const settings = readPersistedSettings(location)
    settings["dataDirectory"] = target
    new SettingsStore(location).write(settings as unknown as PersistedSettings)
  }
}

function isEmptyDirectory(dir: string): boolean {
  if (!existsSync(dir)) {
    return true
  }
  try {
    return readdirSync(dir).length === 0
  } catch {
    return false
  }
}

function directoryHasData(dir: string): boolean {
  if (!existsSync(dir)) {
    return false
  }
  try {
    return readdirSync(dir).length > 0
  } catch {
    return false
  }
}

/**
 * 启动早期应用持久化的数据目录（必须在所有 store 构造之前调用）。
 * - dev 的 DWEIS_USER_DATA_DIR 环境变量已覆盖时跳过（dev 目录优先）。
 * - 有记录：直接 setPath 到记录位置（目录缺失时回退默认并警告）。
 * - 无记录（首次启动/升级）：目标 = 默认 ~/DWeisNext；若默认位置已有数据且目标可用则复制迁移；
 *   然后 setPath 目标并写入记录。
 */
export function applyPersistedDataDirectory(): void {
  const currentDir = path.normalize(app.getPath("userData"))
  const recorded = readPersistedDataDirectory()

  if (recorded && recorded !== currentDir) {
    if (existsSync(recorded)) {
      app.setPath("userData", recorded)
    } else {
      console.warn(`[dweis] recorded data directory missing, falling back to default: ${recorded}`)
    }
    return
  }

  const target = path.normalize(defaultDataDirectory())
  if (target === currentDir) {
    return
  }

  if (isEmptyDirectory(target)) {
    if (directoryHasData(currentDir)) {
      try {
        migrateUserDataDirectorySync(currentDir, target)
      } catch (error) {
        console.warn(`[dweis] initial data migration failed, keeping default location:`, error)
        return
      }
    }
    // 记录必须先于 setPath 写入：legacyDefaultUserDataDir() 取的是动态 app.getPath("userData")，
    // setPath 之后调用会把记录写进数据目录自身，下次启动从固定默认位置读不到（数据目录"消失"）。
    writeDataDirectoryRecord(target)
    app.setPath("userData", target)
    return
  }

  // 无记录但目标目录（~/DWeisNext）已有数据：早期版本直接使用该目录，或数据目录记录曾丢失。
  // 必须采用目标目录而不是留在默认 %APPDATA% —— 否则同一应用的数据会分裂到两个位置，
  // 模型/设置/会话"重启后消失"（记录写进默认位置 settings.json，供下次启动定位；也保留
  // 默认位置遗留数据不动，避免覆盖分裂期间产生的孤儿数据）。
  console.warn(`[dweis] adopting existing default data directory: ${target}`)
  writeDataDirectoryRecord(target)
  app.setPath("userData", target)
}

/**
 * 同步递归复制整个数据目录（启动早期不允许 await）。
 * 注意：Node 在 Windows 上 cpSync 复制目录会报 EIO（Access denied），故逐文件 copyFileSync。
 */
function migrateUserDataDirectorySync(source: string, target: string): void {
  mkdirSync(target, { recursive: true })
  copyDirectoryContentsSync(source, target)
}

function copyDirectoryContentsSync(source: string, target: string): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true })
      copyDirectoryContentsSync(sourcePath, targetPath)
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      copyFileSync(sourcePath, targetPath)
    }
  }
}

/** 异步复制整个数据目录（设置页修改路径时使用）。 */
export async function migrateUserDataDirectory(source: string, target: string): Promise<void> {
  const { cp, mkdir } = await import("node:fs/promises")
  await mkdir(target, { recursive: true })
  await cp(source, target, { recursive: true })
}

/** 校验目标路径并返回归一化结果；不合法时抛出带原因的错误。 */
export function validateDataDirectoryTarget(targetPath: string): string {
  const target = path.normalize(targetPath.trim())
  if (!target || !path.isAbsolute(target)) {
    throw new Error("Data directory must be an absolute path.")
  }
  const current = path.normalize(app.getPath("userData"))
  if (target === current) {
    throw new Error("Target data directory is the same as the current one.")
  }
  if (isPathInside(target, current)) {
    throw new Error("Target data directory must not be inside the current data directory.")
  }
  if (!isEmptyDirectory(target)) {
    throw new Error("Target data directory already exists and is not empty.")
  }
  return target
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}
