import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

/**
 * 持久记忆内容：agent 记忆（MEMORY.md）+ 用户档案（USER.md），均为 Markdown 文本。
 * 字符上限沿用 Hermes builtin memory 的调参：agent 2200 / user 1375——
 * 内容每轮注入 system prompt，过大挤占上下文窗口。
 */
export interface MemoryContent {
  agent: string
  user: string
}

export type MemoryService = typeof MemoryService
export const MemoryService = serviceName("memory-service") as ServiceName<{
  ServerEvents: {
    memoryChanged: MemoryContent
  }
  ClientInvokes: {
    getMemory(): Promise<MemoryContent>
    updateMemory(patch: Partial<MemoryContent>): Promise<MemoryContent>
  }
}>
