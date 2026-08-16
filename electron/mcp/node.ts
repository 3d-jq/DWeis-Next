import type { McpServerEntry, McpService } from "./common.ts"
import type { McpStore } from "./store.ts"
import type { IConnectionService } from "@oomol/connection"

import { ConnectionService } from "@oomol/connection"
import { McpService as McpServiceName } from "./common.ts"

export interface McpServiceDeps {
  store: McpStore
  /** 配置变更后由调用方触发 agent 重启（agentRefreshScheduler）。 */
  onMcpServersChanged?: (servers: McpServerEntry[]) => Promise<void> | void
}

export class McpServiceImpl extends ConnectionService<McpService> implements IConnectionService<McpService> {
  private readonly deps: McpServiceDeps

  public constructor(deps: McpServiceDeps) {
    super(McpServiceName)
    this.deps = deps
  }

  public listMcpServers(): Promise<McpServerEntry[]> {
    return this.deps.store.read()
  }

  public async saveMcpServer(server: McpServerEntry): Promise<McpServerEntry[]> {
    const servers = await this.deps.store.read()
    const index = servers.findIndex((entry) => entry.id === server.id)
    const next = index >= 0 ? [...servers.slice(0, index), server, ...servers.slice(index + 1)] : [...servers, server]
    await this.deps.store.write(next)
    await this.mcpServersChanged(next)
    return next
  }

  public async deleteMcpServer(id: string): Promise<McpServerEntry[]> {
    const servers = await this.deps.store.read()
    const next = servers.filter((entry) => entry.id !== id)
    await this.deps.store.write(next)
    await this.mcpServersChanged(next)
    return next
  }

  private async mcpServersChanged(servers: McpServerEntry[]): Promise<void> {
    void this.send("mcpServersChanged", servers).catch((error: unknown) => {
      console.warn("[dweis] mcp servers broadcast failed:", error)
    })
    await this.deps.onMcpServersChanged?.(servers)
  }
}
