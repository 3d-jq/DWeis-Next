import type { ModelChoice } from "../models/common.ts"
import type { RuntimeCustomModel } from "../models/store.ts"

export type ModelAccess = { kind: "local" }

export interface AgentRuntimeResolution {
  defaultModel: ModelChoice | undefined
  key: string
  modelAccess: ModelAccess
  mode: "local"
}

/** 纯本地 self-managed：模型只能来自自定义模型配置。 */
export function resolveAgentRuntime(
  selected: ModelChoice | undefined,
  customModels: readonly RuntimeCustomModel[],
): AgentRuntimeResolution | null {
  const availableCustomModels = customModels.filter(
    (model) => model.id.trim() && model.baseUrl.trim() && model.apiKey.trim() && model.modelName.trim(),
  )
  const selectedCustom =
    selected?.kind === "custom" ? availableCustomModels.find((model) => model.id === selected.id) : undefined
  const customModel = selectedCustom ?? availableCustomModels[0]
  if (!customModel) return null
  return {
    defaultModel: { kind: "custom", id: customModel.id },
    key: `local:${customModel.id}`,
    modelAccess: { kind: "local" },
    mode: "local",
  }
}
