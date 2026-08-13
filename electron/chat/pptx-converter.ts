import { spawn } from "node:child_process"
import { access, copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { logDiagnostic } from "../diagnostics-log.ts"

const convertTimeoutMs = 120_000
const profileDirName = "lo-profile"

export interface PptxConverter {
  /** 把 pptx 转成 pdf（返回转换后 pdf 路径）；soffice 不可用/转换失败/超时返回 null。 */
  convertToPdf(pptxPath: string): Promise<string | null>
}

function fileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/")
  return `file:///${normalized.replace(/^\/+/, "")}`
}

/**
 * LibreOffice headless 转换服务：pptx → pdf（完整渲染图形/图片/排版），
 * 供产物预览复用 pdfjs 查看器。首次运行初始化隔离 profile 较慢（5-15s），
 * 之后按内容缓存（mtime+size 哈希），同一文件只转换一次。
 */
export function createPptxConverter(options: {
  sofficeCandidates: string[]
  cacheDir: string
}): PptxConverter {
  let resolvedSoffice: string | null | undefined

  const resolveSoffice = async (): Promise<string | null> => {
    if (resolvedSoffice !== undefined) {
      return resolvedSoffice
    }
    for (const candidate of options.sofficeCandidates) {
      try {
        await access(candidate)
        resolvedSoffice = candidate
        return candidate
      } catch {
        // 继续尝试下一个候选路径。
      }
    }
    resolvedSoffice = null
    return null
  }

  const convertToPdf = async (pptxPath: string): Promise<string | null> => {
    try {
      const source = await stat(pptxPath).catch(() => null)
      if (!source?.isFile()) {
        return null
      }
      // 缓存命中直接返回（不需要 soffice 可用）。
      const hash = createHash("sha256")
        .update(`${pptxPath}\0${source.size}\0${source.mtimeMs}`)
        .digest("hex")
        .slice(0, 24)
      await mkdir(options.cacheDir, { recursive: true })
      const cachePath = path.join(options.cacheDir, `${hash}.pdf`)
      const cached = await stat(cachePath).catch(() => null)
      if (cached?.isFile() && cached.size > 0) {
        return cachePath
      }

      const soffice = await resolveSoffice()
      if (!soffice) {
        return null
      }

      const workDir = await mkdtemp(path.join(os.tmpdir(), "dweis-pptx-convert-"))
      const profileDir = path.join(options.cacheDir, profileDirName)
      await mkdir(profileDir, { recursive: true })
      try {
        const result = await new Promise<boolean>((resolve) => {
          const child = spawn(
            soffice,
            [
              "--headless",
              `-env:UserInstallation=${fileUrl(profileDir)}`,
              "--convert-to",
              "pdf",
              "--outdir",
              workDir,
              pptxPath,
            ],
            { windowsHide: true, stdio: "ignore" },
          )
          const timer = setTimeout(() => {
            child.kill()
            resolve(false)
          }, convertTimeoutMs)
          child.on("error", () => {
            clearTimeout(timer)
            resolve(false)
          })
          child.on("exit", (code) => {
            clearTimeout(timer)
            resolve(code === 0)
          })
        })
        if (!result) {
          return null
        }
        const base = path.basename(pptxPath).replace(/\.pptx$/i, "")
        const pdfPath = path.join(workDir, `${base}.pdf`)
        const converted = await stat(pdfPath).catch(() => null)
        if (!converted?.isFile() || converted.size === 0) {
          return null
        }
        await copyFile(pdfPath, cachePath)
        return cachePath
      } finally {
        await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
      }
    } catch (error) {
      logDiagnostic("chat-preview", "pptx conversion failed", { error, path: pptxPath }, "warn")
      return null
    }
  }

  return { convertToPdf }
}
