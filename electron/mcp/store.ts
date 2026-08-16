import type { McpServerEntry, PersistedMcpServers } from "./common.ts"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { atomicWriteText } from "../atomic-file.ts"
import { logStoreReadFailure } from "../store-diagnostics.ts"
import { normalizeMcpServerEntry } from "./common.ts"

/** MCP 服务配置持久化到 userData/mcp-servers.json（仅非凭证字段）。 */
export class McpStore {
  private readonly file: string

  public constructor(dir: string) {
    this.file = path.join(dir, "mcp-servers.json")
  }

  public async read(): Promise<McpServerEntry[]> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf-8")) as PersistedMcpServers
      return Array.isArray(parsed.servers)
        ? parsed.servers.map(normalizeMcpServerEntry).filter((entry): entry is McpServerEntry => entry !== null)
        : []
    } catch (error) {
      logStoreReadFailure("mcp servers", this.file, error)
      return []
    }
  }

  public async write(servers: McpServerEntry[]): Promise<void> {
    await atomicWriteText(this.file, JSON.stringify({ servers }, null, 2), { mode: 0o600 })
  }
}
