import { afterEach, describe, expect, test, vi } from "vitest"
import {
  existingSessionComposerDraftKey,
  chatSendAccepted,
  initialRoute,
  NO_DRAFT_PROJECT_ID,
  isWorkspaceSwitchPending,
  newSessionComposerDraftKey,
  newSessionComposerDraftKeyForScopeKey,
  resolveNewSessionTarget,
  routeAvailableForRuntime,
  projectContextControlsDisabled,
  resolveWorkspaceActivationState,
  sessionRecordScopeKey,
  sessionScopeFromWorkspace,
  sessionTitleGenerationKey,
  shouldClearWorkspaceSwitchTarget,
  workspaceActivationBlocksInput,
  workspaceActivationHasFailed,
  workspaceActivationIsPending,
  workspaceSelectionSwitchKey,
  workspaceSwitchTeamId,
} from "./app-shell-model.ts"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("route and scope migration", () => {
  test("accepts a settings sub-route for deep links", () => {
    vi.stubEnv("VITE_DWEIS_ROUTE", "settings/appearance")
    expect(initialRoute()).toBe("settings/appearance")
  })

  test("falls back to chat for unknown routes", () => {
    vi.stubEnv("VITE_DWEIS_ROUTE", "does-not-exist")
    expect(initialRoute()).toBe("chat")
  })

  test("accepts team and legacy organization scope keys", () => {
    expect(workspaceSwitchTeamId("team:team-1")).toBe("team-1")
    expect(workspaceSwitchTeamId("organization:team-1")).toBe("team-1")
    expect(workspaceSwitchTeamId("personal:user-1")).toBeNull()
  })
})

describe("local workspace", () => {
  const localWorkspace = { canManage: false, kind: "local" as const, role: null, team: null, teamId: "" }

  test("maps the local workspace to the stable local session scope", () => {
    expect(sessionScopeFromWorkspace(localWorkspace)).toEqual({
      kind: "local",
      workspaceId: "local",
      workspaceName: "Local",
    })
    expect(workspaceSelectionSwitchKey(localWorkspace)).toBe("local:local")
  })

  test("settles activation after local sessions load without cloud dependencies", () => {
    expect(
      resolveWorkspaceActivationState({
        ...readyInput,
        cloudWorkspaceRequired: false,
        currentScopeKey: "local:local",
        loadedSessionScopeKey: "local:local",
        targetScopeKey: "local:local",
        workspaceMetadataError: activationError,
      }),
    ).toEqual({ status: "idle", targetScopeKey: "local:local" })
  })

  test("keeps community routes available while blocking account-only pages", () => {
    expect(routeAvailableForRuntime("chat", false)).toBe(true)
    expect(routeAvailableForRuntime("knowledge", false)).toBe(true)
    expect(routeAvailableForRuntime("settings", false)).toBe(true)
    expect(routeAvailableForRuntime("settings/appearance", false)).toBe(true)
    expect(routeAvailableForRuntime("skills", false)).toBe(true)
    expect(routeAvailableForRuntime("billing", false)).toBe(false)
    expect(routeAvailableForRuntime("billing", true)).toBe(true)
  })

  test("keeps project controls available without a running session", () => {
    expect(projectContextControlsDisabled(null, false)).toBe(false)
    expect(projectContextControlsDisabled("session-id", false)).toBe(false)
    expect(projectContextControlsDisabled("session-id", true)).toBe(true)
  })
})

const readyInput = {
  cloudWorkspaceRequired: true,
  currentScopeKey: "team:acme",
  loadedSessionScopeKey: "team:acme",
  targetScopeKey: "team:acme",
  workspaceMetadataError: null,
}

const activationError = {
  area: "chat",
  descriptionKey: "error.chat.description",
  kind: "operation_failed",
  severity: "destructive",
  titleKey: "error.chat.title",
} as const

