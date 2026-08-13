import type { BuiltinModelDefinition } from "../models/builtin.ts"
import type { ModelChoice, ModelProtocol } from "../models/common.ts"
import type { LinkRuntime, ModelAccess } from "../runtime/agent-runtime.ts"
import type { SubagentModelChoice } from "../settings/common.ts"
import type { DWeisReasoningVariant } from "./reasoning.ts"
import type { Config } from "@opencode-ai/sdk/v2/client"

import { llmBaseUrl } from "../domain.ts"
import {
  BUILTIN_MODEL_DEFINITIONS,
  BUILTIN_PROVIDER_DEFINITIONS,
  DEFAULT_BUILTIN_MODEL_ID,
  isBuiltinModelId,
  resolveBuiltinModel,
} from "../models/builtin.ts"
import { effectiveMaxOutputTokens } from "../models/limits.ts"
import { customModelDisplayName } from "../models/store.ts"
import { DWEIS_BUILD_AGENT_NAME, DWEIS_GENERAL_SUBAGENT_NAME, DWEIS_PLAN_AGENT_NAME } from "./mode.ts"
import { OO_CLI_BASH_PERMISSION } from "./oo-command-permission.ts"
import {
  buildDWeisPlanSystemPrompt,
  buildDWeisSystemPrompt,
  DWEIS_GENERAL_SUBAGENT_SYSTEM_PROMPT,
} from "./system-prompt.ts"

type OpencodeModelConfig = NonNullable<NonNullable<Config["provider"]>[string]["models"]>[string] & {
  limit?: {
    context?: number
    input?: number
    output?: number
  }
  variants?: Record<string, Record<string, unknown>>
}
type OpencodeAgentConfig = NonNullable<NonNullable<Config["agent"]>[string]>
type OpencodePermissionConfig = NonNullable<OpencodeAgentConfig["permission"]>
type OpencodeReasoningVariantConfig = Record<string, unknown>

export const DWEIS_PROVIDER_ID = resolveBuiltinModel(DEFAULT_BUILTIN_MODEL_ID).runtime.providerID
export const DWEIS_MODEL_ID = resolveBuiltinModel(DEFAULT_BUILTIN_MODEL_ID).runtime.modelID

export interface OpencodeCustomModel {
  id: string
  providerId?: string
  providerName: string
  baseUrl: string
  apiKey: string
  modelName: string
  displayName?: string
  /** API 协议：openai（默认）/ anthropic（MiniMax 等支持 thinking 原生）。 */
  protocol?: ModelProtocol
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: readonly DWeisReasoningVariant[]
}

// 内置工具与自定义连接器工具并存；本地 shell、写入和越出私有 scratch workspace
// 的路径访问经 permission ask 进入 ChatService 本地访问策略。默认访问会自动批准普通 bash/文件操作，
// 并可对当前项目内、标准包管理器的依赖操作授予一次任务级窄权限；其余基础安全边界推给 UI。连接器自定义工具不受内置工具 permission 影响。
// 保留直接 oo CLI 的 OpenCode 快速路径：oo 由 DWEIS_OO_BIN/PATH 指向 DWeis 内置二进制。
function dweisPermission(linkRuntime: LinkRuntime | null): OpencodePermissionConfig {
  return {
    edit: "ask",
    bash: linkRuntime?.kind === "oomol" ? OO_CLI_BASH_PERMISSION : "ask",
    webfetch: "allow",
    external_directory: "ask",
  } as OpencodePermissionConfig
}

// 覆盖 OpenCode 原生 plan agent 时保留其“不写用户文件”的语义；是否允许本地 shell 仍交给 ChatService 访问策略。
function dweisPlanPermission(linkRuntime: LinkRuntime | null): OpencodePermissionConfig {
  return {
    bash: linkRuntime?.kind === "oomol" ? OO_CLI_BASH_PERMISSION : "ask",
    webfetch: "allow",
    external_directory: "ask",
    edit: {
      "*": "deny",
      ".opencode/plans/*.md": "allow",
    },
  } as unknown as OpencodePermissionConfig
}

const OOMOL_REASONING_VARIANTS = {
  low: { reasoningEffort: "low" },
  medium: { reasoningEffort: "medium" },
  high: { reasoningEffort: "high" },
  max: { reasoningEffort: "max" },
} as const satisfies Record<DWeisReasoningVariant, OpencodeReasoningVariantConfig>

const OPENAI_REASONING_VARIANTS = {
  low: { reasoningEffort: "low" },
  medium: { reasoningEffort: "medium" },
  high: { reasoningEffort: "high" },
  max: { reasoningEffort: "xhigh" },
} as const satisfies Record<DWeisReasoningVariant, OpencodeReasoningVariantConfig>

const QWEN_REASONING_VARIANTS = {
  low: { enable_thinking: false },
  high: { enable_thinking: true },
} as const satisfies Partial<Record<DWeisReasoningVariant, OpencodeReasoningVariantConfig>>

