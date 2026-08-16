import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolveAtMentionPaths } from "./at-mention.ts"

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "dweis-at-mention-"))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe("resolveAtMentionPaths", () => {
  it("resolves existing project-relative @ paths to absolute paths", async () => {
    const root = await temporaryRoot()
    await writeFile(path.join(root, "main.ts"), "code")

    const out = await resolveAtMentionPaths("please check @main.ts", root)

    expect(out).toBe(`please check @${path.join(root, "main.ts")}`)
  })

  it("resolves nested @ paths with ./ prefix", async () => {
    const root = await temporaryRoot()
    await mkdir(path.join(root, "src"), { recursive: true })
    await writeFile(path.join(root, "src", "lib.ts"), "code")

    const out = await resolveAtMentionPaths("see @./src/lib.ts", root)

    expect(out).toBe(`see @${path.join(root, "src", "lib.ts")}`)
  })

  it("leaves absolute, ~/ and nonexistent @ tokens unchanged", async () => {
    const root = await temporaryRoot()

    const out = await resolveAtMentionPaths("a @D:/proj/x.ts b @~/notes.md c @missing.ts d @agent-name", root)

    expect(out).toBe("a @D:/proj/x.ts b @~/notes.md c @missing.ts d @agent-name")
  })

  it("does not touch text without @", async () => {
    const root = await temporaryRoot()
    expect(await resolveAtMentionPaths("plain text", root)).toBe("plain text")
  })
})
