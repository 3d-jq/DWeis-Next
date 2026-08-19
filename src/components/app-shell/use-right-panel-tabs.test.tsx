// @vitest-environment happy-dom

import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"

import { act } from "react"
import * as React from "react"
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useRightPanelTabs } from "./use-right-panel-tabs.ts"

function artifactSelection(messageId: string): ArtifactSelection {
  return { messageId, group: {} as never }
}

function turnOutputSelection(messageId: string): TurnOutputSelection {
  return {
    record: {
      sessionId: "session-1",
      messageId,
      createdAt: 0,
      files: [],
      summary: { processFileCount: 0, changedFileCount: 0, additions: 0, deletions: 0 },
    },
  }
}

function renderHook(initialSessionId: string | null): {
  result: () => ReturnType<typeof useRightPanelTabs>
  unmount: () => void
} {
  const container = document.createElement("div")
  let api: ReturnType<typeof useRightPanelTabs> | undefined
  const root = createRoot(container)
  function Probe(): React.ReactNode {
    api = useRightPanelTabs({ activeSessionId: initialSessionId })
    return null
  }
  act(() => {
    root.render(createElement(Probe))
  })
  return {
    result: () => {
      if (!api) {
        throw new Error("hook has not rendered")
      }
      return api
    },
    unmount: () => {
      act(() => {
        root.unmount()
      })
    },
  }
}

describe("useRightPanelTabs", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("manual openArtifact creates and activates the tab (activation must not be lost)", () => {
    const { result: hook, unmount } = renderHook("session-1")
    act(() => {
      hook().openBrowser("session-1")
    })
    act(() => {
      hook().openArtifact(artifactSelection("msg-1"), "manual")
    })
    expect(hook().tabs.map((tab) => tab.id)).toEqual(["browser:session-1", "artifact:msg-1"])
    expect(hook().activeTabId).toBe("artifact:msg-1")
    expect(hook().activeTab?.kind).toBe("artifact")
    unmount()
  })

  it("manual openArtifact with null selection opens an empty artifact tab and activates it", () => {
    const { result: hook, unmount } = renderHook("session-1")
    act(() => {
      hook().openArtifact(null, "manual")
    })
    expect(hook().activeTabId).toBe("artifact:empty")
    expect(hook().activeTab?.kind).toBe("artifact")
    unmount()
  })

  it("auto openArtifact records the selection but does not open a new tab", () => {
    const { result: hook, unmount } = renderHook("session-1")
    act(() => {
      hook().openArtifact(artifactSelection("msg-1"), "auto")
    })
    expect(hook().tabs).toHaveLength(0)
    expect(hook().latestArtifactSelection?.messageId).toBe("msg-1")
    unmount()
  })

  it("auto then manual open with the same id updates the existing tab and activates it", () => {
    const { result: hook, unmount } = renderHook("session-1")
    act(() => {
      hook().openArtifact(artifactSelection("msg-1"), "manual")
    })
    act(() => {
      hook().openBrowser("session-1")
    })
    expect(hook().activeTabId).toBe("browser:session-1")
    act(() => {
      hook().openArtifact(artifactSelection("msg-1"), "auto")
    })
    expect(hook().tabs).toHaveLength(2)
    expect(hook().activeTabId).toBe("browser:session-1")
    act(() => {
      hook().openArtifact(artifactSelection("msg-1"), "manual")
    })
    expect(hook().activeTabId).toBe("artifact:msg-1")
    expect(hook().tabs).toHaveLength(2)
    unmount()
  })

  it("auto openTurnOutput records the selection for the add-tab menu", () => {
    const { result: hook, unmount } = renderHook("session-1")
    act(() => {
      hook().openTurnOutput(turnOutputSelection("msg-2"), "auto")
    })
    expect(hook().tabs).toHaveLength(0)
    expect(hook().latestTurnOutputSelection?.record.messageId).toBe("msg-2")
    unmount()
  })

  it("closeTabById removes the tab and activates the neighbor", () => {
    const { result: hook, unmount } = renderHook("session-1")
    act(() => {
      hook().openBrowser("session-1")
      hook().openArtifact(artifactSelection("msg-1"), "manual")
    })
    expect(hook().activeTabId).toBe("artifact:msg-1")
    act(() => {
      hook().closeTabById("artifact:msg-1")
    })
    expect(hook().tabs.map((tab) => tab.id)).toEqual(["browser:session-1"])
    expect(hook().activeTabId).toBe("browser:session-1")
    unmount()
  })
})
