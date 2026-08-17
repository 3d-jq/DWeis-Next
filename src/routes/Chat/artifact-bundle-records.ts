import type { ArtifactBundle } from "../../../electron/chat/common.ts"

import * as React from "react"
import { isMessageReduction, useSessionRecordResource } from "./session-record-resource.ts"
import { useChatService } from "@/components/AppContext"

export function useArtifactBundles(sessionId: string | null, messageIdsKey: string): ArtifactBundle[] {
  const chatService = useChatService()
  // key 只依赖会话 + 强制刷新标记（对齐 dsh 事件驱动：发送新消息不重拉，产物靠
  // artifactBundleUpdated 增量；仅回滚/删除导致消息缩减时强制重拉纠正）。
  const [forcedRevision, setForcedRevision] = React.useState(0)
  const previousIdsKeyRef = React.useRef(messageIdsKey)
  React.useEffect(() => {
    const previous = previousIdsKeyRef.current
    previousIdsKeyRef.current = messageIdsKey
    if (isMessageReduction(previous, messageIdsKey)) {
      setForcedRevision((revision) => revision + 1)
    }
  }, [messageIdsKey])
  const key = sessionId && messageIdsKey ? `${sessionId}\0force:${forcedRevision}` : null
  const subscribe = React.useCallback(
    (refresh: () => void) =>
      chatService.serverEvents.on("artifactBundleUpdated", (event) => {
        if (event.sessionId === sessionId) {
          refresh()
        }
      }),
    [chatService, sessionId],
  )
  const load = React.useCallback(async (): Promise<ArtifactBundle[]> => {
    if (!sessionId || !messageIdsKey) {
      return []
    }
    const bundles = await chatService.invoke("getArtifactBundles", {
      sessionId,
      messageIds: messageIdsKey.split("\n"),
    })
    return [...bundles].sort((left, right) => left.createdAt - right.createdAt)
  }, [chatService, messageIdsKey, sessionId])
  const onError = React.useCallback((error: unknown): void => {
    console.error("[dweis] getArtifactBundles failed", error)
  }, [])
  return useSessionRecordResource({ key, load, onError, subscribe, staleScopeKey: sessionId })
}
