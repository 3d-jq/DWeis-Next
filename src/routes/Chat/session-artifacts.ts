import type { ArtifactBundle } from "../../../electron/chat/common.ts"

import * as React from "react"
import { useSessionRecordResource } from "./session-record-resource.ts"
import { useChatService } from "@/components/AppContext"

/**
 * 会话级全量产物：一次性拉取该会话的全部 bundle 并在 artifactBundleUpdated 时增量刷新。
 * 对齐 LobsterAI 成果总列表：面板无需依赖聊天区的通知，打开「成果」即展示全部文件。
 */
export function useSessionArtifacts(sessionId: string | null): ArtifactBundle[] {
  const chatService = useChatService()
  const key = sessionId
  const subscribe = React.useCallback(
    (refresh: () => void) =>
      chatService.serverEvents.on("artifactBundleUpdated", (event) => {
        if (event.sessionId === sessionId) {
          refresh()
        }
      }),
    [chatService, sessionId],
  )
  const load = React.useCallback(
    () => (sessionId ? chatService.invoke("getSessionArtifacts", sessionId) : Promise.resolve([])),
    [chatService, sessionId],
  )
  const onError = React.useCallback((error: unknown): void => {
    console.error("[dweis] getSessionArtifacts failed", error)
  }, [])
  return useSessionRecordResource({ key, load, onError, subscribe, staleScopeKey: sessionId })
}
