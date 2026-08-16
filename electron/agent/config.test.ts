import type { OpencodeCustomModel } from "./config.ts"

import { describe, expect, it } from "vitest"
import { buildOpencodeConfig } from "./config.ts"
import { DWEIS_GENERAL_SUBAGENT_NAME } from "./mode.ts"

const customModel: OpencodeCustomModel = {
  id: "deepseek-v4-flash",
  providerName: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "sk-test",
  modelName: "deepseek-v4-flash",
  displayName: "DeepSeek V4 Flash",
}

const baseOptions = {
  customModels: [customModel],
  defaultModel: { kind: "custom" as const, id: "deepseek-v4-flash" },
}

describe("buildOpencodeConfig subagent model", () => {
  it("omits the subagent model field by default (follows the main model)", () => {
    const config = buildOpencodeConfig(baseOptions)
    expect(config.agent?.[DWEIS_GENERAL_SUBAGENT_NAME]?.model).toBeUndefined()
  })

  it("injects the chosen custom model into the general subagent config", () => {
    const config = buildOpencodeConfig({
      ...baseOptions,
      subagentModel: { kind: "custom", id: "deepseek-v4-flash" },
    })
    expect(config.agent?.[DWEIS_GENERAL_SUBAGENT_NAME]?.model).toBe(
      `dweis-custom-${customModel.id}/${customModel.modelName}`,
    )
  })

  it("keeps the top-level default model untouched when a subagent model is set", () => {
    const config = buildOpencodeConfig({
      ...baseOptions,
      subagentModel: { kind: "custom", id: "deepseek-v4-flash" },
    })
    expect(config.model).toBe(`dweis-custom-${customModel.id}/${customModel.modelName}`)
  })
})

describe("buildOpencodeConfig mcp servers", () => {
  it("omits the mcp section when no servers are configured", () => {
    const config = buildOpencodeConfig(baseOptions)
    expect(config.mcp).toBeUndefined()
  })

  it("injects local and remote MCP servers", () => {
    const config = buildOpencodeConfig({
      ...baseOptions,
      mcpServers: {
        filesystem: { type: "local", command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
        remote: { type: "remote", url: "https://mcp.example.com/sse" },
      },
    })
    expect(config.mcp).toEqual({
      filesystem: { type: "local", command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
      remote: { type: "remote", url: "https://mcp.example.com/sse" },
    })
  })
})
