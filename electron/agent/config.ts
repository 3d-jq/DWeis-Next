import type { ModelChoice, ModelProtocol } from "../models/common.ts"
import type { SubagentModelChoice } from "../settings/common.ts"
import type { DWeisReasoningVariant } from "./reasoning.ts"
import type { Config } from "@opencode-ai/sdk/v2/client"

import { effectiveMaxOutputTokens } from "../models/limits.ts"
import { customModelDisplayName } from "../models/store.ts"
import { DWEIS_BUILD_AGENT_NAME, DWEIS_GENERAL_SUBAGENT_NAME, DWEIS_PLAN_AGENT_NAME } from "./mode.ts"
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
  /** 自定义请求参数（JSON object 字符串），解析后注入 opencode 模型 options（如 reasoning_effort）。 */
  customParams?: string
}

// 内置工具全部启用；本地 shell、写入和越出私有 scratch workspace 的路径访问经 permission ask
// 进入 ChatService 本地访问策略。默认访问会自动批准普通 bash/文件操作，并可对当前项目内、
// 标准包管理器的依赖操作授予一次任务级窄权限；其余基础安全边界推给 UI。
function dweisPermission(): OpencodePermissionConfig {
  return {
    edit: "ask",
    bash: "ask",
    webfetch: "allow",
    external_directory: "ask",
  } as OpencodePermissionConfig
}

// 覆盖 OpenCode 原生 plan agent 时保留其“不写用户文件”的语义；是否允许本地 shell 仍交给 ChatService 访问策略。
function dweisPlanPermission(): OpencodePermissionConfig {
  return {
    bash: "ask",
    webfetch: "allow",
    external_directory: "ask",
    edit: {
      "*": "deny",
      ".opencode/plans/*.md": "allow",
    },
  } as unknown as OpencodePermissionConfig
}

const REASONING_EFFORT_VARIANTS = {
  low: { reasoningEffort: "low" },
  medium: { reasoningEffort: "medium" },
  high: { reasoningEffort: "high" },
  max: { reasoningEffort: "max" },
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
}

/** Build the OpenCode config for the local self-managed runtime (custom models only). */
export function buildOpencodeConfig({
  customModels = [],
  defaultModel,
  subagentModel,
  subagentReasoningVariant,
  exploreModel,
  exploreReasoningVariant,
  mcpServers,
}: OpencodeConfigOptions): Config {
  const model = resolveDefaultConfigModel(customModels, defaultModel)
  const subagentModelId = subagentModel ? resolveDefaultConfigModel(customModels, subagentModel) : undefined
  const exploreModelId = exploreModel ? resolveDefaultConfigModel(customModels, exploreModel) : undefined
  const permission = dweisPermission()
  const planPermission = dweisPlanPermission()
  const promptCapabilities = { connectors: false }
  const systemPrompt = buildDWeisSystemPrompt(promptCapabilities)
  const planSystemPrompt = buildDWeisPlanSystemPrompt(promptCapabilities)
  return {
    $schema: "https://opencode.ai/config.json",
    model,
    provider: Object.fromEntries(
      customModels.map((model) => [customProviderId(model.id), customProviderConfig(model)]),
    ),
    agent: {
      [DWEIS_BUILD_AGENT_NAME]: {
        description: "Local knowledge and coding assistant",
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
  customModels: OpencodeCustomModel[],
  defaultModel: SubagentModelChoice | undefined,
): string {
  if (defaultModel?.kind === "custom") {
    const customModel = customModels.find((model) => model.id === defaultModel.id)
    if (customModel) return `${customProviderId(customModel.id)}/${customModel.modelName}`
  }
  // 内置云模型在本地 self-managed 模式不可用：一律回退到第一个自定义模型。
  const customModel = customModels[0]
  if (!customModel) throw new Error("A custom model is required for the local Agent runtime.")
  return `${customProviderId(customModel.id)}/${customModel.modelName}`
}

export function customProviderId(id: string): string {
  return `dweis-custom-${id}`
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
        customParams: parseCustomParams(model.customParams),
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
  customParams,
}: {
  name: string
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: Record<string, OpencodeReasoningVariantConfig>
  supportsImages: boolean
  toolCall: boolean
  customParams?: Record<string, unknown>
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
    // 自定义请求参数原样透传给 AI SDK（进请求 body）；保存时已校验为 JSON object。
    ...(customParams ? { options: customParams } : {}),
  }
}

/** 解析持久化的 customParams JSON 字符串；非法（历史脏数据）时忽略并告警。 */
function parseCustomParams(value: string | undefined): Record<string, unknown> | undefined {
  if (!value?.trim()) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // 保存路径已校验；此分支只兜历史脏数据。
  }
  return undefined
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
    : REASONING_EFFORT_VARIANTS
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
