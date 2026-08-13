import type { McpServerEntry } from "../../electron/mcp/common.ts"

import * as React from "react"
import { useMcpService } from "../components/AppContext.ts"
import { reportRendererHandledError } from "../lib/renderer-diagnostics.ts"

export function useMcpServers(): {
  servers: McpServerEntry[]
  deleteServer: (id: string) => Promise<void>
  loading: boolean
  saveServer: (server: McpServerEntry) => Promise<void>
} {
  const service = useMcpService()
  const [servers, setServers] = React.useState<McpServerEntry[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    void service
      .invoke("listMcpServers")
      .then(
        (next) => {
          if (active) setServers(next)
        },
        (error: unknown) => reportRendererHandledError("settings", "load mcp servers failed", error),
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    const unsubscribe = service.serverEvents.on("mcpServersChanged", (next) => {
      if (active) setServers(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [service])

  const saveServer = React.useCallback(
    async (server: McpServerEntry) => {
      const next = await service.invoke("saveMcpServer", server)
      setServers(next)
    },
    [service],
  )

  const deleteServer = React.useCallback(
    async (id: string) => {
      const next = await service.invoke("deleteMcpServer", id)
      setServers(next)
    },
    [service],
  )

  return { deleteServer, loading, saveServer, servers }
}
