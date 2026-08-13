import type { ChatMessage } from "../../../electron/chat/common.ts"
import type { ModelCatalog } from "../../../electron/models/common.ts"

import { describe, expect, it } from "vitest"
import {
  buildContextUsageBreakdown,
  buildContextUsageInfo,
  contextTokensFromUsage,
  formatTokenCount,
  latestContextTokenUsage,
  selectedModelContextBudget,
  selectedModelContextWindow,
} from "./context-usage.ts"

const catalog: ModelCatalog = {
  selected: { kind: "builtin", id: "oopilot" },
  providers: [],
  customModels: [],
  builtins: [
    {
      id: "oopilot",
      displayName: "Auto",
      providerName: "OOMOL",
      supportsImages: true,
      toolCall: true,
      runtimeKind: "openai-compatible",
      contextWindow: 400_000,
      inputTokenLimit: 256_000,
      maxOutputTokens: 32_000,
    },
  ],
}

describe("chat context usage", () => {
  it("uses the latest assistant token usage snapshot", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: 1,
        parts: [],
        tokenUsage: { input: 100, output: 20, reasoning: 0, cache: { read: 10, write: 0 } },
      },
      {
        id: "user-1",
        role: "user",
        createdAt: 2,
        parts: [],
      },
      {
        id: "assistant-2",
        role: "assistant",
        createdAt: 3,
        parts: [],
        tokenUsage: { input: 1000, output: 200, reasoning: 50, cache: { read: 300, write: 25 } },
      },
    ]

    expect(latestContextTokenUsage(messages)).toEqual(messages[2]?.tokenUsage)
    expect(buildContextUsageInfo(messages, catalog)).toEqual({
      usedTokens: 1525,
      cacheHitRate: 30,
      contextWindowTokens: 400_000,
      inputLimitTokens: 256_000,
      limitTokens: 236_000,
      limitKind: "compaction",
      maxOutputTokens: 32_000,
      compactionThresholdTokens: 236_000,
      percent: 1,
    })
  })

  it("computes cache hit rate with the DeepSeek-style input-as-miss semantics", () => {
    // read > input：input 是未命中部分，命中率 = read / (read + input)。
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: 1,
        parts: [],
        tokenUsage: { input: 1_316_615, output: 15_398, reasoning: 0, cache: { read: 3_615_488, write: 0 } },
      },
    ]
    const info = buildContextUsageInfo(messages, catalog)
    expect(info?.cacheHitRate).toBe(73)
  })

  it("omits cache hit rate when the latest usage has no cache tokens", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: 1,
        parts: [],
        tokenUsage: { input: 100, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ]
    const info = buildContextUsageInfo(messages, catalog)
    expect(info?.cacheHitRate).toBeUndefined()
  })

  it("matches the OpenCode overflow fallback when total tokens are absent", () => {
    expect(
      contextTokensFromUsage({
        input: 10,
        output: 3,
        reasoning: 2,
        cache: { read: 5, write: 1 },
      }),
    ).toBe(19)
  })

  it("prefers provider total tokens when present", () => {
    expect(
      contextTokensFromUsage({
        total: 42,
        input: 10,
        output: 3,
        reasoning: 2,
        cache: { read: 5, write: 1 },
      }),
    ).toBe(42)
  })

  it("does not invent a percentage for custom models without a known context window", () => {
    const customCatalog: ModelCatalog = {
      ...catalog,
      selected: { kind: "custom", id: "custom-1" },
      customModels: [
        {
          id: "custom-1",
          providerId: "custom",
          providerName: "Custom",
          baseUrl: "",
          modelName: "custom-model",
          displayName: "Custom",
          apiKeyConfigured: true,
          supportsImages: false,
          supportsToolCalls: true,
        },
      ],
    }
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: 1,
        parts: [],
        tokenUsage: { input: 1500, output: 200, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ]

    expect(selectedModelContextWindow(customCatalog)).toBeUndefined()
    expect(buildContextUsageInfo(messages, customCatalog)).toEqual({ usedTokens: 1700 })
  })

  it("uses the custom model compaction threshold when a context window is configured", () => {
    const customCatalog: ModelCatalog = {
      ...catalog,
      selected: { kind: "custom", id: "custom-1" },
      customModels: [
        {
          id: "custom-1",
          providerId: "custom",
          providerName: "Custom",
          baseUrl: "",
          modelName: "custom-model",
          displayName: "Custom",
          apiKeyConfigured: true,
          supportsImages: false,
          supportsToolCalls: true,
          contextWindow: 100_000,
        },
      ],
    }
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: 1,
        parts: [],
        tokenUsage: { input: 1500, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ]

    expect(selectedModelContextWindow(customCatalog)).toBe(100_000)
    expect(selectedModelContextBudget(customCatalog)).toEqual({
      contextLimitTokens: 100_000,
      contextWindowTokens: 100_000,
      compactionThresholdTokens: 68_000,
    })
    expect(buildContextUsageInfo(messages, customCatalog)).toEqual({
      usedTokens: 2000,
      contextWindowTokens: 100_000,
      limitTokens: 68_000,
      limitKind: "compaction",
      compactionThresholdTokens: 68_000,
      percent: 3,
    })
  })

  it("preserves a zero compaction threshold", () => {
    const customCatalog: ModelCatalog = {
      ...catalog,
      selected: { kind: "custom", id: "custom-1" },
      customModels: [
        {
          id: "custom-1",
          providerId: "custom",
          providerName: "Custom",
          baseUrl: "",
          modelName: "custom-model",
          displayName: "Custom",
          apiKeyConfigured: true,
          supportsImages: false,
          supportsToolCalls: true,
          contextWindow: 10_000,
        },
      ],
    }
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: 1,
        parts: [],
        tokenUsage: { input: 40, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ]

    expect(buildContextUsageInfo(messages, customCatalog)).toEqual({
      usedTokens: 50,
      contextWindowTokens: 10_000,
      limitTokens: 0,
      limitKind: "compaction",
      compactionThresholdTokens: 0,
      percent: 100,
    })
  })

  it("prefers the input token limit over the full context window", () => {
    const customCatalog: ModelCatalog = {
      ...catalog,
      selected: { kind: "custom", id: "custom-1" },
      customModels: [
        {
          id: "custom-1",
          providerId: "custom",
          providerName: "Custom",
          baseUrl: "",
          modelName: "custom-model",
          displayName: "Custom",
          apiKeyConfigured: true,
          supportsImages: false,
          supportsToolCalls: true,
          contextWindow: 1_000_000,
          inputTokenLimit: 128_000,
        },
      ],
    }

    expect(selectedModelContextWindow(customCatalog)).toBe(128_000)
  })

  it("prefers the input token limit for built-in models", () => {
    const builtinCatalog: ModelCatalog = {
      ...catalog,
      builtins: [
        {
          ...catalog.builtins[0]!,
          contextWindow: 1_000_000,
          inputTokenLimit: 128_000,
        },
      ],
    }

    expect(selectedModelContextWindow(builtinCatalog)).toBe(128_000)
  })

  it("formats token counts as plain numbers", () => {
    expect(formatTokenCount(42)).toBe("42")
    expect(formatTokenCount(1200)).toBe("1,200")
    expect(formatTokenCount(12_000)).toBe("12,000")
    expect(formatTokenCount(999_950)).toBe("999,950")
    expect(formatTokenCount(1_500_000)).toBe("1,500,000")
  })
})

