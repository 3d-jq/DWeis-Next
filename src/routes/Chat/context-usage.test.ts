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
    // assistant-2 usage：input(1000) >= cache.read(300) → Anthropic 风格，总量 = input + output = 1200
    //（不再把 300 + 25 缓存重复计入）。
    expect(buildContextUsageInfo(messages, catalog)).toEqual({
      usedTokens: 1200,
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
    // DeepSeek 风格：cache.read(5) > input(10)？否——此夹具 input >= read，按 Anthropic 语义 input 已含缓存。
    expect(
      contextTokensFromUsage({
        input: 10,
        output: 3,
        reasoning: 2,
        cache: { read: 5, write: 1 },
      }),
    ).toBe(13)
  })

  it("does not double count cache tokens for Anthropic-style usage without total", () => {
    // Anthropic 风格：input 已包含缓存读取（input >= cache.read），总量 = input + output。
    expect(
      contextTokensFromUsage({
        input: 10,
        output: 3,
        reasoning: 2,
        cache: { read: 6, write: 4 },
      }),
    ).toBe(13)
  })

  it("sums cache tokens separately for DeepSeek-style usage without total", () => {
    // DeepSeek/OpenAI 兼容风格：input 是未命中部分（cache.read 可大于 input），总量 = input + output + read + write。
    expect(
      contextTokensFromUsage({
        input: 10,
        output: 3,
        reasoning: 2,
        cache: { read: 50, write: 1 },
      }),
    ).toBe(64)
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
    // dsh 口径：text 40/4=10+块 4=14，reasoning 20/4=5+块 4=9，
    // tool input JSON≈26/4=7+块 4=11、output 4/4=1+块 4=5，每消息 role 4×2=8
    const breakdown = buildContextUsageBreakdown(messages, {
      memory: null,
      mcpServerCount: 0,
      skillInventory: null,
      usage: undefined,
    })
    expect(breakdown.messages).toBe(47)
  })

  it("counts skills and memory buckets from inventory and memory content", () => {
    const breakdown = buildContextUsageBreakdown([], {
      memory: { agent: "a".repeat(40), user: "u".repeat(20) },
      mcpServerCount: 0,
      skillInventory: {
        groups: [
          {
            id: "g1",
            name: "release-notes",
            description: "d".repeat(40),
            kind: "local",
            hosts: [],
            externalHosts: [],
            runtimeHosts: [],
          },
        ],
        summary: {
          localSkills: 1,
          managedSkills: 0,
          modifiedHosts: 0,
          needsAttention: 0,
          publishableSkills: 0,
          registrySkills: 0,
          sourceMissingHosts: 0,
          skills: [],
        },
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
    // 回归：contextTokensFromUsage 已按 provider 语义吸收 cache（Anthropic 风格 input 已含缓存），
    // buildContextUsageBreakdown 曾额外 + cache.read 导致 other/total 虚高一个 read 的量。
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", createdAt: 1, parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }] },
    ]
    const usage = { input: 10_000, output: 100, reasoning: 0, cache: { read: 5_000, write: 1_000 } }
    const breakdown = buildContextUsageBreakdown(messages, {
      memory: null,
      mcpServerCount: 0,
      skillInventory: null,
      usage,
    })
    // Anthropic 风格（input >= cache.read）：contextTokensFromUsage = 10000 + 100 = 10100；
    // other = 10100 - known（不再把 5000+1000 缓存重复计入）。
    const expectedTotal =
      breakdown.messages +
      breakdown.tools +
      breakdown.skills +
      breakdown.systemPrompt +
      breakdown.memory +
      breakdown.other
    expect(expectedTotal).toBe(10_100)
    expect(breakdown.other).toBeLessThan(16_100)
  })

  it("attributes the usage gap to other when buckets do not cover the actual prompt", () => {
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", createdAt: 1, parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }] },
    ]
    // DeepSeek 风格（cache.read > input）：input 是未命中部分，总量 = input + output + read + write。
    const usage = { input: 5_000, output: 100, reasoning: 0, cache: { read: 10_000, write: 1_000 } }
    const breakdown = buildContextUsageBreakdown(messages, {
      memory: null,
      mcpServerCount: 0,
      skillInventory: null,
      usage,
    })
    // usage 总量 = 5000 + 100 + 10000 + 1000 = 16100，各桶之和远小于此 → other 吸收差额
    expect(breakdown.other).toBeGreaterThan(10_000)
    expect(breakdown.total).toBe(
      breakdown.messages +
        breakdown.tools +
        breakdown.skills +
        breakdown.systemPrompt +
        breakdown.memory +
        breakdown.other,
    )
  })

  it("falls back to the heuristic estimate when provider usage is absent", () => {
    // dsh 兜底：无 usage 时不再显示 0，用消息 + 工具/系统提示等常量估算。
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", createdAt: 1, parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }] },
    ]
    const info = buildContextUsageInfo(messages, catalog, { memory: null, mcpServerCount: 0, skillInventory: null })
    expect(info?.usedTokens).toBeGreaterThan(0)
    expect(info?.percent).toBeGreaterThan(0)
  })

  it("prefers the larger of provider usage and the heuristic estimate", () => {
    // dsh 取保守大者：usage 异常小（估算 ≈ 消息 18 + 工具 1200 + 系统 2600 = 3818）时用估算，
    // usage 正常大时用真实值——永不低估。
    const base: ChatMessage = {
      id: "m1",
      role: "assistant",
      createdAt: 1,
      parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }],
    }
    const smallUsage = buildContextUsageInfo(
      [{ ...base, tokenUsage: { input: 30, output: 20, reasoning: 0, cache: { read: 0, write: 0 } } }],
      catalog,
      { memory: null, mcpServerCount: 0, skillInventory: null },
    )
    expect(smallUsage?.usedTokens).toBeGreaterThan(3000)
    const bigUsage = buildContextUsageInfo(
      [{ ...base, tokenUsage: { input: 50_000, output: 1_000, reasoning: 0, cache: { read: 10_000, write: 0 } } }],
      catalog,
      { memory: null, mcpServerCount: 0, skillInventory: null },
    )
    // Anthropic 风格（input >= cache.read）：总量 = 50000 + 1000 = 51000，缓存不重复计入。
    expect(bigUsage?.usedTokens).toBe(51_000)
  })

  it("keeps the breakdown total aligned with the estimate fallback", () => {
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", createdAt: 1, parts: [{ kind: "text", partId: "p1", text: "x".repeat(40) }] },
    ]
    const breakdown = buildContextUsageBreakdown(messages, {
      memory: null,
      mcpServerCount: 0,
      skillInventory: null,
      usage: undefined,
    })
    // 无 usage → total = known（估算兜底），other = 0
    expect(breakdown.other).toBe(0)
    expect(breakdown.total).toBeGreaterThan(3000)
    expect(breakdown.total).toBe(
      breakdown.messages +
        breakdown.tools +
        breakdown.skills +
        breakdown.systemPrompt +
        breakdown.memory +
        breakdown.other,
    )
  })
})
