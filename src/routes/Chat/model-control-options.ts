import type { ModelCatalog, ModelChoice } from "../../../electron/models/common.ts"

export type ModelTier = "high" | "medium" | "low"

export interface SelectedModelSummary {
  kind: "custom"
  label: string
  supportsImages: boolean
}

export type ModelMenuItem =
  | {
      active: boolean
      choice: ModelChoice
      id: string
      kind: "custom"
      modelId: string
      supportsImages?: boolean
      title: string
    }
  | {
      active: false
      id: string
      kind: "add"
      title: string
    }

export function sameModelChoice(a: ModelChoice | undefined, b: ModelChoice | undefined): boolean {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id)
}

export function selectedModelSummary(catalog: ModelCatalog | null): SelectedModelSummary {
  if (!catalog || !catalog.selected) {
    // 本地 self-managed：无内置模型，未选择时显示占位（由调用方翻译）。
    return { kind: "custom", label: "", supportsImages: false }
  }
  const selected = catalog.selected
  const custom = catalog.customModels.find((model) => model.id === selected.id)
  if (custom) {
    return {
      kind: "custom",
      label: custom.displayName,
      supportsImages: custom.supportsImages,
    }
  }
  return { kind: "custom", label: "", supportsImages: false }
}

export function buildModelMenuItems(catalog: ModelCatalog | null, addTitle: string): ModelMenuItem[] {
  if (!catalog) {
    return [{ active: false, id: "action:add", kind: "add", title: addTitle }]
  }

  return [
    ...catalog.customModels.map((model): ModelMenuItem => {
      const choice: ModelChoice = { kind: "custom", id: model.id }
      return {
        active: sameModelChoice(catalog.selected, choice),
        choice,
        id: `custom:${model.id}`,
        kind: "custom",
        modelId: model.id,
        supportsImages: model.supportsImages,
        title: model.displayName,
      }
    }),
    { active: false, id: "action:add", kind: "add", title: addTitle },
  ]
}

export function combinedModelReasoningLabel(modelLabel: string, reasoningLabel: string): string {
  return `${modelLabel} · ${reasoningLabel}`
}

export function modelReasoningTriggerLabel({
  modelLabel,
  modelRequired,
  modelRequiredLabel,
  reasoningLabel,
}: {
  modelLabel: string
  modelRequired: boolean
  modelRequiredLabel: string
  reasoningLabel: string
}): string {
  return modelRequired ? modelRequiredLabel : combinedModelReasoningLabel(modelLabel, reasoningLabel)
}
