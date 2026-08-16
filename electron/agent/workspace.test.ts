import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, test } from "vitest"
import { agentToolFiles, BROWSER_AGENT_TOOL_FILES } from "./tool-sources.ts"
import { ensureAgentWorkspace } from "./workspace.ts"

async function exists(pathname: string): Promise<boolean> {
  try {
    await access(pathname)
    return true
  } catch {
    return false
  }
}

async function writeSkill(skillsDir: string, name: string): Promise<void> {
  const dir = path.join(skillsDir, name)
  await mkdir(path.join(dir, "references"), { recursive: true })
  await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n# ${name}\n`, "utf-8")
  await writeFile(path.join(dir, "references", "extra.md"), "ref", "utf-8")
}

async function writeToolRuntime(base: string, source = "export const tool = (input) => input\n"): Promise<string> {
  const runtimePath = path.join(base, "tool.js")
  await writeFile(runtimePath, source, "utf-8")
  return runtimePath
}

test("ensureAgentWorkspace writes tool sources and copies bundled skills into .opencode/skill", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
  try {
    const workspaceDir = path.join(base, "workspace")
    const bundledSkillsDir = path.join(base, "bundled-skills")
    const bundledToolRuntimePath = await writeToolRuntime(base)
    await writeSkill(bundledSkillsDir, "browser")
    await writeSkill(bundledSkillsDir, "skill-creator")
    await writeSkill(bundledSkillsDir, "pptx-generator")
    const result = await ensureAgentWorkspace(workspaceDir, bundledSkillsDir, bundledToolRuntimePath)
    assert.equal(result, workspaceDir)

    for (const toolName of Object.keys(agentToolFiles())) {
      assert.ok(await exists(path.join(workspaceDir, ".opencode", "tools", toolName)), `tool ${toolName} written`)
    }
    assert.equal(
      await readFile(path.join(workspaceDir, ".opencode", "runtime", "tool.js"), "utf-8"),
      "export const tool = (input) => input\n",
    )

    const skillRoot = path.join(workspaceDir, ".opencode", "skill")
    assert.ok(await exists(path.join(skillRoot, "browser", "SKILL.md")), "browser SKILL.md copied")
    assert.ok(await exists(path.join(skillRoot, "browser", "references", "extra.md")), "browser references copied")
    assert.ok(await exists(path.join(skillRoot, "pptx-generator", "SKILL.md")), "pptx-generator SKILL.md copied")
    // 始终可用的内置技能同时镜像到共享技能根（.opencode/skills，技能管理页数据源）。
    assert.ok(
      await exists(path.join(workspaceDir, ".opencode", "skills", "skill-creator", "SKILL.md")),
      "skill-creator mirrored to shared skills root",
    )
    const mirroredSkill = path.join(workspaceDir, ".opencode", "skills", "skill-creator", "SKILL.md")
    const before = (await stat(mirroredSkill)).mtimeMs
    // 第二次启动：内容一致时不得覆盖镜像（mtime 不变），否则技能 watcher 检测到变化会无限重启 agent。
    await ensureAgentWorkspace(workspaceDir, bundledSkillsDir, bundledToolRuntimePath)
    assert.equal((await stat(mirroredSkill)).mtimeMs, before, "unchanged mirror is not rewritten")
  } finally {
    await rm(base, { force: true, recursive: true })
  }
})

test("ensureAgentWorkspace rebuilds .opencode/skill so removed bundled skills do not linger", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
  try {
    const workspaceDir = path.join(base, "workspace")
    const bundledSkillsDir = path.join(base, "bundled-skills")
    const bundledToolRuntimePath = await writeToolRuntime(base)
    await writeSkill(bundledSkillsDir, "browser")
    await writeSkill(bundledSkillsDir, "pptx-generator")
    await ensureAgentWorkspace(workspaceDir, bundledSkillsDir, bundledToolRuntimePath)
    assert.ok(await exists(path.join(workspaceDir, ".opencode", "skill", "pptx-generator", "SKILL.md")))

    // 第二次：bundled 源里移除 pptx-generator，workspace 应同步清除。
    await rm(path.join(bundledSkillsDir, "pptx-generator"), { force: true, recursive: true })
    await ensureAgentWorkspace(workspaceDir, bundledSkillsDir, bundledToolRuntimePath)

    assert.ok(await exists(path.join(workspaceDir, ".opencode", "skill", "browser", "SKILL.md")), "kept skill remains")
    assert.equal(
      await exists(path.join(workspaceDir, ".opencode", "skill", "pptx-generator")),
      false,
      "removed skill cleared",
    )
  } finally {
    await rm(base, { force: true, recursive: true })
  }
})

