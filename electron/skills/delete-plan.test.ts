import type { ManagedSkillGroup } from "./common.ts"

import assert from "node:assert/strict"
import path from "node:path"
import { test } from "vitest"
import { buildLocalMachineSkillDeletePlan } from "./delete-plan.ts"

test.skipIf(process.platform === "win32")("buildLocalMachineSkillDeletePlan includes agent hosts and registry sources", () => {
  const group: ManagedSkillGroup = {
    externalHosts: [],
    hosts: [
      {
        agentId: "dweis",
        agentName: "DWeis",
        kind: "registry",
        packageName: "@oomol/example",
        path: "/home/me/.agents/skills/example",
        scope: "runtime",
        sourcePath: "/home/me/.config/dweis/agent/oo-store/config/skills/registry/example",
        status: "installed",
        version: "1.0.0",
      },
      {
        agentId: "claude-code",
        agentName: "Claude Code",
        kind: "registry",
        packageName: "@oomol/example",
        path: "/home/me/.claude/skills/example",
        scope: "external",
        sourcePath: "/home/me/.config/oo/skills/registry/example",
        status: "installed",
        version: "1.0.0",
      },
    ],
    id: "example",
    kind: "registry",
    name: "example",
    packageName: "@oomol/example",
    runtimeHosts: [],
    version: "1.0.0",
  }

  const plan = buildLocalMachineSkillDeletePlan({
    agentSkillRoots: ["/home/me/.agents/skills", "/home/me/.claude/skills"],
    globalRegistrySkillRoot: "/home/me/.config/oo/skills/registry",
    group,
    dweisRegistrySkillRoot: "/home/me/.config/dweis/agent/oo-store/config/skills/registry",
  })

  assert.deepEqual(plan.storeTargets, [
    {
      kind: "dweis",
      packageName: "@oomol/example",
      skillId: "example",
    },
    {
      kind: "global",
      packageName: "@oomol/example",
      skillId: "example",
    },
  ])
  assert.deepEqual(
    plan.targets.map((target) => `${target.kind}:${path.normalize(target.path)}`).sort(),
    [
      "agent-host:/home/me/.agents/skills/example",
      "agent-host:/home/me/.claude/skills/example",
      "global-registry-source:/home/me/.config/oo/skills/registry/example",
      "dweis-registry-source:/home/me/.config/dweis/agent/oo-store/config/skills/registry/example",
    ].sort(),
  )
})

test.skipIf(process.platform === "win32")("buildLocalMachineSkillDeletePlan skips registry store work for local skills", () => {
  const group: ManagedSkillGroup = {
    externalHosts: [],
    hosts: [
      {
        agentId: "codex",
        agentName: "Codex",
        kind: "local",
        path: "/home/me/.codex/skills/local-skill",
        scope: "external",
        status: "installed",
      },
    ],
    id: "local-skill",
    kind: "local",
    name: "local-skill",
    runtimeHosts: [],
  }

  const plan = buildLocalMachineSkillDeletePlan({
    agentSkillRoots: ["/home/me/.codex/skills"],
    globalRegistrySkillRoot: "/home/me/.config/oo/skills/registry",
    group,
    dweisRegistrySkillRoot: "/home/me/.config/dweis/agent/oo-store/config/skills/registry",
  })

  assert.deepEqual(plan.storeTargets, [])
  assert.deepEqual(plan.targets, [
    {
      kind: "agent-host",
      path: "/home/me/.codex/skills/local-skill",
    },
  ])
})
