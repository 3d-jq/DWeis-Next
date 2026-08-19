import type { AssistantActivityEvent } from "../../../electron/chat/common.ts"
import type { TurnOutputRecord } from "../../../electron/chat/common.ts"
import type { ChatErrorKind } from "../../../electron/chat/error.ts"
import type { ResolvedArtifactGroup } from "./artifact-resolution.ts"
import type { ChatTurn, ChatTurnRetrySource } from "./chat-turns.ts"
import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"

export interface ChatTurnViewProps {
  activeSessionId: string | null
  artifactGroups: ResolvedArtifactGroup[]
  artifactGroupsByMessageId: ReadonlyMap<string, ResolvedArtifactGroup[]>
  turnOutputRecordsByMessage: ReadonlyMap<string, TurnOutputRecord>
  turnOutputRecord: TurnOutputRecord | null
  turn: ChatTurn
  activity: AssistantActivityEvent | null
  activeAssistantMessageId?: string
  turnInFlight?: boolean
  /** 是否为会话最新回合：turnInFlight 是全局状态，只有最新回合才被它算作活跃。 */
  isLatestTurn?: boolean
  smoothAssistantMessageId?: string
  onRecover: (kind: ChatErrorKind, source: ChatTurnRetrySource) => Promise<void>
  onRetryFresh: (source: ChatTurnRetrySource) => Promise<void>
  onArtifactsAvailable: (selection: ArtifactSelection) => void
  onArtifactsOpen: (selection: ArtifactSelection) => void
  onTurnOutputOpen: (selection: TurnOutputSelection) => void
  onViewBilling?: () => void
}

/** 回合级投影：全局 activeAssistantMessageId/smoothAssistantMessageId 只有命中本回合消息才算数。 */
function turnScopedMessageId(turn: ChatTurn, messageId: string | undefined): string | undefined {
  if (!messageId) {
    return undefined
  }
  return turn.assistants.some((message) => message.id === messageId) ? messageId : undefined
}

export function chatTurnViewPropsEqual(previous: ChatTurnViewProps, next: ChatTurnViewProps): boolean {
  // 发消息时全局 turnInFlight false→true、旧回合 isLatestTurn true→false：
  // turnInFlight/isLatestTurn 只参与最新回合的 turnIsActive（turnInFlight && isLatestTurn），
  // 对历史回合渲染结果无影响——非最新回合（含刚变历史的）忽略这两个值的变化，
  // 完全跳过重渲染，消除发送瞬间上方回合的任何重渲染/重挂载抖动。
  const latestInsensitive = !previous.isLatestTurn || (previous.isLatestTurn && !next.isLatestTurn)
  return (
    previous.activeSessionId === next.activeSessionId &&
    previous.artifactGroups === next.artifactGroups &&
    previous.artifactGroupsByMessageId === next.artifactGroupsByMessageId &&
    previous.turnOutputRecordsByMessage === next.turnOutputRecordsByMessage &&
    previous.turnOutputRecord === next.turnOutputRecord &&
    previous.turn === next.turn &&
    previous.activity === next.activity &&
    turnScopedMessageId(previous.turn, previous.activeAssistantMessageId) ===
      turnScopedMessageId(next.turn, next.activeAssistantMessageId) &&
    turnScopedMessageId(previous.turn, previous.smoothAssistantMessageId) ===
      turnScopedMessageId(next.turn, next.smoothAssistantMessageId) &&
    (latestInsensitive || previous.turnInFlight === next.turnInFlight) &&
    (latestInsensitive || previous.isLatestTurn === next.isLatestTurn) &&
    previous.onRecover === next.onRecover &&
    previous.onRetryFresh === next.onRetryFresh &&
    previous.onArtifactsAvailable === next.onArtifactsAvailable &&
    previous.onArtifactsOpen === next.onArtifactsOpen &&
    previous.onTurnOutputOpen === next.onTurnOutputOpen
  )
}