describe("workspace switch pending state", () => {
  test("is inactive when no switch target is pending", () => {
    expect(isWorkspaceSwitchPending({ ...readyInput, targetScopeKey: null })).toBe(false)
  })

  test("waits until the active session scope reaches the target", () => {
    expect(isWorkspaceSwitchPending({ ...readyInput, currentScopeKey: "workspace-loading" })).toBe(true)
  })

  test("waits for sessions to load for the target scope", () => {
    expect(isWorkspaceSwitchPending({ ...readyInput, loadedSessionScopeKey: "team:old" })).toBe(true)
  })

  test("settles when all target-scoped requests are done", () => {
    expect(isWorkspaceSwitchPending(readyInput)).toBe(false)
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

describe("workspace activation state", () => {
  test("is idle without a switch target", () => {
    const state = resolveWorkspaceActivationState({ ...readyInput, targetScopeKey: null })

    expect(state).toEqual({ status: "idle", targetScopeKey: null })
    expect(workspaceActivationIsPending(state)).toBe(false)
    expect(workspaceActivationBlocksInput(state)).toBe(false)
    expect(workspaceActivationHasFailed(state)).toBe(false)
  })

  test("reports the first pending activation phase", () => {
    const state = resolveWorkspaceActivationState({ ...readyInput, loadedSessionScopeKey: "team:old" })

    expect(state).toEqual({ phase: "sessions", status: "activating", targetScopeKey: "team:acme" })
    expect(workspaceActivationIsPending(state)).toBe(true)
    expect(workspaceActivationBlocksInput(state)).toBe(true)
    expect(workspaceActivationHasFailed(state)).toBe(false)
  })

  test("fails when the selected workspace metadata cannot resolve an identity", () => {
    const state = resolveWorkspaceActivationState({
      ...readyInput,
      workspaceMetadataError: activationError,
    })

    expect(state).toEqual({
      error: activationError,
      reason: "workspace_metadata",
      status: "failed",
      targetScopeKey: "team:acme",
    })
    expect(workspaceActivationIsPending(state)).toBe(false)
    expect(workspaceActivationBlocksInput(state)).toBe(true)
  })

  test("is idle once every target-scoped dependency settles", () => {
    const state = resolveWorkspaceActivationState(readyInput)

    expect(state).toEqual({ status: "idle", targetScopeKey: "team:acme" })
  })
})

describe("workspace switch target cleanup", () => {
  const cleanupInput = {
    activeWorkspaceKey: "team:new",
    hasLoadedTeams: true,
    loadingTeams: false,
    teamIds: ["new"],
    targetScopeKey: "team:new",
    workspaceSwitching: true,
  }

  test("keeps a reachable target while requests are still pending", () => {
    expect(shouldClearWorkspaceSwitchTarget(cleanupInput)).toBe(false)
  })

  test("clears when the target settles", () => {
    expect(shouldClearWorkspaceSwitchTarget({ ...cleanupInput, workspaceSwitching: false })).toBe(true)
  })

  test("clears when a team target is no longer reachable", () => {
    expect(
      shouldClearWorkspaceSwitchTarget({
        ...cleanupInput,
        activeWorkspaceKey: "team:acme",
        teamIds: [],
      }),
    ).toBe(true)
  })

  test("keeps a reachable target while the active workspace catches up", () => {
    expect(
      shouldClearWorkspaceSwitchTarget({
        ...cleanupInput,
        activeWorkspaceKey: "team:acme",
      }),
    ).toBe(false)
  })

  test("keeps a team target reachable while teams are still loading", () => {
    expect(
      shouldClearWorkspaceSwitchTarget({
        ...cleanupInput,
        activeWorkspaceKey: "team:acme",
        hasLoadedTeams: false,
        loadingTeams: true,
        teamIds: [],
      }),
    ).toBe(false)
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
  test("keeps loading team draft keys separated by selected workspace", () => {
    expect(newSessionComposerDraftKey(null, undefined)).toBe("__new_session__:workspace-loading:none")
    expect(newSessionComposerDraftKeyForScopeKey("team:team-a", undefined)).toBe("__new_session__:team:team-a:none")
    expect(newSessionComposerDraftKeyForScopeKey("team:team-b", "project-1")).toBe(
      "__new_session__:team:team-b:project-1",
    )
  })

  test("separates drafts for projects in the same workspace", () => {
    const scope = { kind: "team" as const, teamId: "team-a", teamName: "A" }

    expect(newSessionComposerDraftKey(scope, "project-a")).not.toBe(newSessionComposerDraftKey(scope, "project-b"))
  })
})

describe("composer draft scope keys", () => {
  test("separates existing session drafts by workspace scope", () => {
    expect(existingSessionComposerDraftKey("team:team-a", "session-1")).not.toBe(
      existingSessionComposerDraftKey("team:team-b", "session-1"),
    )
    expect(existingSessionComposerDraftKey("team:team-a", "session-1")).not.toBe(
      existingSessionComposerDraftKey("team:acme", "session-1"),
    )
  })

  test("separates new session drafts by workspace scope", () => {
    expect(newSessionComposerDraftKey({ kind: "team", teamId: "team-a", teamName: "A" }, undefined)).not.toBe(
      newSessionComposerDraftKey({ kind: "team", teamId: "team-id", teamName: "team-name" }, undefined),
    )
  })

  test("keeps local and team workspace draft keys distinct", () => {
    expect(
      newSessionComposerDraftKey({ kind: "local", workspaceId: "shared", workspaceName: "Local" }, undefined),
    ).toBe("__new_session__:local:shared:none")
    expect(newSessionComposerDraftKey({ kind: "team", teamId: "shared", teamName: "Team" }, undefined)).toBe(
      "__new_session__:team:shared:none",
    )
  })

  test("normalizes persisted sessions without scope as unavailable workspace sessions", () => {
    expect(sessionRecordScopeKey(undefined)).toBe("workspace-loading")
    expect(sessionRecordScopeKey({ kind: "team", teamId: "team-a", teamName: "A" })).toBe("team:team-a")
    expect(sessionRecordScopeKey({ kind: "local", workspaceId: "local", workspaceName: "Local" })).toBe("local:local")
  })
})

describe("session title generation keys", () => {
  test("separates requests that use different chat models", () => {
    const input = { text: "分析注册来源" }
    expect(sessionTitleGenerationKey({ ...input, model: { kind: "builtin", id: "gpt-5.6-sol" } }, true)).not.toBe(
      sessionTitleGenerationKey({ ...input, model: { kind: "custom", id: "custom-1" } }, true),
    )
  })
})
