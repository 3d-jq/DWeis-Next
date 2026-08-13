import { describe, expect, it } from "vitest"
import type { McpServerEntry } from "./common.ts"
import {
  fromOpencodeMcpConfig,
  mcpEntryFromJson,
  mcpEntryToJson,
  normalizeMcpServerEntry,
  normalizeMcpTransportType,
  parseKeyValueLines,
  stringifyKeyValueLines,
  toOpencodeMcpConfig,
} from "./common.ts"

describe("normalizeMcpTransportType", () => {
  it("accepts the new transport types", () => {
    expect(normalizeMcpTransportType("stdio")).toBe("stdio")
    expect(normalizeMcpTransportType("http")).toBe("http")
    expect(normalizeMcpTransportType("sse")).toBe("sse")
  })

  it("migrates legacy local/remote", () => {
    expect(normalizeMcpTransportType("local")).toBe("stdio")
    expect(normalizeMcpTransportType("remote")).toBe("http")
    expect(normalizeMcpTransportType("nonsense")).toBeNull()
  })
})

describe("normalizeMcpServerEntry", () => {
  it("fills defaults and drops empty fields", () => {
    expect(normalizeMcpServerEntry({ id: "mcp-1", name: "x", type: "stdio", enabled: true })).toEqual({
      id: "mcp-1",
      name: "x",
      type: "stdio",
      enabled: true,
    })
    expect(
      normalizeMcpServerEntry({
        id: "mcp-2",
        name: "y",
        type: "sse",
        url: "https://x/sse",
        headers: { Authorization: "Bearer t" },
        timeout: 3000,
        enabled: false,
      }),
    ).toEqual({
      id: "mcp-2",
      name: "y",
      type: "sse",
      url: "https://x/sse",
      headers: { Authorization: "Bearer t" },
      timeout: 3000,
      enabled: false,
    })
  })

  it("rejects malformed entries", () => {
    expect(normalizeMcpServerEntry(null)).toBeNull()
    expect(normalizeMcpServerEntry({ id: 1, name: "x", type: "stdio" })).toBeNull()
    expect(normalizeMcpServerEntry({ id: "mcp-1", name: "x", type: "nope" })).toBeNull()
  })
})

describe("toOpencodeMcpConfig", () => {
  it("converts stdio to a local config with command array", () => {
    expect(
      toOpencodeMcpConfig({
        id: "mcp-1",
        name: "filesystem",
        type: "stdio",
        command: "npx",
        args: "-y @modelcontextprotocol/server-filesystem /tmp",
        cwd: "/workspace",
        environment: { NODE_ENV: "production" },
        timeout: 10_000,
        enabled: true,
      }),
    ).toEqual({
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      cwd: "/workspace",
      environment: { NODE_ENV: "production" },
      timeout: 10_000,
    })
  })

  it("marks disabled servers explicitly and omits empty fields", () => {
    expect(toOpencodeMcpConfig({ id: "mcp-1", name: "x", type: "stdio", command: "npx", enabled: false })).toEqual({
      type: "local",
      command: ["npx"],
      enabled: false,
    })
  })

  it("converts http/sse to remote configs", () => {
    expect(toOpencodeMcpConfig({ id: "mcp-2", name: "r", type: "sse", url: "https://x/mcp/sse", enabled: true })).toEqual({
      type: "remote",
      url: "https://x/mcp/sse",
    })
    expect(
      toOpencodeMcpConfig({
        id: "mcp-3",
        name: "h",
        type: "http",
        url: "https://x/mcp",
        headers: { Authorization: "Bearer t" },
        enabled: true,
      }),
    ).toEqual({ type: "remote", url: "https://x/mcp", headers: { Authorization: "Bearer t" } })
  })
})

describe("fromOpencodeMcpConfig", () => {
  it("converts a local config back to a stdio entry", () => {
    const entry = fromOpencodeMcpConfig("filesystem", {
      type: "local",
      command: ["npx", "-y", "server"],
      environment: { A: "1" },
      timeout: 5000,
    })
    expect(entry).toMatchObject({
      name: "filesystem",
      type: "stdio",
      command: "npx",
      args: "-y server",
      environment: { A: "1" },
      timeout: 5000,
      enabled: true,
    })
    expect(entry?.id).toBeTruthy()
  })

  it("infers sse vs http from the url", () => {
    expect(fromOpencodeMcpConfig("a", { type: "remote", url: "https://x/mcp/sse" })).toMatchObject({
      type: "sse",
      url: "https://x/mcp/sse",
    })
    expect(fromOpencodeMcpConfig("b", { type: "remote", url: "https://x/mcp" })).toMatchObject({
      type: "http",
      url: "https://x/mcp",
    })
  })

  it("rejects configs without a command or url", () => {
    expect(fromOpencodeMcpConfig("a", { type: "local", command: [] })).toBeNull()
    expect(fromOpencodeMcpConfig("b", { type: "remote", url: "" })).toBeNull()
  })
})

