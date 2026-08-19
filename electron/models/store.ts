import type { DWeisReasoningVariant } from "../agent/reasoning.ts"
import type { CustomModelProvider, CustomModelSummary, ModelCatalog, ModelChoice, ModelProtocol } from "./common.ts"
import type { ModelCredentialStore } from "./credential-store.ts"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { atomicWriteText } from "../atomic-file.ts"
import { externalModelProviderBaseUrls } from "../domain.ts"
import { logStoreReadFailure } from "../store-diagnostics.ts"

const providerBaseUrls = externalModelProviderBaseUrls
const millionTokenContextWindow = 1_000_000
const gemini3InputTokenLimit = 1_048_576
const gemini3MaxOutputTokens = 65_536
const gemini3ContextWindow = gemini3InputTokenLimit + gemini3MaxOutputTokens
const deepSeekV4ReasoningVariants = ["low", "high", "max"] as const satisfies readonly DWeisReasoningVariant[]
const glm52ReasoningVariants = ["high", "max"] as const satisfies readonly DWeisReasoningVariant[]
const kimiK3ReasoningVariants = ["low", "high", "max"] as const satisfies readonly DWeisReasoningVariant[]

export interface PersistedCustomModel {
  id: string
  providerId: string
  providerName: string
  baseUrl: string
  apiKeyConfigured: boolean
  modelName: string
  displayName?: string
  /** API 协议：openai（默认）/ anthropic。 */
  protocol?: ModelProtocol
  supportsImages?: boolean
  supportsToolCalls?: boolean
  contextWindow?: number
  inputTokenLimit?: number
  maxOutputTokens?: number
  reasoningVariants?: DWeisReasoningVariant[]
  /** 自定义请求参数（JSON object 字符串，透传到 opencode 模型 options）。 */
  customParams?: string
}

export interface RuntimeCustomModel extends PersistedCustomModel {
  apiKey: string
}

export interface PersistedModels {
  selected?: ModelChoice
  customModels?: PersistedCustomModel[]
}

export interface ModelsStoreOptions {
  writeText?: typeof atomicWriteText
}

