import { afterEach, describe, expect, it } from "vitest"
import { BROWSER_AGENT_TOOL_FILES, MEMORY_TOOL_FILES, USER_TOOL_FILES, agentToolFiles } from "./tool-sources.ts"

describe("runtime tool assembly", () => {
  it("assembles the local tool set without Link/connector tools", () => {
    expect(Object.keys(agentToolFiles())).toEqual([
      ...Object.keys(MEMORY_TOOL_FILES),
      ...Object.keys(BROWSER_AGENT_TOOL_FILES),
      ...Object.keys(USER_TOOL_FILES),
    ])
    const files = agentToolFiles()
    for (const connectorTool of ["search_actions.ts", "list_apps.ts", "inspect_action.ts", "call_action.ts"]) {
      expect((files as Record<string, unknown>)[connectorTool]).toBeUndefined()
    }
  })

  it("always ships user-configurable tools for hot-add (enablement read from config file at call time)", () => {
    const enabled = agentToolFiles()
    expect(enabled["generate_image.ts"]).toContain("DWEIS_TOOLS_CONFIG_PATH")
    // 文件名 = 工具 id：dweis_websearch 前缀避免与 opencode 内置 websearch 撞名被过滤。
    expect(enabled["dweis_websearch.ts"]).toContain("DWEIS_TOOLS_CONFIG_PATH")
    expect(enabled["memory.ts"]).toBeDefined()
  })
})

describe("browser embedded runtime", () => {
  it("uses the runtime chat session instead of tool arguments for browser isolation", async () => {
    process.env.DWEIS_BROWSER_CONTROL_TOKEN = "secret"
    process.env.DWEIS_BROWSER_CONTROL_URL = "http://127.0.0.1:4321"
    const requests: Array<{ body: string; headers: Record<string, string>; url: string }> = []
    const fetchValue = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        body: String(init?.body),
        headers: init?.headers as Record<string, string>,
        url: String(input),
      })
      return {
        json: async () => ({ result: { sessionId: "trusted-session" } }),
        ok: true,
      } as Response
    }) as typeof fetch
    const runtime = loadBrowserNavigateTool(fetchValue)

    const output = await runtime.execute(
      { sessionId: "untrusted-session", url: "https://example.test" },
      { sessionID: "trusted-session" },
    )

    expect(JSON.parse(output)).toEqual({ sessionId: "trusted-session" })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe("http://127.0.0.1:4321/v1/browser")
    expect(requests[0]?.headers.authorization).toBe("Bearer secret")
    expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
      action: "navigate",
      sessionId: "trusted-session",
    })
  })
})

interface LoadedBrowserNavigateTool {
  execute: (
    args: { sessionId?: string; url: string },
    context: { abort?: AbortSignal; sessionID: string },
  ) => Promise<string>
}

function loadBrowserNavigateTool(fetchValue: typeof fetch): LoadedBrowserNavigateTool {
  const raw = BROWSER_AGENT_TOOL_FILES["browser_navigate.ts"] ?? ""
  const source = raw
    .replace(/^import .*$/gm, "")
    .replace("export default tool(", "const exportedTool = tool(")
    .concat("\nreturn exportedTool")
  const schema = {
    describe() {
      return this
    },
  }
  const tool = Object.assign((value: unknown) => value, { schema: { string: () => schema } })
  const factory = new Function("tool", "fetch", source) as (
    toolValue: typeof tool,
    fetchInput: typeof fetch,
  ) => LoadedBrowserNavigateTool
  return factory(tool, fetchValue)
}

afterEach(() => {
  delete process.env.DWEIS_BROWSER_CONTROL_TOKEN
  delete process.env.DWEIS_BROWSER_CONTROL_URL
})