describe("JSON editing round-trip", () => {
  it("serializes and parses a stdio server", () => {
    const entry: McpServerEntry = {
      id: "mcp-1",
      name: "filesystem",
      type: "stdio",
      command: "npx",
      args: "-y server-fs /tmp",
      enabled: true,
    }
    const json = mcpEntryToJson(entry)
    expect(JSON.parse(json)).toEqual({ type: "local", command: ["npx", "-y", "server-fs", "/tmp"] })
    const parsed = mcpEntryFromJson("filesystem", json)
    expect(parsed).toMatchObject({ name: "filesystem", type: "stdio", command: "npx", args: "-y server-fs /tmp" })
  })

  it("parses handwritten opencode JSON", () => {
    const parsed = mcpEntryFromJson(
      "memory",
      JSON.stringify({
        type: "remote",
        url: "https://mcp.example.com/mcp",
        headers: { Authorization: "Bearer x" },
      }),
    )
    expect(parsed).toMatchObject({ name: "memory", type: "http", url: "https://mcp.example.com/mcp" })
    expect(parsed?.headers).toEqual({ Authorization: "Bearer x" })
  })

  it("rejects invalid JSON and missing fields", () => {
    expect(mcpEntryFromJson("a", "not json")).toBeNull()
    expect(mcpEntryFromJson("a", '{"type":"local"}')).toBeNull()
    expect(mcpEntryFromJson("a", '{"type":"remote"}')).toBeNull()
    expect(mcpEntryFromJson("a", '{"type":"unknown"}')).toBeNull()
  })

  it("parses Cursor/Claude streamablehttp configs inside mcpServers", () => {
    const parsed = mcpEntryFromJson(
      "ignored",
      JSON.stringify({
        mcpServers: {
          "mcd-mcp": {
            type: "streamablehttp",
            url: "https://mcp.mcd.cn",
            headers: { Authorization: "Bearer YOUR_MCP_TOKEN" },
          },
        },
      }),
    )
    expect(parsed).toMatchObject({
      name: "mcd-mcp",
      type: "http",
      url: "https://mcp.mcd.cn",
      enabled: true,
    })
    expect(parsed?.headers).toEqual({ Authorization: "Bearer YOUR_MCP_TOKEN" })
  })

  it("parses Cursor http/sse types without a wrapper", () => {
    expect(mcpEntryFromJson("a", '{"type":"http","url":"https://x/mcp"}')).toMatchObject({
      type: "http",
      url: "https://x/mcp",
    })
    expect(mcpEntryFromJson("b", '{"type":"sse","url":"https://x/mcp/sse"}')).toMatchObject({
      type: "sse",
      url: "https://x/mcp/sse",
    })
  })

  it("parses Cursor stdio with command string, args array and env", () => {
    const parsed = mcpEntryFromJson(
      "filesystem",
      JSON.stringify({
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: { NODE_ENV: "production" },
      }),
    )
    expect(parsed).toMatchObject({
      name: "filesystem",
      type: "stdio",
      command: "npx",
      args: "-y @modelcontextprotocol/server-filesystem /tmp",
      environment: { NODE_ENV: "production" },
    })
  })

  it("parses command arrays (opencode local style)", () => {
    const parsed = mcpEntryFromJson(
      "x",
      JSON.stringify({ type: "local", command: ["npx", "-y", "server"], environment: { A: "1" } }),
    )
    expect(parsed).toMatchObject({ type: "stdio", command: "npx", args: "-y server", environment: { A: "1" } })
  })

  it("rejects empty mcpServers wrappers", () => {
    expect(mcpEntryFromJson("a", '{"mcpServers":{}}')).toBeNull()
  })
})

describe("key-value line helpers", () => {
  it("parses KEY=VALUE lines and ignores blanks/malformed lines", () => {
    expect(parseKeyValueLines("A=1\n\nB=two\n=bad\nC=3\n")).toEqual({ A: "1", B: "two", C: "3" })
  })

  it("stringifies records", () => {
    expect(stringifyKeyValueLines({ A: "1", B: "two" })).toBe("A=1\nB=two")
    expect(stringifyKeyValueLines(undefined)).toBe("")
  })
})
