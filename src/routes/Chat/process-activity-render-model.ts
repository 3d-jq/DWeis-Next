import type { ChatMessagePart } from "../../../electron/chat/common.ts"
import type { AssistantTimelineBlock } from "./assistant-timeline.ts"
import type { ChatTurnProcess, ChatTurnProcessStatus } from "./chat-turns.ts"
import type { RenderBlock } from "./render-blocks.ts"

import {
  chatTurnProcessStatus,
  settlingToolPartId,
  summarizeTurnProcess,
} from "./chat-turns.ts"
import { isActiveToolPart } from "./tool-state.ts"
import { groupedWikigraphToolActivityBlocks } from "./wikigraph-tool-grouping.ts"

export interface TurnProcessActivityRenderModel {
  activityBlocks: AssistantTimelineBlock[]
  renderBlocks: RenderBlock[]
  settlingPartId?: string
  showLiveStatus: boolean
  status: ChatTurnProcessStatus
  statusKey: string
}

export function latestActiveProcessTool(process: Pick<ChatTurnProcess, "tools">): ChatMessagePart | null {
  for (let index = process.tools.length - 1; index >= 0; index -= 1) {
    const part = process.tools[index]
    if (part && isActiveToolPart(part)) {
      return part
    }
  }
  return null
}

export function shouldShowProcessLiveStatus(
  process: Pick<ChatTurnProcess, "activity" | "tools">,
  status: ChatTurnProcessStatus,
): boolean {
  const activeTool = latestActiveProcessTool(process)
  // 思考阶段静默（对齐 deepseek-harness：空推理不渲染占位，推理内容一到即渲染推理块）。
  // 状态行只显示真实活动信息（工具运行/整理/重试），thinking 不再显示扫光占位，
  // 避免「扫光占位 → 推理块」两种形态切换带来的跳动。
  return (
    (status === "running" && Boolean(activeTool)) ||
    status === "retrying" ||
    Boolean(
      process.activity &&
        status !== "completed" &&
        status !== "stopped" &&
        process.activity.phase !== "thinking",
    )
  )
}

export function buildTurnProcessActivityRenderModel({
  blocks,
  live = false,
  process,
}: {
  blocks: AssistantTimelineBlock[]
  live?: boolean
  process: ReturnType<typeof summarizeTurnProcess>
}): TurnProcessActivityRenderModel {
  const status = chatTurnProcessStatus(process, live)
  const statusKey = [
    status,
    live ? "live" : "",
    process.activity?.phase,
    process.tools.map((part) => `${part.partId}:${part.status}`).join("|"),
    process.errors.map((part) => part.partId).join("|"),
  ].join(":")
  let activityBlocks = groupedWikigraphToolActivityBlocks(blocks, { live })
  // 不再注入占位推理块（对齐 opencode：思考前由 LiveStatusBar 显示"思考中"，无需占位切换）。
  // 之前占位块消息 id 依赖 activity.messageId，submit→messageStarted 阶段 id 变化导致
  // 推理块重挂载、「思考中」消失跳变——移除占位后不存在该切换，推理 part 一到即稳定渲染。
  const renderBlocks = activityBlocks.map((item) => item.block)
  return {
    activityBlocks,
    renderBlocks,
    settlingPartId: settlingToolPartId(process, status),
    showLiveStatus: renderBlocks.length === 0 && shouldShowProcessLiveStatus(process, status),
    status,
    statusKey,
  }
}
