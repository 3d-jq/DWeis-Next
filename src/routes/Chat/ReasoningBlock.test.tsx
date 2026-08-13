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

function render(p: ChatMessagePart): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: { locale: "zh-CN", setLocale: () => undefined, t: (key, vars) => translate("zh-CN", key, vars) } },
      React.createElement(ReasoningBlock, { part: p }),
    ),
  )
}

describe("ReasoningBlock", () => {
  it("shows the deep-thinking placeholder and stays expandable while reasoning is empty", () => {
    const html = render(part("   "))
    expect(html).toContain("深度思考")
    // 思考中不再禁用按钮：可点击展开实时查看推理内容。
    expect(html).not.toContain("disabled")
    expect(html).not.toContain("思考过程")
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
          React.createElement(ReasoningBlock, { part: part("") }),
        ),
      )
    })
    const button = host.querySelector("button")
    expect(button?.getAttribute("aria-expanded")).toBe("false")
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(button?.getAttribute("aria-expanded")).toBe("true")
    // 展开后即使还没有文本，也出现深度思考占位（内容到了即填充）。
    expect(host.textContent).toContain("深度思考")
    act(() => root.unmount())
  })

  it("keeps the deep-thinking label and content collapsed by default", () => {
    const html = render(part("先分析约束，再设计接口"))
    expect(html).toContain("深度思考")
    expect(html).not.toContain("思考过程")
    expect(html).toContain('aria-expanded="false"')
    // 默认收起：推理内容不应出现。
    expect(html).not.toContain("先分析约束，再设计接口")
  })

  it("reveals the reasoning text after clicking the toggle", () => {
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
    expect(host.textContent).not.toContain("推理内容")
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(button?.getAttribute("aria-expanded")).toBe("true")
    expect(host.textContent).toContain("推理内容")
    act(() => root.unmount())
  })
})

afterEach(() => {
  document.body.replaceChildren()
})
