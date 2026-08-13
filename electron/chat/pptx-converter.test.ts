import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createPptxConverter } from "./pptx-converter.ts"

const tempDirs: string[] = []

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("createPptxConverter", () => {
  it("returns null when no soffice candidate exists", async () => {
    const cacheDir = await tempDir("dweis-pptx-test-cache-")
    const converter = createPptxConverter({
      sofficeCandidates: [path.join(await tempDir("dweis-pptx-test-missing-"), "soffice.exe")],
      cacheDir,
    })
    const pptx = path.join(await tempDir("dweis-pptx-test-in-"), "deck.pptx")
    await writeFile(pptx, "fake")
    expect(await converter.convertToPdf(pptx)).toBeNull()
  })

  it("returns a cached pdf on repeat conversions when soffice is unavailable later", async () => {
    const cacheDir = await tempDir("dweis-pptx-test-cache2-")
    const missingSoffice = path.join(await tempDir("dweis-pptx-test-missing2-"), "soffice.exe")
    const converter = createPptxConverter({ sofficeCandidates: [missingSoffice], cacheDir })
    const pptx = path.join(await tempDir("dweis-pptx-test-in2-"), "deck.pptx")
    await writeFile(pptx, "fake")

    // 直接预置缓存文件：模拟一次成功转换后的结果（命中缓存时不再需要 soffice）。
    const source = await import("node:fs/promises")
    const { stat } = await import("node:fs/promises")
    const statInfo = await stat(pptx)
    const { createHash } = await import("node:crypto")
    const hash = createHash("sha256")
      .update(`${pptx}\0${statInfo.size}\0${statInfo.mtimeMs}`)
      .digest("hex")
      .slice(0, 24)
    await mkdir(cacheDir, { recursive: true })
    const cachePath = path.join(cacheDir, `${hash}.pdf`)
    await writeFile(cachePath, "%PDF-1.4 cached")
    void source

    expect(await converter.convertToPdf(pptx)).toBe(cachePath)
  })
})