export const CUSTOM_MODEL_PROVIDERS: CustomModelProvider[] = [
  {
    id: "deepseek",
    displayName: "DeepSeek",
    baseUrl: providerBaseUrls.deepseek,
    modelOptions: [
      {
        id: "deepseek-v4-flash",
        displayName: "DeepSeek V4 Flash",
        contextWindow: millionTokenContextWindow,
        reasoningVariants: deepSeekV4ReasoningVariants,
      },
      {
        id: "deepseek-v4-pro",
        displayName: "DeepSeek V4 Pro",
        contextWindow: millionTokenContextWindow,
        reasoningVariants: deepSeekV4ReasoningVariants,
      },
    ],
    supportsImages: false,
    supportsToolCalls: true,
    requiresBaseUrl: true,
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    baseUrl: providerBaseUrls.openrouter,
    requiresBaseUrl: true,
  },
  {
    id: "gemini",
    displayName: "Gemini",
    baseUrl: providerBaseUrls.gemini,
    modelOptions: [
      {
        id: "gemini-3.5-flash",
        displayName: "Gemini 3.5 Flash",
        supportsImages: true,
        supportsToolCalls: true,
        contextWindow: gemini3ContextWindow,
      },
      {
        id: "gemini-3.1-pro-preview",
        displayName: "Gemini 3.1 Pro Preview",
        supportsImages: true,
        supportsToolCalls: true,
        contextWindow: gemini3ContextWindow,
      },
    ],
    supportsImages: true,
    supportsToolCalls: true,
    requiresBaseUrl: true,
  },
  {
    id: "zhipu",
    displayName: "GLM API",
    baseUrl: providerBaseUrls.zhipuCn,
    apiPlans: [
      {
        id: "standard",
        baseUrl: providerBaseUrls.zhipuCn,
        apiRegions: [
          { id: "cn", baseUrl: providerBaseUrls.zhipuCn },
          { id: "global", baseUrl: providerBaseUrls.zhipuGlobal },
        ],
      },
      {
        id: "coding",
        baseUrl: providerBaseUrls.zhipuCoding,
      },
    ],
    apiRegions: [
      { id: "cn", baseUrl: providerBaseUrls.zhipuCn },
      { id: "global", baseUrl: providerBaseUrls.zhipuGlobal },
    ],
    modelOptions: [
      {
        id: "glm-5.2",
        displayName: "GLM-5.2",
        contextWindow: millionTokenContextWindow,
        reasoningVariants: glm52ReasoningVariants,
      },
    ],
    supportsImages: false,
    supportsToolCalls: true,
    requiresBaseUrl: true,
  },
  {
    id: "kimi",
    displayName: "Kimi",
    baseUrl: providerBaseUrls.kimiCn,
    apiRegions: [
      { id: "cn", baseUrl: providerBaseUrls.kimiCn },
      { id: "global", baseUrl: providerBaseUrls.kimiGlobal },
    ],
    modelOptions: [
      {
        id: "kimi-k3",
        displayName: "Kimi K3",
        supportsImages: true,
        contextWindow: millionTokenContextWindow,
        reasoningVariants: kimiK3ReasoningVariants,
      },
    ],
    supportsToolCalls: true,
    requiresBaseUrl: true,
  },
  {
    id: "minimax",
    displayName: "MiniMax",
    baseUrl: providerBaseUrls.minimaxCn,
    apiRegions: [
      { id: "cn", baseUrl: providerBaseUrls.minimaxCn },
      { id: "global", baseUrl: providerBaseUrls.minimaxGlobal },
    ],
    modelOptions: [
      {
        id: "MiniMax-M3",
        displayName: "MiniMax M3",
        supportsImages: true,
        contextWindow: millionTokenContextWindow,
      },
    ],
    supportsToolCalls: true,
    requiresBaseUrl: true,
  },
  {
    id: "qwen",
    displayName: "Qwen",
    baseUrl: providerBaseUrls.qwenStandardCn,
    apiPlans: [
      {
        id: "standard",
        baseUrl: providerBaseUrls.qwenStandardCn,
        apiRegions: [
          { id: "cn", baseUrl: providerBaseUrls.qwenStandardCn },
          { id: "global", baseUrl: providerBaseUrls.qwenStandardGlobal },
        ],
      },
      {
        id: "coding",
        baseUrl: providerBaseUrls.qwenCodingCn,
        apiRegions: [
          { id: "cn", baseUrl: providerBaseUrls.qwenCodingCn },
          { id: "global", baseUrl: providerBaseUrls.qwenCodingGlobal },
        ],
      },
    ],
    apiRegions: [
      { id: "cn", baseUrl: providerBaseUrls.qwenStandardCn },
      { id: "global", baseUrl: providerBaseUrls.qwenStandardGlobal },
    ],
    modelOptions: [
      {
        id: "qwen3.7-plus",
        displayName: "Qwen3.7 Plus",
        supportsImages: true,
        contextWindow: millionTokenContextWindow,
      },
      {
        id: "qwen3.7-max",
        displayName: "Qwen3.7 Max",
        supportsImages: true,
        contextWindow: millionTokenContextWindow,
      },
    ],
    supportsToolCalls: true,
    requiresBaseUrl: true,
  },
  {
    id: "xiaomi",
    displayName: "Xiaomi MiMo",
    baseUrl: providerBaseUrls.xiaomiStandard,
    apiPlans: [
      {
        id: "standard",
        baseUrl: providerBaseUrls.xiaomiStandard,
      },
      {
        id: "token",
        baseUrl: providerBaseUrls.xiaomiTokenCn,
        apiRegions: [
          { id: "cn", baseUrl: providerBaseUrls.xiaomiTokenCn },
          { id: "sgp", baseUrl: providerBaseUrls.xiaomiTokenSgp },
          { id: "ams", baseUrl: providerBaseUrls.xiaomiTokenAms },
        ],
      },
    ],
    modelOptions: [
      {
        id: "mimo-v2.5-pro",
        displayName: "MiMo V2.5 Pro",
        supportsImages: false,
        contextWindow: millionTokenContextWindow,
      },
      {
        id: "mimo-v2.5",
        displayName: "MiMo V2.5",
        supportsImages: true,
        contextWindow: millionTokenContextWindow,
      },
    ],
    supportsToolCalls: true,
    requiresBaseUrl: true,
  },
  {
    id: "custom",
    displayName: "Custom",
    baseUrl: "",
    requiresBaseUrl: true,
  },
]

