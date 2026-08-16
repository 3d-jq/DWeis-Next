import type { TranslateFn } from "@/i18n/i18n"
import type { ComponentProps } from "react"

import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ComposerTrailingControls } from "./ComposerTrailingControls.tsx"
import { ThemeContext } from "@/components/theme-context"
import { I18nContext, translate } from "@/i18n/i18n"

const t: TranslateFn = (key, vars) => translate("en", key, vars)
const baseProps: ComponentProps<typeof ComposerTrailingControls> = {
  agentMode: "build",
  canSubmit: false,
  composerDisabled: false,
  contextUsage: null,
  modelCatalog: null,
  permissionMode: "default",
  reasoningLevel: "default",
  turnState: { chatStatus: "ready", status: "idle" },
  willQueueMessage: false,
  onAddModel: () => undefined,
  onDeleteModel: () => undefined,
  onRequestFullAccessPermissionMode: () => undefined,
  onSelectAgentMode: () => undefined,
  onSelectDefaultPermissionMode: () => undefined,
  onSelectModel: () => undefined,
  onSelectReasoningLevel: () => undefined,
  onStop: () => undefined,
}

function renderControls(overrides: Partial<ComponentProps<typeof ComposerTrailingControls>>): string {
  return renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      {
        value: {
          effectiveTheme: "light",
          palette: "default",
          preference: "light",
          setPalette: () => undefined,
          setPreference: () => undefined,
        },
      },
      React.createElement(
        I18nContext.Provider,
        { value: { locale: "en", setLocale: () => undefined, t } },
        React.createElement(ComposerTrailingControls, { ...baseProps, ...overrides }),
      ),
    ),
  )
}

describe("ComposerTrailingControls", () => {
  it("renders the send control without any voice UI", () => {
    const html = renderControls({})

    expect(html).toContain(`aria-label="${t("aria.send")}"`)
    expect(html.toLowerCase()).not.toContain("voice")
  })
})
