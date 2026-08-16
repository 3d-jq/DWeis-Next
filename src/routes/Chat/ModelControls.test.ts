import type { ModelCatalog } from "../../../electron/models/common.ts"

import { describe, expect, it } from "vitest"
import { selectedModelReasoningLevels } from "./model-reasoning-levels.ts"

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
      reasoningVariants: ["high", "low", "high"],
    },
  ],
}

describe("selectedModelReasoningLevels", () => {
  it("orders the selected custom model reasoning levels by the fixed DWeis order", () => {
    expect(selectedModelReasoningLevels(catalog)).toEqual(["default", "low", "high"])
  })

  it("orders alternative custom reasoning levels by the fixed DWeis order", () => {
    expect(
      selectedModelReasoningLevels({
        ...catalog,
        customModels: [
          {
            ...catalog.customModels[0]!,
            reasoningVariants: ["max", "low", "max"],
          },
        ],
      }),
    ).toEqual(["default", "low", "max"])
  })
})
