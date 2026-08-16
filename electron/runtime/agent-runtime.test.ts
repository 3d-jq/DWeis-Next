import type { RuntimeCustomModel } from "../models/store.ts"

import { describe, expect, test } from "vitest"
import { resolveAgentRuntime } from "./agent-runtime.ts"

const customModels: RuntimeCustomModel[] = [
  {
    id: "custom-a",
    providerId: "custom",
    providerName: "Custom",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "local-key",
    apiKeyConfigured: true,
    modelName: "model-a",
  },
  {
    id: "custom-b",
    providerId: "custom",
    providerName: "Custom",
    baseUrl: "https://example.com/v1",
    apiKey: "remote-key",
    apiKeyConfigured: true,
    modelName: "model-b",
  },
]

describe("resolveAgentRuntime", () => {
  test("returns null when the local runtime has no custom models", () => {
    expect(resolveAgentRuntime({ kind: "custom", id: "custom-a" }, [])).toBeNull()
  })

  test("does not start a local runtime for a custom model without an API key", () => {
    expect(
      resolveAgentRuntime({ kind: "custom", id: "invalid" }, [{ ...customModels[0]!, id: "invalid", apiKey: "" }]),
    ).toBeNull()
  })

  test("uses the selected custom model for the local runtime", () => {
    expect(resolveAgentRuntime({ kind: "custom", id: "custom-b" }, customModels)).toMatchObject({
      defaultModel: { kind: "custom", id: "custom-b" },
      key: "local:custom-b",
      modelAccess: { kind: "local" },
      mode: "local",
    })
  })

  test("falls back to the first available custom model when the selected custom model is not configured", () => {
    expect(resolveAgentRuntime({ kind: "custom", id: "missing" }, customModels)?.defaultModel).toEqual({
      kind: "custom",
      id: "custom-a",
    })
  })
})
