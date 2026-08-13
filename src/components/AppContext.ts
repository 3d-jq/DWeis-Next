import type { AttentionService } from "../../electron/attention/common.ts"
import type { AuthService } from "../../electron/auth/common.ts"
import type { AutomationService } from "../../electron/automation/common.ts"
import type { BrowserService } from "../../electron/browser/common.ts"
import type { ChatService } from "../../electron/chat/common.ts"
import type { GitService } from "../../electron/git/common.ts"
import type { KnowledgeService } from "../../electron/knowledge/common.ts"
import type { McpService } from "../../electron/mcp/common.ts"
import type { MemoryService } from "../../electron/memory/common.ts"
import type { ModelsService } from "../../electron/models/common.ts"
import type { SessionService } from "../../electron/session/common.ts"
import type { SettingsService } from "../../electron/settings/common.ts"
import type { SkillService } from "../../electron/skills/common.ts"
import type { UpdateService } from "../../electron/update/common.ts"
import type { UsageService } from "../../electron/stats/common.ts"
import type { ConnectionClientService } from "@oomol/connection"

import * as React from "react"

export interface AppContextValue {
  attentionService: ConnectionClientService<AttentionService>
  automationService: ConnectionClientService<AutomationService>
  browserService: ConnectionClientService<BrowserService>
  chatService: ConnectionClientService<ChatService>
  gitService: ConnectionClientService<GitService>
  knowledgeService: ConnectionClientService<KnowledgeService>
  mcpService: ConnectionClientService<McpService>
  memoryService: ConnectionClientService<MemoryService>
  sessionService: ConnectionClientService<SessionService>
  skillService: ConnectionClientService<SkillService>
  modelsService: ConnectionClientService<ModelsService>
  settingsService: ConnectionClientService<SettingsService>
  authService: ConnectionClientService<AuthService>
  updateService: ConnectionClientService<UpdateService>
  usageService: ConnectionClientService<UsageService>
}

export const AppContext = React.createContext<AppContextValue | null>(null)

export function useAppContext(): AppContextValue {
  const ctx = React.useContext(AppContext)
  if (!ctx) {
    throw new Error("useAppContext must be used within AppContext.Provider")
  }
  return ctx
}

export function useChatService(): ConnectionClientService<ChatService> {
  return useAppContext().chatService
}

export function useAttentionService(): ConnectionClientService<AttentionService> {
  return useAppContext().attentionService
}

export function useAutomationService(): ConnectionClientService<AutomationService> {
  return useAppContext().automationService
}

export function useBrowserService(): ConnectionClientService<BrowserService> {
  return useAppContext().browserService
}

export function useSessionService(): ConnectionClientService<SessionService> {
  return useAppContext().sessionService
}

export function useGitService(): ConnectionClientService<GitService> {
  return useAppContext().gitService
}

export function useKnowledgeService(): ConnectionClientService<KnowledgeService> {
  return useAppContext().knowledgeService
}

export function useSkillService(): ConnectionClientService<SkillService> {
  return useAppContext().skillService
}

export function useModelsService(): ConnectionClientService<ModelsService> {
  return useAppContext().modelsService
}

export function useSettingsService(): ConnectionClientService<SettingsService> {
  return useAppContext().settingsService
}

export function useMcpService(): ConnectionClientService<McpService> {
  return useAppContext().mcpService
}

export function useMemoryService(): ConnectionClientService<MemoryService> {
  return useAppContext().memoryService
}

export function useAuthService(): ConnectionClientService<AuthService> {
  return useAppContext().authService
}

export function useUpdateService(): ConnectionClientService<UpdateService> {
  return useAppContext().updateService
}

export function useUsageService(): ConnectionClientService<UsageService> {
  return useAppContext().usageService
}