test("ensureAgentWorkspace rebuilds .opencode/tools so removed tool sources do not linger", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
  try {
    const workspaceDir = path.join(base, "workspace")
    const staleToolPath = path.join(workspaceDir, ".opencode", "tools", "check_provider_connection.ts")
    const bundledToolRuntimePath = await writeToolRuntime(base)

    await ensureAgentWorkspace(workspaceDir, undefined, bundledToolRuntimePath)
    await writeFile(staleToolPath, "export default {}", "utf-8")
    assert.ok(await exists(staleToolPath), "stale tool fixture written")

    await ensureAgentWorkspace(workspaceDir, undefined, bundledToolRuntimePath)

    assert.equal(await exists(staleToolPath), false, "removed tool cleared")
    for (const toolName of Object.keys(agentToolFiles())) {
      assert.ok(await exists(path.join(workspaceDir, ".opencode", "tools", toolName)), `tool ${toolName} remains`)
    }
  } finally {
    await rm(base, { force: true, recursive: true })
  }
})

test("ensureAgentWorkspace copies only the always-available bundled skills, never upstream-only skills", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
  try {
    const workspaceDir = path.join(base, "workspace")
    const bundledSkillsDir = path.join(base, "bundled-skills")
    const bundledToolRuntimePath = await writeToolRuntime(base)
    await writeSkill(bundledSkillsDir, "browser")
    await writeSkill(bundledSkillsDir, "skill-creator")
    await writeSkill(bundledSkillsDir, "oo")
    await ensureAgentWorkspace(workspaceDir, bundledSkillsDir, bundledToolRuntimePath)

    for (const toolName of Object.keys(BROWSER_AGENT_TOOL_FILES)) {
      assert.ok(await exists(path.join(workspaceDir, ".opencode", "tools", toolName)))
    }
    assert.ok(await exists(path.join(workspaceDir, ".opencode", "skill", "browser", "SKILL.md")))
    assert.ok(await exists(path.join(workspaceDir, ".opencode", "skill", "skill-creator", "SKILL.md")))
    assert.equal(await exists(path.join(workspaceDir, ".opencode", "skill", "oo")), false)
    assert.ok(await exists(path.join(workspaceDir, ".opencode", "skills")))
  } finally {
    await rm(base, { force: true, recursive: true })
  }
})

test("ensureAgentWorkspace works without a bundled skills directory", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
  try {
    const workspaceDir = path.join(base, "workspace")
    const bundledToolRuntimePath = await writeToolRuntime(base)
    await ensureAgentWorkspace(workspaceDir, path.join(base, "does-not-exist"), bundledToolRuntimePath)
    assert.ok(await exists(path.join(workspaceDir, ".opencode", "tools")), "tools still written")
    assert.equal(await exists(path.join(workspaceDir, ".opencode", "skill")), false, "no skill dir when source missing")
    assert.ok(await exists(path.join(workspaceDir, ".opencode", "skills")), "runtime skills dir still exists")
  } finally {
    await rm(base, { force: true, recursive: true })
  }
})

test("ensureAgentWorkspace rejects a missing bundled tool runtime", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
  try {
    await expect(ensureAgentWorkspace(path.join(base, "workspace"))).rejects.toThrow(
      "Bundled agent tool runtime path is required",
    )
  } finally {
    await rm(base, { force: true, recursive: true })
  }
})

test("ensureAgentWorkspace refreshes a stale tool runtime", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
  try {
    const workspaceDir = path.join(base, "workspace")
    const bundledToolRuntimePath = await writeToolRuntime(base, "export const version = 1\n")
    await ensureAgentWorkspace(workspaceDir, undefined, bundledToolRuntimePath)
    await writeFile(bundledToolRuntimePath, "export const version = 2\n", "utf-8")

    await ensureAgentWorkspace(workspaceDir, undefined, bundledToolRuntimePath)

    await expect(readFile(path.join(workspaceDir, ".opencode", "runtime", "tool.js"), "utf-8")).resolves.toBe(
      "export const version = 2\n",
    )
  } finally {
    await rm(base, { force: true, recursive: true })
  }
})

test.runIf(process.platform !== "win32")(
  "ensureAgentWorkspace replaces a symbolic-link runtime without writing outside the workspace",
  async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "dweis-workspace-"))
    try {
      const workspaceDir = path.join(base, "workspace")
      const outsideDir = path.join(base, "outside")
      const bundledToolRuntimePath = await writeToolRuntime(base, "export const safe = true\n")
      await mkdir(path.join(workspaceDir, ".opencode"), { recursive: true })
      await mkdir(outsideDir)
      await writeFile(path.join(outsideDir, "tool.js"), "outside\n", "utf-8")
      await symlink(outsideDir, path.join(workspaceDir, ".opencode", "runtime"), "dir")

      await ensureAgentWorkspace(workspaceDir, undefined, bundledToolRuntimePath)

      await expect(readFile(path.join(outsideDir, "tool.js"), "utf-8")).resolves.toBe("outside\n")
      await expect(readFile(path.join(workspaceDir, ".opencode", "runtime", "tool.js"), "utf-8")).resolves.toBe(
        "export const safe = true\n",
      )
    } finally {
      await rm(base, { force: true, recursive: true })
    }
  },
)
