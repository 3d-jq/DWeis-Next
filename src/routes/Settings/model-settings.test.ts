import type { CustomModelSummary } from "../../../electron/models/common.ts"

import { describe, expect, it } from "vitest"
import { customModelsByProvider, filterProviderGroups } from "./model-provider-groups.ts"

function model(overrides: Partial<CustomModelSummary>): CustomModelSummary {
  return {
    id: "id",
    providerId: "custom",
    providerName: "厂商",
    baseUrl: "https://example.com",
    modelName: "model",
    displayName: "模型",
    apiKeyConfigured: true,
    supportsImages: false,
    supportsToolCalls: true,
    ...overrides,
  }
}

describe("customModelsByProvider", () => {
  it("separates user-created custom vendors by providerName (all share providerId=custom)", () => {
    const groups = customModelsByProvider([
      model({ id: "a1", providerName: "厂商A" }),
      model({ id: "b1", providerName: "厂商B" }),
      model({ id: "a2", providerName: "厂商A" }),
    ])
    expect(groups.map((group) => [group.providerName, group.models.map((item) => item.id)])).toEqual([
      ["厂商A", ["a1", "a2"]],
      ["厂商B", ["b1"]],
    ])
  })

  it("keeps models of one preset provider in a single group", () => {
    const groups = customModelsByProvider([
      model({ id: "d1", providerId: "deepseek", providerName: "DeepSeek" }),
      model({ id: "d2", providerId: "deepseek", providerName: "DeepSeek" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.models.map((item) => item.id)).toEqual(["d1", "d2"])
  })

  it("keeps same-name custom vendors together and preserves appearance order", () => {
    const groups = customModelsByProvider([
      model({ id: "a1", providerName: "厂商A" }),
      model({ id: "a2", providerName: "厂商A" }),
      model({ id: "b1", providerName: "厂商B" }),
    ])
    expect(groups.map((group) => group.providerName)).toEqual(["厂商A", "厂商B"])
    expect(groups[0]?.models.map((item) => item.id)).toEqual(["a1", "a2"])
  })
})

describe("filterProviderGroups", () => {
  const groups = customModelsByProvider([
    model({ id: "d1", providerId: "deepseek", providerName: "DeepSeek", displayName: "DeepSeek Chat" }),
    model({ id: "d2", providerId: "deepseek", providerName: "DeepSeek", displayName: "DeepSeek Reasoner" }),
    model({ id: "c1", providerId: "custom", providerName: "我的厂商", displayName: "My Model" }),
  ])

  it("returns all groups unchanged for an empty query", () => {
    expect(filterProviderGroups(groups, "")).toEqual(groups)
    expect(filterProviderGroups(groups, "   ")).toEqual(groups)
  })

  it("keeps the whole group when the provider name matches", () => {
    const filtered = filterProviderGroups(groups, "deepseek")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.models).toHaveLength(2)
  })

  it("filters to matching models when only a model name matches", () => {
    const filtered = filterProviderGroups(groups, "reasoner")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.models.map((item) => item.id)).toEqual(["d2"])
  })

  it("matches custom vendor names in Chinese", () => {
    const filtered = filterProviderGroups(groups, "我的")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.providerName).toBe("我的厂商")
  })

  it("returns nothing when no provider or model matches", () => {
    expect(filterProviderGroups(groups, "不存在")).toEqual([])
  })
})