export function customModelDisplayName(
  model: Pick<PersistedCustomModel, "displayName" | "modelName"> & { providerId?: string },
): string {
  const explicitName = model.displayName?.trim()
  if (explicitName) return explicitName
  const provider = CUSTOM_MODEL_PROVIDERS.find((item) => item.id === model.providerId)
  const option = provider?.modelOptions?.find((item) => item.id === model.modelName.trim())
  return option?.displayName?.trim() || model.modelName.trim()
}

export function customProviderModelSupportsImages(
  provider: CustomModelProvider | undefined,
  modelName: string,
): boolean {
  const option = provider?.modelOptions?.find((model) => model.id === modelName.trim())
  return option?.supportsImages ?? provider?.supportsImages ?? false
}

/** 模型/提供商的 API 协议（openai 默认 / anthropic）。 */
export function customProviderProtocol(provider: CustomModelProvider | undefined, modelName?: string): ModelProtocol {
  const option = modelName ? provider?.modelOptions?.find((model) => model.id === modelName.trim()) : undefined
  return option?.protocol ?? provider?.protocol ?? "openai"
}

export function customProviderModelSupportsToolCalls(
  provider: CustomModelProvider | undefined,
  modelName: string,
): boolean {
  const option = provider?.modelOptions?.find((model) => model.id === modelName.trim())
  return option?.supportsToolCalls ?? provider?.supportsToolCalls ?? true
}

export function customProviderModelContextWindow(
  provider: CustomModelProvider | undefined,
  modelName: string,
): number | undefined {
  const option = provider?.modelOptions?.find((model) => model.id === modelName.trim())
  return option?.contextWindow ?? provider?.contextWindow
}

export function customProviderModelMaxOutputTokens(
  provider: CustomModelProvider | undefined,
  modelName: string,
): number | undefined {
  const option = provider?.modelOptions?.find((model) => model.id === modelName.trim())
  return option?.maxOutputTokens ?? provider?.maxOutputTokens
}

export function customProviderModelInputTokenLimit(
  provider: CustomModelProvider | undefined,
  modelName: string,
): number | undefined {
  const option = provider?.modelOptions?.find((model) => model.id === modelName.trim())
  return option?.inputTokenLimit ?? provider?.inputTokenLimit
}

export function customProviderModelReasoningVariants(
  provider: CustomModelProvider | undefined,
  modelName: string,
): DWeisReasoningVariant[] | undefined {
  const option = provider?.modelOptions?.find((model) => model.id === modelName.trim())
  const variants = option?.reasoningVariants ?? provider?.reasoningVariants
  return variants ? [...variants] : undefined
}

export function publicCustomModel(model: PersistedCustomModel): CustomModelSummary {
  return {
    id: model.id,
    providerId: model.providerId,
    providerName: model.providerName,
    baseUrl: model.baseUrl,
    modelName: model.modelName,
    displayName: customModelDisplayName(model),
    apiKeyConfigured: model.apiKeyConfigured,
    ...(model.protocol ? { protocol: model.protocol } : {}),
    supportsImages: model.supportsImages === true,
    supportsToolCalls: model.supportsToolCalls !== false,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(model.inputTokenLimit ? { inputTokenLimit: model.inputTokenLimit } : {}),
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(model.reasoningVariants ? { reasoningVariants: model.reasoningVariants } : {}),
    ...(model.customParams ? { customParams: model.customParams } : {}),
  }
}

