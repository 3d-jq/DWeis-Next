import type { ManagedSkillGroup } from "../../../electron/skills/common.ts"

import assert from "node:assert/strict"
import { test } from "vitest"
import {
  getGroupStatus,
  getRuntimeHosts,
  getSelectedManagedSkillGroup,
  isEmojiIcon,
  matchesInstalledSkillFilter,
  skillDocumentPreviewSource,
} from "./skill-route-model.ts"

test("skillDocumentPreviewSource strips frontmatter only when a closing delimiter exists", () => {
  assert.equal(skillDocumentPreviewSource("---\nname: demo\n---\n# Demo\n"), "# Demo\n")
  assert.equal(skillDocumentPreviewSource("---\nname: demo\n# Demo\n"), "---\nname: demo\n# Demo\n")
  assert.equal(skillDocumentPreviewSource("# Demo\n"), "# Demo\n")
  assert.equal(skillDocumentPreviewSource("\uFEFF# Demo\n"), "# Demo\n")
})

test("isEmojiIcon excludes numeric strings", () => {
  assert.equal(isEmojiIcon("123"), false)
  assert.equal(isEmojiIcon(" 123 "), false)
  assert.equal(isEmojiIcon("🎉"), true)
})

test("matchesInstalledSkillFilter can filter by DWeis, Codex, and Claude Code hosts", () => {
  const runtimeGroup = managedSkillGroup("runtime", "@alice/runtime")
  const codexGroup = externalManagedSkillGroup("codex-only", "@alice/codex-only", "codex", "Codex")
  const claudeCodeGroup = externalManagedSkillGroup("claude-only", "@alice/claude-only", "claude-code", "Claude Code")

  assert.equal(matchesInstalledSkillFilter(runtimeGroup, "dweis"), true)
  assert.equal(matchesInstalledSkillFilter(runtimeGroup, "codex"), false)
  assert.equal(matchesInstalledSkillFilter(codexGroup, "codex"), true)
  assert.equal(matchesInstalledSkillFilter(codexGroup, "dweis"), false)
  assert.equal(matchesInstalledSkillFilter(claudeCodeGroup, "claude-code"), true)
})

test("getSelectedManagedSkillGroup does not fall back to the first skill", () => {
  const first = managedSkillGroup("first", "@alice/first")
  const second = managedSkillGroup("second", "@alice/second")
  const groups = [first, second]

  assert.equal(getSelectedManagedSkillGroup(groups, null), undefined)
  assert.equal(getSelectedManagedSkillGroup(groups, "missing"), undefined)
  assert.equal(getSelectedManagedSkillGroup(groups, "second"), second)
})

test("runtime status ignores modified external hosts", () => {
  const group = managedSkillGroup("demo", "@alice/demo")
  const externalHost = {
    agentId: "claude-code",
    agentName: "Claude Code",
    controlState: "modified" as const,
    kind: "registry" as const,
    packageName: "@alice/demo",
    scope: "external" as const,
    status: "installed" as const,
  }
  const mixedGroup: ManagedSkillGroup = {
    ...group,
    externalHosts: [externalHost],
    hosts: [...group.hosts, externalHost],
  }

  assert.equal(getGroupStatus(mixedGroup, t, getRuntimeHosts(mixedGroup)).tone, "ready")
  assert.equal(getGroupStatus(mixedGroup, t).tone, "attention")
})

function managedSkillGroup(
  name: string,
  packageName: string | undefined,
  options: {
    controlState?: "controlled" | "modified" | "source-missing" | "unknown"
    kind?: "local" | "registry" | "unknown"
    version?: string
  } = {},
): ManagedSkillGroup {
  const host = {
    agentId: "dweis",
    agentName: "DWeis",
    ...(options.controlState ? { controlState: options.controlState } : {}),
    kind: options.kind ?? ("registry" as const),
    ...(packageName ? { packageName } : {}),
    scope: "runtime" as const,
    status: "installed" as const,
    ...(options.version ? { version: options.version } : {}),
  }

  return {
    externalHosts: [],
    hosts: [host],
    id: name,
    kind: options.kind ?? "registry",
    name,
    ...(packageName ? { packageName } : {}),
    runtimeHosts: [host],
    ...(options.version ? { version: options.version } : {}),
  }
}

function externalManagedSkillGroup(
  name: string,
  packageName: string | undefined,
  agentId: string,
  agentName: string,
): ManagedSkillGroup {
  const host = {
    agentId,
    agentName,
    kind: "registry" as const,
    ...(packageName ? { packageName } : {}),
    scope: "external" as const,
    status: "installed" as const,
  }

  return {
    externalHosts: [host],
    hosts: [host],
    id: name,
    kind: "registry",
    name,
    ...(packageName ? { packageName } : {}),
    runtimeHosts: [],
  }
}

function t(key: string, vars?: Record<string, string | number>): string {
  return vars ? `${key}:${JSON.stringify(vars)}` : key
}
