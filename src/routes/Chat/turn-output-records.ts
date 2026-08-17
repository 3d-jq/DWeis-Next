import type { TurnOutputRecord, TurnOutputFileRole } from "../../../electron/chat/common.ts"
import type { ChatTurn } from "./chat-turns.ts"

import * as React from "react"
import { isMessageReduction, useSessionRecordResource } from "./session-record-resource.ts"
import { useChatService } from "@/components/AppContext"

function visibleTurnOutputRecords(records: TurnOutputRecord[]): TurnOutputRecord[] {
  return records.filter(
    (record) =>
      record.summary.changedFileCount > 0 || record.summary.processFileCount > 0 || record.projectChangesTruncated,
  )
}

export function turnOutputRecordSortValue(record: TurnOutputRecord): number {
  return record.completedAt ?? record.createdAt
}

export function turnOutputInitialRole(record: TurnOutputRecord): TurnOutputFileRole {
  return record.summary.changedFileCount > 0 || record.projectChangesTruncated ? "project_change" : "process"
}

export function turnOutputRecordsByMessageId(records: TurnOutputRecord[]): Map<string, TurnOutputRecord> {
  const byMessageId = new Map<string, TurnOutputRecord>()
  for (const record of records) {
    byMessageId.set(record.messageId, record)
  }
  return byMessageId
}

export function turnOutputRecordsByTurnId(
  turns: ChatTurn[],
  recordsByMessageId: Map<string, TurnOutputRecord>,
): Map<string, TurnOutputRecord> {
  const byTurnId = new Map<string, TurnOutputRecord>()
  for (const turn of turns) {
    const records = turn.assistants
      .map((message) => recordsByMessageId.get(message.id))
      .filter((record): record is TurnOutputRecord => Boolean(record))
      .sort((left, right) => turnOutputRecordSortValue(left) - turnOutputRecordSortValue(right))
    const latest = records.at(-1)
    if (latest) {
      byTurnId.set(turn.id, latest)
    }
  }
  return byTurnId
}

export function useTurnOutputRecords(sessionId: string | null, messageIdsKey: string): TurnOutputRecord[] {
  const chatService = useChatService()
  // key 只依赖会话 + 强制刷新标记（对齐 dsh 事件驱动：发送新消息不重拉，输出靠
  // turnOutputUpdated 增量；仅回滚/删除导致消息缩减时强制重拉纠正）。
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
      chatService.serverEvents.on("turnOutputUpdated", (event) => {
        if (event.sessionId === sessionId) {
          refresh()
        }
      }),
    [chatService, sessionId],
  )
  const load = React.useCallback(async (): Promise<TurnOutputRecord[]> => {
    if (!sessionId || !messageIdsKey) {
      return []
    }
    const records = await chatService.invoke("getTurnOutputs", {
      sessionId,
      messageIds: messageIdsKey.split("\n"),
    })
    return visibleTurnOutputRecords(records).sort(
      (left, right) => turnOutputRecordSortValue(left) - turnOutputRecordSortValue(right),
    )
  }, [chatService, messageIdsKey, sessionId])
  const onError = React.useCallback((error: unknown): void => {
    console.error("[dweis] getTurnOutputs failed", error)
  }, [])
  return useSessionRecordResource({ key, load, onError, subscribe, staleScopeKey: sessionId })
}
