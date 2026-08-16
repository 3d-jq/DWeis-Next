import type { ModelCatalog } from "../../../electron/models/common.ts"

import { describe, expect, it } from "vitest"
import {
  buildModelMenuItems,
  combinedModelReasoningLabel,
  modelReasoningTriggerLabel,
  selectedModelSummary,
} from "./model-control-options.ts"

const catalog: ModelCatalog = {
  selected: { kind: "custom", id: "custom-1" },
  providers: [],
  builtins: [],
  customModels: [
    {
      id: "custom-1",
      providerId: "custom",
      providerName: "Custom",
      baseUrl: "https://models.example.test/v1",
      modelName: "custom-model",
      displayName: "Custom Model",
      apiKeyConfigured: true,
      supportsImages: false,
      supportsToolCalls: true,
    },
  ],
}

describe("model control options", () => {
  it("summarizes the selected custom model", () => {
    expect(selectedModelSummary(catalog)).toEqual({ kind: "custom", label: "Custom Model", supportsImages: false })
  })

  it("shows an empty model label before a model is configured", () => {
    expect(selectedModelSummary(null)).toEqual({ kind: "custom", label: "", supportsImages: false })
  })

  it("builds custom and add rows in order", () => {
    expect(buildModelMenuItems(catalog, "Configure").map((item) => item.id)).toEqual(["custom:custom-1", "action:add"])
  })

  it("preserves custom model identity for model presentation", () => {
    const customCatalog: ModelCatalog = { ...catalog, selected: { kind: "custom", id: "custom-1" } }
    expect(selectedModelSummary(customCatalog)).toEqual({
      kind: "custom",
      label: "Custom Model",
      supportsImages: false,
    })
    expect(buildModelMenuItems(customCatalog, "Configure").find((item) => item.kind === "custom")).toMatchObject({
      kind: "custom",
      title: "Custom Model",
    })
  })

  it("combines model and reasoning labels for the compact trigger", () => {
    expect(combinedModelReasoningLabel("Custom Model", "High")).toBe("Custom Model · High")
  })

  it("shows the configuration prompt instead of a fallback model when a model is required", () => {
    expect(
      modelReasoningTriggerLabel({
        modelLabel: "Auto",
        modelRequired: true,
        modelRequiredLabel: "Select or configure model",
        reasoningLabel: "Default",
      }),
    ).toBe("Select or configure model")
  })
})
