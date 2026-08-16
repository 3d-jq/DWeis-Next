import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export interface AtomicWriteTextOptions {
  mode?: number
}

// 同文件写入链：串行化同进程内对同一文件的并发原子写（win32 下并发 rename 覆盖会 EPERM）。
const fileWriteChains = new Map<string, Promise<void>>()

const renameRetryAttempts = 5
const renameRetryBaseDelayMs = 25

async function renameWithRetry(temporaryPath: string, filePath: string): Promise<void> {
  for (let attempt = 0; attempt < renameRetryAttempts; attempt += 1) {
    try {
      await rename(temporaryPath, filePath)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Windows 上目标被其他句柄短暂占用（含安全软件扫描）时 rename 会 EPERM，退避重试。
      if (code === "EPERM" && attempt < renameRetryAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, renameRetryBaseDelayMs * (attempt + 1)))
        continue
      }
      throw error
    }
  }
}

/** 统一异步文本文件的同目录临时写入、原子替换和失败清理。 */
export async function atomicWriteText(
  filePath: string,
  content: string,
  options: AtomicWriteTextOptions = {},
): Promise<void> {
  const previous = fileWriteChains.get(filePath) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(() => writeAtomicFile(filePath, content, options))
  fileWriteChains.set(filePath, next)
  try {
    await next
  } finally {
    if (fileWriteChains.get(filePath) === next) {
      fileWriteChains.delete(filePath)
    }
  }
}

async function writeAtomicFile(filePath: string, content: string, options: AtomicWriteTextOptions): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    })
    await renameWithRetry(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
