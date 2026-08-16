import type { TranslateFn } from "@/i18n/i18n"

import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ComposerModeControls } from "./ComposerModeControls.tsx"
import { I18nContext, translate } from "@/i18n/i18n"

const t: TranslateFn = (key, vars) => translate("en", key, vars)

function renderControls(): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: { locale: "en", setLocale: () => undefined, t } },
      React.createElement(ComposerModeControls, {
        agentMode: "build",
        composerDisabled: false,
        contextUsage: null,
        modelCatalog: null,
        permissionMode: "default",
        reasoningLevel: "default",
        onAddModel: () => undefined,
        onDeleteModel: () => undefined,
        onRequestFullAccessPermissionMode: () => undefined,
        onSelectAgentMode: () => undefined,
        onSelectDefaultPermissionMode: () => undefined,
        onSelectModel: () => undefined,
        onSelectReasoningLevel: () => undefined,
      }),
    ),
  )
}

describe("ComposerModeControls", () => {
  it("renders mode controls without any voice input button", () => {
    const html = renderControls()

    expect(html.toLowerCase()).not.toContain("voice")
    expect(html).not.toContain("lucide-mic")
  })
})
