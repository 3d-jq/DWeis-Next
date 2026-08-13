import { access } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { dweisBundledSkillIds, dweisSkillsDir } from "./skills.ts"

describe("DWeis bundled skills", () => {
  it("keeps a tracked SKILL.md source for every bundled DWeis skill", async () => {
    await expect(
      Promise.all(dweisBundledSkillIds.map((skillId) => access(path.join(dweisSkillsDir, skillId, "SKILL.md")))),
    ).resolves.toBeDefined()
  })
})
