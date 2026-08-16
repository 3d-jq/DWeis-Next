import type { ModelCatalog } from "../../../electron/models/common.ts"

import { describe, expect, test } from "vitest"
import { modelCatalogForRuntime } from "./useModelCatalog.ts"

const catalog: ModelCatalog = {
  builtins: [],
  customModels: [
    {
      id: "local-1",
      providerId: "custom",
      providerName: "Custom",
      baseUrl: "https://models.example.test/v1",
      modelName: "local-1",
      displayName: "Local 1",
      apiKeyConfigured: true,
      supportsImages: false,
      supportsToolCalls: true,
    },
  ],
  providers: [],
  selected: undefined,
}

describe("model catalog runtime projection", () => {
  test("selects a custom fallback when no model is configured", () => {
    expect(modelCatalogForRuntime(catalog)).toMatchObject({
      builtins: [],
      selected: { kind: "custom", id: "local-1" },
    })
  })

  test("keeps the selected custom model in local mode", () => {
    const withSelection: ModelCatalog = { ...catalog, selected: { kind: "custom", id: "local-1" } }
    expect(modelCatalogForRuntime(withSelection)).toMatchObject({
      builtins: [],
      selected: { kind: "custom", id: "local-1" },
    })
  })
})
