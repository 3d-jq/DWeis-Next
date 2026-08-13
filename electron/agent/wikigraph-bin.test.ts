import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ensureWikiGraphCommandBin } from "./wikigraph-bin.ts"

async function exists(pathname: string): Promise<boolean> {
  try {
    await access(pathname)
    return true
  } catch {
    return false
  }
}

describe("ensureWikiGraphCommandBin", () => {
  it("writes a DWeis-owned wg shim that forwards to the managed CLI entry", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "dweis-wg-bin-"))
    try {
      const binDir = path.join(base, "bin")
      const result = await ensureWikiGraphCommandBin({
        binDir,
        nodeBin: "/Applications/DWeis.app/Contents/MacOS/DWeis",
        stateDir: "/Users/test/Library/Application Support/dweis/wikigraph-state",
        wikiGraphCliPath: "/Applications/DWeis.app/Contents/Resources/app.asar/dist-electron/dweis-wg.js",
      })

      expect(result).toBe(binDir)
      if (process.platform === "win32") {
        const commandPath = path.join(binDir, "wg.cmd")
        expect(await exists(commandPath)).toBe(true)
        const source = await readFile(commandPath, "utf-8")
        expect(source).toContain("set ELECTRON_RUN_AS_NODE=1")
        expect(source).toContain("--dweis-state-dir")
        expect(source).toContain("%*")
      } else {
        const commandPath = path.join(binDir, "wg")
        expect(await exists(commandPath)).toBe(true)
        const mode = (await stat(commandPath)).mode
        expect(mode & 0o111).not.toBe(0)
        const source = await readFile(commandPath, "utf-8")
        expect(source).toContain("export ELECTRON_RUN_AS_NODE=1")
        expect(source).toContain("--dweis-state-dir")
        expect(source).toContain('-- "$@"')
      }
    } finally {
      await rm(base, { force: true, recursive: true })
    }
  })
})
