import { afterEach, describe, expect, test, vi } from "vitest"
import {
  existingSessionComposerDraftKey,
  artifactsPanelMaxWidth,
  chatSendAccepted,
  initialRoute,
  NO_DRAFT_PROJECT_ID,
  newSessionComposerDraftKey,
  newSessionComposerDraftKeyForScopeKey,
  resolveNewSessionTarget,
  projectContextControlsDisabled,
  sessionRecordScopeKey,
  sessionTitleGenerationKey,
} from "./app-shell-model.ts"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("artifacts panel max width", () => {
  test("caps panel at absolute max on wide windows so chat keeps its floor", () => {
    // 1920 - 264 sidebar - 480 chat = 1176 可用，但绝对上限 1000 生效 → 对话区保底 656。
    expect(artifactsPanelMaxWidth(1920, 264, false)).toBe(1000)
  })

  test("keeps chat floor when remaining space is below absolute max", () => {
    // 1080 - 264 - 480 = 336 < 1000，上限收缩为剩余空间，对话区稳定保底 480。
    expect(artifactsPanelMaxWidth(1080, 264, false)).toBe(336)
  })

  test("ignores sidebar track when collapsed", () => {
    expect(artifactsPanelMaxWidth(1080, 264, true)).toBe(600)
  })

  test("never drops below panel min width on narrow windows", () => {
    expect(artifactsPanelMaxWidth(720, 264, false)).toBe(260)
  })
})

describe("route resolution", () => {
  test("accepts a settings sub-route for deep links", () => {
    vi.stubEnv("VITE_DWEIS_ROUTE", "settings/appearance")
    expect(initialRoute()).toBe("settings/appearance")
  })

  test("falls back to chat for unknown routes", () => {
    vi.stubEnv("VITE_DWEIS_ROUTE", "does-not-exist")
    expect(initialRoute()).toBe("chat")
  })
})

describe("local workspace", () => {
  test("keeps project controls available without a running session", () => {
    expect(projectContextControlsDisabled(null, false)).toBe(false)
    expect(projectContextControlsDisabled("session-id", false)).toBe(false)
    expect(projectContextControlsDisabled("session-id", true)).toBe(true)
  })
})

describe("chat send result", () => {
  test("only treats accepted send results as accepted", () => {
    expect(chatSendAccepted({ delivery: "sent", status: "accepted" })).toBe(true)
    expect(chatSendAccepted({ delivery: "queued", status: "accepted" })).toBe(true)
    expect(chatSendAccepted({ reason: "workspace_not_ready", status: "rejected" })).toBe(false)
    expect(chatSendAccepted({ error: new Error("failed"), status: "failed" })).toBe(false)
  })
})

describe("new session target resolution", () => {
  test("opens a root task draft without project context", () => {
    expect(resolveNewSessionTarget({ draftProjectId: null })).toEqual({})
  })

  test("keeps a new chat inside the active project session", () => {
    expect(
      resolveNewSessionTarget({
        activeSession: { projectId: "project-a" },
        draftProjectId: null,
      }),
    ).toEqual({ projectId: "project-a" })
  })

  test("keeps a new chat inside the active project draft", () => {
    expect(resolveNewSessionTarget({ draftProjectId: "project-b" })).toEqual({
      projectId: "project-b",
    })
  })

  test("treats the explicit no-project draft marker as a root task", () => {
    expect(resolveNewSessionTarget({ draftProjectId: NO_DRAFT_PROJECT_ID })).toEqual({})
  })

  test("lets an explicit project row target override the active task context", () => {
    expect(
      resolveNewSessionTarget({
        activeSession: {},
        draftProjectId: NO_DRAFT_PROJECT_ID,
        explicitProjectId: "project-c",
      }),
    ).toEqual({
      projectId: "project-c",
    })
  })

  test("can fall back to the last chat project from non-chat routes", () => {
    expect(
      resolveNewSessionTarget({ draftProjectId: null, lastProjectId: "project-d", preferLastProject: true }),
    ).toEqual({
      projectId: "project-d",
    })
  })

  test("ignores last project context unless requested", () => {
    expect(resolveNewSessionTarget({ draftProjectId: null, lastProjectId: "project-d" })).toEqual({})
  })
})

describe("composer draft keys", () => {
  test("keeps loading workspace draft keys separated", () => {
    expect(newSessionComposerDraftKey(null, undefined)).toBe("__new_session__:workspace-loading:none")
    expect(newSessionComposerDraftKeyForScopeKey("local:local", undefined)).toBe("__new_session__:local:local:none")
    expect(newSessionComposerDraftKeyForScopeKey("local:local", "project-1")).toBe(
      "__new_session__:local:local:project-1",
    )
  })

  test("separates drafts for projects in the same workspace", () => {
    const scope = { kind: "local" as const, workspaceId: "local", workspaceName: "Local" }

    expect(newSessionComposerDraftKey(scope, "project-a")).not.toBe(newSessionComposerDraftKey(scope, "project-b"))
  })
})

describe("composer draft scope keys", () => {
  test("separates existing session drafts by workspace scope", () => {
    expect(existingSessionComposerDraftKey("local:local", "session-1")).not.toBe(
      existingSessionComposerDraftKey("local:local", "session-2"),
    )
  })

  test("keeps local workspace draft keys stable", () => {
    expect(
      newSessionComposerDraftKey({ kind: "local", workspaceId: "shared", workspaceName: "Local" }, undefined),
    ).toBe("__new_session__:local:shared:none")
  })

  test("normalizes persisted sessions without scope as unavailable workspace sessions", () => {
    expect(sessionRecordScopeKey(undefined)).toBe("workspace-loading")
    expect(sessionRecordScopeKey({ kind: "local", workspaceId: "local", workspaceName: "Local" })).toBe("local:local")
  })
})

describe("session title generation keys", () => {
  test("separates requests that use different chat models", () => {
    const input = { text: "分析注册来源" }
    expect(sessionTitleGenerationKey({ ...input, model: { kind: "custom", id: "custom-1" } }, true)).not.toBe(
      sessionTitleGenerationKey({ ...input, model: { kind: "custom", id: "custom-2" } }, true),
    )
  })
})
