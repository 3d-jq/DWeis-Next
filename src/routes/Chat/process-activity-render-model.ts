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
  // 运行中只在实际有动作信息时显示副状态（思考/整理/工具名/重试）；纯文本输出中
  // 标题已显示"处理中+耗时"，不再重复一条扫光。
  return (
    (status === "running" && (Boolean(activeTool) || Boolean(process.activity))) ||
    status === "retrying" ||
    Boolean(process.activity && status !== "completed" && status !== "stopped")
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
  // 思考阶段且推理内容未到达：注入空推理块占位（ReasoningBlock 标题「深度思考」扫光）。
  // 推理 part 一到即被同 key（message.id:reasoning）的真实块替换，React 不重挂载 → 无占位切换；
  // 模型思考内联进 text（无 reasoning part）时，文本到达 activity 清空，占位块随之消失（与 LiveStatusBar 等效）。
  if (
    live &&
    process.activity?.phase === "thinking" &&
    !activityBlocks.some((item) => item.block.kind === "reasoning")
  ) {
    const messageId = process.activity.messageId ?? "thinking"
    activityBlocks = [
      {
        message: { id: messageId, role: "assistant", createdAt: 0, parts: [] },
        block: {
          kind: "reasoning",
          part: { kind: "reasoning", partId: `thinking-live:${messageId}`, text: "" },
        },
      },
      ...activityBlocks,
    ]
  }
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
