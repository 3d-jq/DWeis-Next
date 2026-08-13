import type { SupportedAgent } from "../agents/catalog.ts"
import type { InstalledSkill } from "./types.ts"

import { dweisRuntimeAgent } from "./scan.ts"

export function readSkillCoverageAgents(installedSkills: readonly InstalledSkill[]): SupportedAgent[] {
  const externalAgentsById = new Map<string, SupportedAgent>()

  for (const skill of installedSkills) {
    if (skill.agent.id !== dweisRuntimeAgent.id) {
      externalAgentsById.set(skill.agent.id, skill.agent)
    }
  }

  return [
    dweisRuntimeAgent,
    ...Array.from(externalAgentsById.values()).sort((left, right) => left.name.localeCompare(right.name)),
  ]
}

export function mergeInstalledSkillSnapshots(
  dweisInstalledSkills: InstalledSkill[],
  externalInstalledSkills: InstalledSkill[],
): InstalledSkill[] {
  const merged = new Map<string, InstalledSkill>()

  for (const skill of externalInstalledSkills) {
    merged.set(skill.path, skill)
  }
  for (const skill of dweisInstalledSkills) {
    merged.set(skill.path, skill)
  }

  return Array.from(merged.values())
}