export interface OpencodeConfigOptions {
  customModels?: OpencodeCustomModel[]
  defaultModel?: ModelChoice
  /** 子代智能体（general subagent）使用的模型；缺省时跟随顶层默认模型。 */
  subagentModel?: SubagentModelChoice
  /** 子代智能体推理强度（variant）；仅 subagent 配独立模型时生效（opencode agent.variant）。 */
  subagentReasoningVariant?: DWeisReasoningVariant
  /** 只读探索子代理（explore subagent）使用的模型；缺省时跟随顶层默认模型。 */
  exploreModel?: SubagentModelChoice
  /** 只读探索子代理推理强度（variant）。 */
  exploreReasoningVariant?: DWeisReasoningVariant
  /** MCP server 配置（opencode 原生格式），缺省时不注入 mcp 段。 */
  mcpServers?: Config["mcp"]
  linkRuntime: LinkRuntime | null
  modelAccess: ModelAccess
}

/** Build the OpenCode config without persisting the OOMOL token or custom model keys. */
export function buildOpencodeConfig({
  customModels = [],
  defaultModel,
  subagentModel,
  subagentReasoningVariant,
  exploreModel,
  exploreReasoningVariant,
  mcpServers,
  linkRuntime,
  modelAccess,
}: OpencodeConfigOptions): Config {
  const model = resolveDefaultConfigModel(modelAccess, customModels, defaultModel)
  const subagentModelId = subagentModel ? resolveDefaultConfigModel(modelAccess, customModels, subagentModel) : undefined
  const exploreModelId = exploreModel ? resolveDefaultConfigModel(modelAccess, customModels, exploreModel) : undefined
  const permission = dweisPermission(linkRuntime)
  const planPermission = dweisPlanPermission(linkRuntime)
  const promptCapabilities = { connectors: linkRuntime !== null }
  const systemPrompt = buildDWeisSystemPrompt(promptCapabilities)
  const planSystemPrompt = buildDWeisPlanSystemPrompt(promptCapabilities)
  return {
    $schema: "https://opencode.ai/config.json",
    model,
    provider: {
      ...(modelAccess.kind === "oomol" ? builtinProviderConfigs(modelAccess.sessionToken) : {}),
      ...Object.fromEntries(customModels.map((model) => [customProviderId(model.id), customProviderConfig(model)])),
    },
    agent: {
      [DWEIS_BUILD_AGENT_NAME]: {
        description: linkRuntime
          ? "Link connector + local knowledge and coding assistant"
          : "Local knowledge and coding assistant",
        mode: "primary",
        prompt: systemPrompt,
        // 不再下发 tools 禁用表：所有内置工具默认启用。
        permission,
      },
      [DWEIS_PLAN_AGENT_NAME]: {
        description: "Plan mode. Disallows edit tools and produces an implementation plan.",
        mode: "primary",
        prompt: planSystemPrompt,
        permission: planPermission,
      },
      [DWEIS_GENERAL_SUBAGENT_NAME]: {
        description: "General-purpose subagent for delegated analysis and local work",
        mode: "subagent",
        ...(subagentModelId ? { model: subagentModelId } : {}),
        ...(subagentReasoningVariant ? { variant: subagentReasoningVariant } : {}),
        prompt: DWEIS_GENERAL_SUBAGENT_SYSTEM_PROMPT,
        permission: { ...(permission as Record<string, unknown>), task: "deny" } as OpencodePermissionConfig,
      },
      // opencode 内置 explore（只读探索）保留；这里可配置独立模型/推理强度。
      explore: {
        mode: "subagent",
        ...(exploreModelId ? { model: exploreModelId } : {}),
        ...(exploreReasoningVariant ? { variant: exploreReasoningVariant } : {}),
      },
    },
    ...(mcpServers && Object.keys(mcpServers).length > 0 ? { mcp: mcpServers } : {}),
    permission,
  }
}

function resolveDefaultConfigModel(
  modelAccess: ModelAccess,
  customModels: OpencodeCustomModel[],
  defaultModel: SubagentModelChoice | undefined,
): string {
  if (defaultModel?.kind === "custom") {
    const customModel = customModels.find((model) => model.id === defaultModel.id)
    if (customModel) return `${customProviderId(customModel.id)}/${customModel.modelName}`
  }
  if (modelAccess.kind === "local") {
    const customModel = customModels[0]
    if (!customModel) throw new Error("A custom model is required for the local Agent runtime.")
    return `${customProviderId(customModel.id)}/${customModel.modelName}`
  }
  if (defaultModel?.kind === "builtin" && isBuiltinModelId(defaultModel.id)) {
    const runtime = resolveBuiltinModel(defaultModel.id).runtime
    return `${runtime.providerID}/${runtime.modelID}`
  }
  return `${DWEIS_PROVIDER_ID}/${DWEIS_MODEL_ID}`
}

export function customProviderId(id: string): string {
  return `dweis-custom-${id}`
}