describe("buildContextUsageBreakdown", () => {
  it("estimates messages from text, reasoning and tool parts", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "user",
        createdAt: 1,
        parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }],
      },
      {
        id: "m2",
        role: "assistant",
        createdAt: 2,
        parts: [
          { kind: "reasoning", partId: "p2", text: "y".repeat(20) },
          { kind: "tool", partId: "p3", input: { cmd: "z".repeat(16) }, output: "w".repeat(4) },
        ],
      },
    ]
    // text 40/4=10，reasoning 20/4=5，tool (JSON input≈24 + output 4)/4=7
    const breakdown = buildContextUsageBreakdown(messages, { memory: null, mcpServerCount: 0, skillInventory: null, usage: undefined })
    expect(breakdown.messages).toBe(23)
  })

  it("counts skills and memory buckets from inventory and memory content", () => {
    const breakdown = buildContextUsageBreakdown([], {
      memory: { agent: "a".repeat(40), user: "u".repeat(20) },
      mcpServerCount: 0,
      skillInventory: {
        groups: [
          { id: "g1", name: "release-notes", description: "d".repeat(40), kind: "local", hosts: [], externalHosts: [], runtimeHosts: [] },
        ],
        summary: { localSkills: 1, managedSkills: 0, modifiedHosts: 0, needsAttention: 0, publishableSkills: 0, registrySkills: 0, sourceMissingHosts: 0, skills: [] },
        updatedAt: "",
      },
      usage: undefined,
    })
    // memory 块 ≈ (40 + 20 + 标题) / 4 ≈ 16
    expect(breakdown.memory).toBeGreaterThan(0)
    // 技能块 = "release-notes/dddd.../…" ≈ (12 + 40 + 2) / 4 ≈ 13
    expect(breakdown.skills).toBe(14)
    // 工具桶含内置常量
    expect(breakdown.tools).toBeGreaterThan(1000)
  })

  it("does not double count cache.read in the usage total", () => {
    // 回归：contextTokensFromUsage 已含 cache.read（input+output+cache 分支），
    // buildContextUsageBreakdown 曾额外 + cache.read 导致 other/total 虚高一个 read 的量。
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", createdAt: 1, parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }] },
    ]
    const usage = { input: 10_000, output: 100, reasoning: 0, cache: { read: 5_000, write: 1_000 } }
    const breakdown = buildContextUsageBreakdown(messages, { memory: null, mcpServerCount: 0, skillInventory: null, usage })
    // contextTokensFromUsage = 10000 + 100 + 5000 + 1000 = 16100；other = 16100 - known。
    const expectedTotal = breakdown.messages + breakdown.tools + breakdown.skills + breakdown.systemPrompt + breakdown.memory + breakdown.other
    expect(expectedTotal).toBeLessThan(17_000)
    expect(breakdown.other).toBeLessThan(16_100)
  })

  it("attributes the usage gap to other when buckets do not cover the actual prompt", () => {
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", createdAt: 1, parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }] },
    ]
    const usage = { input: 10_000, output: 100, reasoning: 0, cache: { read: 5_000, write: 1_000 } }
    const breakdown = buildContextUsageBreakdown(messages, { memory: null, mcpServerCount: 0, skillInventory: null, usage })
    // usage 总量 = input + cache.read = 15000，各桶之和远小于此 → other 吸收差额
    expect(breakdown.other).toBeGreaterThan(10_000)
    expect(breakdown.total).toBe(breakdown.messages + breakdown.tools + breakdown.skills + breakdown.systemPrompt + breakdown.memory + breakdown.other)
  })
})
