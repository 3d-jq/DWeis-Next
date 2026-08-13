import type { MemoryContent } from "../../electron/memory/common.ts"

import * as React from "react"
import { useMemoryService } from "../components/AppContext.ts"
import { reportRendererHandledError } from "../lib/renderer-diagnostics.ts"

/**
 * 持久记忆（MEMORY.md / USER.md）：加载 + 订阅 memoryChanged + 保存。
 * 保存成功后返回最新内容（服务端广播前已落盘）。
 */
export function useMemory(): {
  content: MemoryContent | null
  loading: boolean
  save: (patch: Partial<MemoryContent>) => Promise<void>
} {
  const service = useMemoryService()
  const [content, setContent] = React.useState<MemoryContent | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    void service.invoke("getMemory").then(
      (next) => {
        if (active) setContent(next)
      },
      (error: unknown) => {
        reportRendererHandledError("memory", "load memory failed", error)
      },
    )
    const unsubscribe = service.serverEvents.on("memoryChanged", (next) => {
      if (active) setContent(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [service])

  const save = React.useCallback(
    async (patch: Partial<MemoryContent>) => {
      const next = await service.invoke("updateMemory", patch)
      setContent(next)
    },
    [service],
  )

  React.useEffect(() => {
    if (content !== null) {
      setLoading(false)
    }
  }, [content])

  return { content, loading, save }
}
