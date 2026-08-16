// @vitest-environment happy-dom

import type { ChatMessagePart } from "../../../electron/chat/common.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { ReasoningBlock } from "./ReasoningBlock.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

function part(text: string): ChatMessagePart {
  return { kind: "reasoning", partId: "p1", text }
}

function render(p: ChatMessagePart, live = false): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
      React.createElement(ReasoningBlock, { part: p, live }),
    ),
  )
}

describe("ReasoningBlock", () => {
  it("shows the deep-thinking shimmer placeholder while reasoning is empty", () => {
    const html = render(part(""))
    expect(html).toContain("深度思考")
    // 空文本时摘要位是扫光占位（不再是禁用按钮），可点击展开。
    expect(html).not.toContain("disabled")
    expect(html).not.toContain("思考过程")
  })

  it("shows the first reasoning line as the collapsed summary once settled", () => {
    // dsh 口径：完成后折叠摘要 = 推理第一行（非 live 默认渲染）。
    const html = render(part("先分析约束，再设计接口"))
    expect(html).toContain("深度思考")
    expect(html).toContain("先分析约束，再设计接口")
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("思考过程")
  })

  it("follows the latest reasoning line while streaming", () => {
    // dsh 口径：运行中（live）摘要 = 最新一行。
    const html = render(part("第一行\n第二行进行中"), true)
    expect(html).toContain("第二行进行中")
    expect(html).toContain('aria-expanded="false"')
  })

  it("expands during thinking to reveal the live reasoning area", () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        React.createElement(
          I18nContext.Provider,
          { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
          React.createElement(ReasoningBlock, { part: part(""), live: true }),
        ),
      )
    })
    const button = host.querySelector("button")
    expect(button?.getAttribute("aria-expanded")).toBe("false")
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(button?.getAttribute("aria-expanded")).toBe("true")
    expect(host.textContent).toContain("深度思考")
    act(() => root.unmount())
  })

  it("reveals the full reasoning text after clicking the toggle", () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        React.createElement(
          I18nContext.Provider,
          { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
          React.createElement(ReasoningBlock, { part: part("多行\n推理内容") }),
        ),
      )
    })
    const button = host.querySelector("button")
    expect(button?.getAttribute("aria-expanded")).toBe("false")
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(button?.getAttribute("aria-expanded")).toBe("true")
    // 展开区显示完整推理（多行都在）。
    expect(host.textContent).toContain("推理内容")
    act(() => root.unmount())
  })
})

afterEach(() => {
  document.body.replaceChildren()
})
