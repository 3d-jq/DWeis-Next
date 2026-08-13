import assert from "node:assert/strict"
import { test } from "vitest"
import { assertSkillOperationSucceeded, createDeleteSkillArgs } from "./actions.ts"


test("assertSkillOperationSucceeded accepts completed and noop json results", () => {
  assert.doesNotThrow(() =>
    assertSkillOperationSucceeded(JSON.stringify({ command: "skills.update", status: "completed" }), "skills.update"),
  )
  assert.doesNotThrow(() =>
    assertSkillOperationSucceeded(JSON.stringify({ command: "skills.update", status: "noop" }), "skills.update"),
  )
})

test("assertSkillOperationSucceeded rejects partial failures", () => {
  assert.throws(
    () =>
      assertSkillOperationSucceeded(
        JSON.stringify({
          command: "skills.update",
          errors: [{ message: "Network unavailable." }],
          status: "partial-failure",
        }),
        "skills.update",
      ),
    /Network unavailable/,
  )
})

test("assertSkillOperationSucceeded reports skill entry failures", () => {
  assert.throws(
    () =>
      assertSkillOperationSucceeded(
        JSON.stringify({
          command: "skills.update",
          skills: [
            {
              error: {
                code: "package_not_installed",
                message: "No installed oo-managed skill belongs to the package.",
              },
              skillId: "@alice/demo",
              status: "failed",
            },
          ],
          status: "failed",
        }),
        "skills.update",
      ),
    /No installed oo-managed skill belongs to the package/,
  )
})

test("assertSkillOperationSucceeded reports skill entry failures with code-only errors", () => {
  assert.throws(
    () =>
      assertSkillOperationSucceeded(
        JSON.stringify({
          command: "skills.update",
          skills: [
            {
              error: { code: "package_not_installed" },
              skillId: "@alice/demo",
              status: "failed",
            },
          ],
          status: "failed",
        }),
        "skills.update",
      ),
    /package_not_installed/,
  )
})

test("assertSkillOperationSucceeded reports target entry failures", () => {
  assert.throws(
    () =>
      assertSkillOperationSucceeded(
        JSON.stringify({
          command: "skills.install",
          skills: [
            {
              skillId: "demo",
              status: "failed",
              targets: [
                {
                  error: { code: "name_conflict", message: "Skill name is already used by a non-OOMOL skill." },
                  status: "failed",
                },
              ],
            },
          ],
          status: "failed",
        }),
        "skills.install",
      ),
    /Skill name is already used by a non-OOMOL skill/,
  )
})

test("assertSkillOperationSucceeded rejects unexpected command responses", () => {
  assert.throws(
    () =>
      assertSkillOperationSucceeded(
        JSON.stringify({ command: "skills.install", status: "completed" }),
        "skills.update",
      ),
    /unexpected command/,
  )
})

test("createDeleteSkillArgs uninstalls a Skill from DWeis", () => {
  assert.deepEqual(createDeleteSkillArgs({ skillId: "demo" }), ["skills", "uninstall", "demo", "--json"])
})
