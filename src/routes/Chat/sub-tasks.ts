import type { ChatMessage } from "../../../electron/chat/common.ts"

export interface SubTask {
  partId: string
  description: string
  agentType: string
  status?: string
  start?: number
  end?: number
}

/** 提取会话里的子任务（task 工具调用，每次派发一个子智能体）。 */
export function subTasksFromMessages(messages: ChatMessage[]): SubTask[] {
  const tasks: SubTask[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.kind !== "tool" || part.tool !== "task") {
        continue
      }
      const input = part.input ?? {}
      const description =
        typeof input.description === "string" ? input.description : typeof input.prompt === "string" ? input.prompt : ""
      tasks.push({
        partId: part.partId,
        description,
        agentType: typeof input.subagent_type === "string" ? input.subagent_type : "",
        status: part.status,
        start: part.timing?.start,
        end: part.timing?.end,
      })
    }
  }
  return tasks
}