function builtinProviderConfigs(authToken: string): NonNullable<Config["provider"]> {
  return Object.fromEntries(
    BUILTIN_PROVIDER_DEFINITIONS.map((provider) => [
      provider.id,
      {
        name: provider.displayName,
        ...(provider.npm ? { npm: provider.npm } : {}),
        options: {
          baseURL: llmBaseUrl,
          // SDK 字段名固定为 apiKey（外部契约）；值是会话 token，网关层统一鉴权。
          apiKey: authToken,
        },
        models: Object.fromEntries(
          BUILTIN_MODEL_DEFINITIONS.filter((model) => model.runtime.providerID === provider.id).map((model) => [
            model.runtime.modelID,
            modelCapabilities({
              name: model.displayName,
              contextWindow: model.contextWindow,
              inputTokenLimit: model.inputTokenLimit,
              maxOutputTokens: model.maxOutputTokens,
              reasoningVariants: builtinReasoningVariants(model),
              supportsImages: model.capabilities.supportsImages,
              toolCall: model.capabilities.toolCall,
            }),
          ]),
        ),
      },
    ]),
  )
}

function customProviderConfig(model: OpencodeCustomModel): NonNullable<Config["provider"]>[string] {
  // npm 包决定 opencode 用哪个 SDK 与端点：anthropic=@ai-sdk/anthropic（/v1/messages）、
  // responses=@ai-sdk/openai（/responses，opencode 默认 loader 优先 sdk.responses）、
  // openai=@ai-sdk/openai-compatible（/chat/completions）。
  const npm =
    model.protocol === "anthropic"
      ? "@ai-sdk/anthropic"
      : model.protocol === "responses"
        ? "@ai-sdk/openai"
        : "@ai-sdk/openai-compatible"
  return {
    name: model.providerName,
    npm,
    options: {
      baseURL: model.baseUrl,
      apiKey: model.apiKey,
    },
    models: {
      [model.modelName]: modelCapabilities({
        name: customModelDisplayName(model),
        contextWindow: model.contextWindow,
        inputTokenLimit: model.inputTokenLimit,
        maxOutputTokens: model.maxOutputTokens,
        reasoningVariants: customReasoningVariants(model),
        supportsImages: model.supportsImages === true,
        toolCall: model.supportsToolCalls !== false,
      }),
    },
  }
}

function modelCapabilities({
  name,
  contextWindow,
  inputTokenLimit,
  maxOutputTokens,
  reasoningVariants,
  supportsImages,
  toolCall,
}: {
  name: string
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: Record<string, OpencodeReasoningVariantConfig>
  supportsImages: boolean
  toolCall: boolean
}): OpencodeModelConfig {
  const limitContext = contextWindow ?? inputTokenLimit
  const limit = limitContext
    ? {
        context: limitContext,
        ...(inputTokenLimit ? { input: inputTokenLimit } : {}),
        output: effectiveMaxOutputTokens(maxOutputTokens),
      }
    : undefined
  return {
    name,
    ...(limit ? { limit } : {}),
    ...(reasoningVariants
      ? {
          reasoning: true,
          variants: reasoningVariants,
        }
      : {}),
    tool_call: toolCall,
    ...(supportsImages
      ? {
          attachment: true,
          modalities: {
            input: ["text", "image"],
            output: ["text"],
          },
        }
      : {}),
  }
}

function builtinReasoningVariants(
  model: BuiltinModelDefinition,
): Record<string, OpencodeReasoningVariantConfig> | undefined {
  const levels = model.capabilities.reasoningVariants
  if (!levels || levels.length === 0) {
    return undefined
  }
  const variantSet: Partial<Record<DWeisReasoningVariant, OpencodeReasoningVariantConfig>> =
    model.providerName === "Qwen"
      ? QWEN_REASONING_VARIANTS
      : model.runtime.providerID === "openai"
        ? OPENAI_REASONING_VARIANTS
        : OOMOL_REASONING_VARIANTS
  return Object.fromEntries(
    levels.flatMap((level) => {
      const variant = variantSet[level]
      return variant ? [[level, variant]] : []
    }),
  )
}

function customReasoningVariants(
  model: OpencodeCustomModel,
): Record<string, OpencodeReasoningVariantConfig> | undefined {
  const levels = model.reasoningVariants
  if (!levels || levels.length === 0) {
    return undefined
  }
  const variantSet: Partial<Record<DWeisReasoningVariant, OpencodeReasoningVariantConfig>> = isQwenCustomModel(model)
    ? QWEN_REASONING_VARIANTS
    : OOMOL_REASONING_VARIANTS
  return Object.fromEntries(
    levels.flatMap((level) => {
      const variant = variantSet[level]
      return variant ? [[level, variant]] : []
    }),
  )
}

function isQwenCustomModel(model: OpencodeCustomModel): boolean {
  return (
    model.providerId === "qwen" ||
    model.providerName.trim().toLowerCase() === "qwen" ||
    model.modelName.trim().toLowerCase().startsWith("qwen")
  )
}
