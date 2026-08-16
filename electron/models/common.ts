import type { DWeisReasoningVariant } from "../agent/reasoning.ts"
import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

/** 自定义模型的 API 协议：openai（Chat Completions）/ anthropic（Anthropic Messages）/ responses（OpenAI Responses）。
 * 用户按自己的 base URL 选对应格式；base URL 原样透传（SDK 追加 /chat/completions /messages /responses 端点）。 */
export type ModelProtocol = "openai" | "anthropic" | "responses"

/** 兼容保留：本地 self-managed 无内置云模型，目录恒为空数组。 */
export interface BuiltinModelSummary {
  id: string
  displayName: string
  providerName: string
  supportsImages: boolean
  toolCall: boolean
  runtimeKind: "openai-compatible" | "openai-responses"
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly DWeisReasoningVariant[]
}

export interface CustomModelOption {
  id: string
  displayName?: string
  protocol?: ModelProtocol
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly DWeisReasoningVariant[]
}

export interface CustomModelApiRegion {
  id: string
  baseUrl: string
}

export interface CustomModelApiPlan {
  id: string
  baseUrl: string
  apiRegions?: CustomModelApiRegion[]
}

export interface CustomModelProvider {
  id: string
  displayName: string
  baseUrl: string
  protocol?: ModelProtocol
  apiPlans?: CustomModelApiPlan[]
  apiRegions?: CustomModelApiRegion[]
  modelOptions?: CustomModelOption[]
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly DWeisReasoningVariant[]
  documentationUrl?: string
  requiresBaseUrl?: boolean
}

export interface CustomModelSummary {
  id: string
  providerId: string
  providerName: string
  baseUrl: string
  modelName: string
  displayName: string
  apiKeyConfigured: boolean
  protocol?: ModelProtocol
  supportsImages: boolean
  supportsToolCalls: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly DWeisReasoningVariant[]
}

export type ModelChoice = { kind: "custom"; id: string }

export interface ModelCatalog {
  builtins: BuiltinModelSummary[]
  customModels: CustomModelSummary[]
  providers: CustomModelProvider[]
  selected: ModelChoice | undefined
}

export interface SaveCustomModelRequest {
  id?: string
  providerId: string
  providerName?: string
  baseUrl?: string
  apiKey?: string
  modelName: string
  displayName?: string
  protocol?: ModelProtocol
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly DWeisReasoningVariant[]
}

export type ModelsService = typeof ModelsService
export const ModelsService = serviceName("models-service") as ServiceName<{
  ServerEvents: {
    modelsChanged: ModelCatalog
  }
  ClientInvokes: {
    listModels(): Promise<ModelCatalog>
    setSelectedModel(choice: ModelChoice): Promise<ModelCatalog>
    saveCustomModel(req: SaveCustomModelRequest): Promise<ModelCatalog>
    deleteCustomModel(id: string): Promise<ModelCatalog>
  }
}>
