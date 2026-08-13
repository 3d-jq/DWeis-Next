import type { ArtifactSelection } from "@/routes/Chat/GeneratedArtifacts"
import type { TurnOutputSelection } from "@/routes/Chat/TurnOutputs"

import assert from "node:assert/strict"
import { test } from "vitest"
import {
  activeTabIdAfterClose,
  artifactTabId,
  browserTabId,
  closeTab,
  turnOutputTabId,
  upsertTab,
} from "./right-panel-tabs.ts"
import type { RightPanelTab } from "./right-panel-tabs.ts"

function artifactSelection(messageId: string): ArtifactSelection {
  return { messageId, group: {} as never }
}

function turnOutputSelection(sessionId: string, messageId: string): TurnOutputSelection {
  return {
    record: {
      sessionId,
      messageId,
      createdAt: 0,
      files: [],
      summary: { processFileCount: 0, changedFileCount: 0, additions: 0, deletions: 0 },
    },
  }
}

function artifactTab(messageId: string): RightPanelTab {
  return { id: artifactTabId(artifactSelection(messageId)), kind: "artifact", selection: artifactSelection(messageId), source: "manual", title: "Artifacts" }
}

test("tab ids are deterministic per content", () => {
  assert.equal(browserTabId("session-1"), "browser:session-1")
  assert.equal(artifactTabId(artifactSelection("msg-1")), "artifact:msg-1")
  assert.equal(turnOutputTabId(turnOutputSelection("s", "m")), "turn-output:s:m")
})

test("upsertTab appends new tabs and replaces same-id tabs in place", () => {
  const first = artifactTab("msg-1")
  const second = artifactTab("msg-2")
  const updated: RightPanelTab = {
    id: first.id,
    kind: "artifact",
    selection: artifactSelection("msg-1"),
    source: "auto",
    title: "Artifacts",
  }

  assert.deepEqual(upsertTab([], first), [first])
  assert.deepEqual(upsertTab([first], second), [first, second])
  const replaced = upsertTab([first, second], updated)
  assert.equal(replaced.length, 2)
  assert.equal(replaced[0]?.kind, "artifact")
  if (replaced[0]?.kind === "artifact") {
    assert.equal(replaced[0].source, "auto")
  }
})

test("closeTab removes the matching tab", () => {
  const tabs = [artifactTab("msg-1"), artifactTab("msg-2")]
  assert.deepEqual(closeTab(tabs, "artifact:msg-1"), [tabs[1]])
})

test("activeTabIdAfterClose activates the previous tab when closing the active one", () => {
  const tabs = [artifactTab("msg-1"), artifactTab("msg-2"), artifactTab("msg-3")]
  assert.equal(activeTabIdAfterClose(tabs, "artifact:msg-2", "artifact:msg-2"), "artifact:msg-1")
  assert.equal(activeTabIdAfterClose(tabs, "artifact:msg-3", "artifact:msg-3"), "artifact:msg-2")
  assert.equal(activeTabIdAfterClose(tabs, "artifact:msg-1", "artifact:msg-1"), "artifact:msg-2")
  assert.equal(activeTabIdAfterClose(tabs, "artifact:msg-2", "artifact:msg-1"), "artifact:msg-1")
  assert.equal(activeTabIdAfterClose(tabs, "artifact:msg-1", null), null)
  assert.equal(activeTabIdAfterClose([], "missing", null), null)
})
