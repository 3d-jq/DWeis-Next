// @vitest-environment happy-dom

import type { ChatMessagePart } from "../../../../electron/chat/common.ts"

import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ToolCard } from "./index.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

function render(part: ChatMessagePart, running = false): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
      React.createElement(ToolCard, { part, running }),
    ),
  )
}

describe("ToolCard", () => {
  it("renders a terminal card for bash with ANSI colors and command line", () => {
    const html = render({
      kind: "tool",
      partId: "t1",
      callId: "c1",
      tool: "bash",
      status: "completed",
      input: { command: "npm test" },
      output: "\x1b[32mPASS\x1b[0m 1 test",
    })
    expect(html).toContain("npm test")
    expect(html).toContain("PASS")
    expect(html).toContain("text-emerald-600")
  })

  it("renders a read card with line-numbered content", () => {
    const html = render({
      kind: "tool",
      partId: "t1",
      callId: "c1",
      tool: "read",
      status: "completed",
      input: { filePath: "C:/x/src/main.ts" },
      output:
        "<path>C:/x/src/main.ts</path>\n<type>file</type>\n<content>\n1: export const a = 1\n2: export const b = 2\n</content>",
    })
    expect(html).toContain("src/main.ts")
    expect(html).toContain("1")
    expect(html).toContain("export const a = 1")
  })

  it("renders a diff card for edit with add/remove counts", () => {
    const html = render({
      kind: "tool",
      partId: "t1",
      callId: "c1",
      tool: "edit",
      status: "completed",
      input: {},
      output: "--- a/x.ts\n+++ b/x.ts\n@@ -1,3 +1,3 @@\n-old\n+new",
    })
    expect(html).toContain("+1")
    expect(html).toContain("-1")
    expect(html).toContain("old")
  })

  it("renders a search card for grep grouped by file", () => {
    const html = render({
      kind: "tool",
      partId: "t1",
      callId: "c1",
      tool: "grep",
      status: "completed",
      input: {},
      output: "src/a.ts:3:const x = 1\nsrc/a.ts:7:const y = 2",
    })
    expect(html).toContain("a.ts")
    expect(html).toContain("const x = 1")
    expect(html).toContain("2")
  })

  it("renders a web card for dweis_websearch JSON results", () => {
    const html = render({
      kind: "tool",
      partId: "t1",
      callId: "c1",
      tool: "dweis_websearch",
      status: "completed",
      input: { query: "test" },
      output: JSON.stringify({
        ok: true,
        query: "test",
        results: [{ title: "Example", url: "https://example.com", snippet: "snippet text" }],
      }),
    })
    expect(html).toContain("Example")
    expect(html).toContain("https://example.com")
    expect(html).toContain("snippet text")
  })

  it("returns null for unknown tools (generic IO card handles them)", () => {
    const html = render({
      kind: "tool",
      partId: "t1",
      callId: "c1",
      tool: "todo_write",
      status: "completed",
      input: {},
      output: "ok",
    })
    expect(html).toBe("")
  })
})