export function sanitizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("Base URL is required.")
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error("Base URL must be a valid URL.")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL must start with http:// or https://.")
  }
  return trimmed.replace(/\/+$/, "")
}

export function sanitizeOptionalTokenLimit(value: number | undefined, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`)
  }
  return value
}

/** 校验自定义请求参数：必须可解析为 JSON object（值为 JSON 的扁平键值），返回规范化字符串；空 → undefined。 */
export function sanitizeCustomParams(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error("Custom params must be a valid JSON object.")
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Custom params must be a JSON object.")
  }
  return JSON.stringify(parsed)
}

export function isKnownModelChoice(models: PersistedModels, choice: ModelChoice | undefined): choice is ModelChoice {
  if (!choice) {
    return false
  }
  return Boolean(models.customModels?.some((model) => model.id === choice.id))
}

export class ModelsStore {
  private readonly file: string
  private migration: Promise<void> | null = null

  public constructor(
    dir: string,
    private readonly credentials: ModelCredentialStore,
    private readonly options: ModelsStoreOptions = {},
  ) {
    this.file = path.join(dir, "models.json")
  }

  public async read(): Promise<PersistedModels> {
    try {
      await this.ensureLegacyCredentialsMigrated()
    } catch (error) {
      logStoreReadFailure("model credential migration", this.file, error)
    }
    return this.readMetadata()
  }

  private async readMetadata(): Promise<PersistedModels> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf-8")) as PersistedModels
      return {
        selected: isKnownModelChoice(parsed, parsed.selected) ? parsed.selected : undefined,
        customModels: Array.isArray(parsed.customModels) ? parsed.customModels.filter(isPersistedCustomModel) : [],
      }
    } catch (error) {
      logStoreReadFailure("models", this.file, error)
      return { selected: undefined, customModels: [] }
    }
  }

  public async write(models: PersistedModels): Promise<void> {
    await (this.options.writeText ?? atomicWriteText)(
      this.file,
      JSON.stringify(persistedModelsPayload(models), null, 2),
      {
        mode: 0o600,
      },
    )
  }

  public async catalog(): Promise<ModelCatalog> {
    const models = await this.read()
    return {
      builtins: [],
      customModels: (models.customModels ?? []).map(publicCustomModel),
      providers: CUSTOM_MODEL_PROVIDERS,
      selected: isKnownModelChoice(models, models.selected) ? models.selected : undefined,
    }
  }

  public async runtimeCustomModels(): Promise<RuntimeCustomModel[]> {
    return (await this.runtimeModels()).customModels
  }

  public async runtimeModels(): Promise<{ customModels: RuntimeCustomModel[]; selected: ModelChoice | undefined }> {
    const models = await this.read()
    const customModels = await Promise.all(
      (models.customModels ?? []).filter(isRuntimeCustomModelMetadata).map(async (model) => {
        let apiKey: string | undefined
        try {
          apiKey = await this.credentials.get(model.id)
        } catch (error) {
          logStoreReadFailure("model credentials", this.file, error)
        }
        return apiKey ? { ...model, apiKey } : null
      }),
    )
    return {
      customModels: customModels.filter((model): model is RuntimeCustomModel => model !== null),
      selected: models.selected ?? undefined,
    }
  }

  public credentialStore(): ModelCredentialStore {
    return this.credentials
  }

  private async ensureLegacyCredentialsMigrated(): Promise<void> {
    if (!this.migration) {
      this.migration = this.migrateLegacyCredentials().catch((error: unknown) => {
        this.migration = null
        throw error
      })
    }
    await this.migration
  }

  private async migrateLegacyCredentials(): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(this.file, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      // 损坏元数据仍由 readMetadata 的既有容错路径处理；这里绝不能覆盖原文件。
      return
    }
    if (!parsed || typeof parsed !== "object") return
    const raw = parsed as { customModels?: unknown; selected?: ModelChoice }
    if (!Array.isArray(raw.customModels)) return
    const legacyModels = raw.customModels.filter(isLegacyCustomModel)
    if (legacyModels.length === 0) return
    // 先原子写入全部密文；成功后才清理 models.json 明文。任一步失败都保留至少一份有效凭证。
    await this.credentials.setMany(
      new Map(legacyModels.filter((model) => model.apiKey.trim()).map((model) => [model.id, model.apiKey])),
    )
    const customModels = raw.customModels
      .map(migrateCustomModelMetadata)
      .filter((model): model is PersistedCustomModel => model !== null)
    await this.write({
      selected: isKnownModelChoice({ customModels }, raw.selected) ? raw.selected : undefined,
      customModels,
    })
  }
}

function persistedModelsPayload(models: PersistedModels): PersistedModels {
  return {
    ...(models.selected ? { selected: models.selected } : {}),
    customModels: (models.customModels ?? []).map((model) => ({
      id: model.id,
      providerId: model.providerId,
      providerName: model.providerName,
      baseUrl: model.baseUrl,
      apiKeyConfigured: model.apiKeyConfigured,
      modelName: model.modelName,
      ...(model.displayName ? { displayName: model.displayName } : {}),
      ...(model.protocol ? { protocol: model.protocol } : {}),
      ...(model.supportsImages === undefined ? {} : { supportsImages: model.supportsImages }),
      ...(model.supportsToolCalls === undefined ? {} : { supportsToolCalls: model.supportsToolCalls }),
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
      ...(model.inputTokenLimit ? { inputTokenLimit: model.inputTokenLimit } : {}),
      ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
      ...(model.reasoningVariants ? { reasoningVariants: model.reasoningVariants } : {}),
    })),
  }
}

function isRuntimeCustomModelMetadata(model: PersistedCustomModel): boolean {
  return Boolean(model.id.trim() && model.baseUrl.trim() && model.apiKeyConfigured && model.modelName.trim())
}

function isPersistedCustomModel(value: unknown): value is PersistedCustomModel {
  if (!value || typeof value !== "object") {
    return false
  }
  const model = value as Record<string, unknown>
  return (
    typeof model.id === "string" &&
    typeof model.providerId === "string" &&
    typeof model.providerName === "string" &&
    typeof model.baseUrl === "string" &&
    typeof model.apiKeyConfigured === "boolean" &&
    typeof model.modelName === "string" &&
    (model.displayName === undefined || typeof model.displayName === "string") &&
    (model.supportsImages === undefined || typeof model.supportsImages === "boolean") &&
    (model.supportsToolCalls === undefined || typeof model.supportsToolCalls === "boolean") &&
    (model.contextWindow === undefined || isPositiveSafeInteger(model.contextWindow)) &&
    (model.inputTokenLimit === undefined || isPositiveSafeInteger(model.inputTokenLimit)) &&
    (model.maxOutputTokens === undefined || isPositiveSafeInteger(model.maxOutputTokens)) &&
    (model.reasoningVariants === undefined || isReasoningVariantArray(model.reasoningVariants)) &&
    (model.customParams === undefined || typeof model.customParams === "string")
  )
}

interface LegacyCustomModel extends Omit<PersistedCustomModel, "apiKeyConfigured"> {
  apiKey: string
}

function isLegacyCustomModel(value: unknown): value is LegacyCustomModel {
  if (!value || typeof value !== "object") return false
  const model = value as Record<string, unknown>
  return typeof model.id === "string" && typeof model.apiKey === "string"
}

function migrateCustomModelMetadata(value: unknown): PersistedCustomModel | null {
  if (isPersistedCustomModel(value)) return value
  if (!isLegacyCustomModel(value)) return null
  const { apiKey: _apiKey, ...metadata } = value
  const migrated = { ...metadata, apiKeyConfigured: _apiKey.trim().length > 0 }
  return isPersistedCustomModel(migrated) ? migrated : null
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isReasoningVariantArray(value: unknown): value is DWeisReasoningVariant[] {
  return (
    Array.isArray(value) &&
    value.every((item) => item === "low" || item === "medium" || item === "high" || item === "max")
  )
}
