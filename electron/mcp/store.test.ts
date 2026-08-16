import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { McpStore } from "./store.ts"

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "dweis-mcp-store-"))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("McpStore", () => {
  it("returns an empty list for a missing file", async () => {
    const store = new McpStore(tempDir())
    expect(await store.read()).toEqual([])
  })

  it("persists and reloads servers", async () => {
    const dir = tempDir()
    const store = new McpStore(dir)
    const servers = [
      {
        args: "--watch",
        command: "npx",
        enabled: true,
        id: "mcp-1",
        name: "filesystem",
        type: "stdio" as const,
        environment: { NODE_ENV: "production" },
      },
      { enabled: false, id: "mcp-2", name: "remote", type: "sse" as const, url: "https://x.example.com/mcp/sse" },
    ]
    await store.write(servers)
    expect(await store.read()).toEqual(servers)
    const raw = JSON.parse(readFileSync(path.join(dir, "mcp-servers.json"), "utf-8"))
    expect(raw.servers).toHaveLength(2)
  })

  it("migrates legacy local/remote entries", async () => {
    const dir = tempDir()
    const store = new McpStore(dir)
    await store.write([
      { id: "mcp-1", name: "legacy-local", type: "local", command: "npx", enabled: true } as never,
      { id: "mcp-2", name: "legacy-remote", type: "remote", url: "https://x.example.com/mcp", enabled: false } as never,
    ])
    expect(await store.read()).toEqual([
      { id: "mcp-1", name: "legacy-local", type: "stdio", command: "npx", enabled: true },
      { id: "mcp-2", name: "legacy-remote", type: "http", url: "https://x.example.com/mcp", enabled: false },
    ])
  })

  it("filters malformed entries on read", async () => {
    const dir = tempDir()
    const store = new McpStore(dir)
    await store.write([{ id: "mcp-1", name: "ok", type: "stdio", enabled: true }, { id: 42, name: "bad" } as never])
    expect(await store.read()).toEqual([{ id: "mcp-1", name: "ok", type: "stdio", enabled: true }])
  })
})
