import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { agentToolFiles } from "./tool-sources.ts"

const alwaysAvailableBundledSkillIds = new Set([
  "browser",
  "skill-creator",
  // MiniMax-AI/skills 办公 skill（MIT）：PPT/DOCX/XLSX/PDF 生成与编辑。
  "pptx-generator",
  "minimax-docx",
  "minimax-xlsx",
  "minimax-pdf",
])

export interface AgentWorkspaceOptions {
  bundledOoSkills: boolean
  connectors: boolean
}

/** Windows 下递归删除偶发 ENOTEMPTY/EBUSY/EPERM（残留文件句柄未释放、杀软扫描或并发写入）：
 * 短暂退避重试几次，避免整体重建 workspace 的 rm 在最后一步 rmdir 上炸掉启动。 */
async function removeDirectoryRetry(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(directory, { force: true, recursive: true })
      return
    } catch (error) {
      const code = error instanceof Error ? (error as { code?: string }).code : undefined
      if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EPERM") {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
    }
  }
}

/**
 * 在 rootDir 下生成 OpenCode workspace 的自定义工具文件（.opencode/tools/*.ts）与内置 skill（.opencode/skill/*）。
 * 幂等：每次启动覆盖写入，保证与内嵌源码 / 打包内置 skill 一致。返回 workspace 根目录（用作 sidecar 的 cwd）。
 *
 * OpenCode 会扫描 cwd 下 .opencode/{skill,skills}/<name>/SKILL.md，故把产品内置 skill 拷到这里，
 * DWeis 自己的 agent 即可直接读到——不再依赖把 skill 释放到其他 AI agent 的家目录。
 */
export async function ensureAgentWorkspace(
  rootDir: string,
  bundledSkillsDir?: string,
  bundledToolRuntimePath?: string,
  options: AgentWorkspaceOptions = { bundledOoSkills: true, connectors: true },
): Promise<string> {
  if (!bundledToolRuntimePath) {
    throw new Error("Bundled agent tool runtime path is required.")
  }
  const opencodeDir = path.join(rootDir, ".opencode")
  const toolsDir = path.join(opencodeDir, "tools")
  const runtimeSkillsDir = path.join(opencodeDir, "skills")
  await removeDirectoryRetry(toolsDir)
  await Promise.all([mkdir(toolsDir, { recursive: true }), mkdir(runtimeSkillsDir, { recursive: true })])
  await Promise.all(
    Object.entries(agentToolFiles(options.connectors)).map(([name, source]) =>
      writeFile(path.join(toolsDir, name), source, "utf-8"),
    ),
  )
  await syncToolRuntime(opencodeDir, bundledToolRuntimePath)
  await syncBundledSkills(opencodeDir, bundledSkillsDir, options.bundledOoSkills)
  return rootDir
}

/** 把构建期合并的 tool helper + Zod runtime 覆盖到 workspace，工具加载不依赖 OpenCode 首启联网安装插件。 */
async function syncToolRuntime(opencodeDir: string, bundledToolRuntimePath: string): Promise<void> {
  const runtimeDir = path.join(opencodeDir, "runtime")
  const runtimeSource = await readFile(bundledToolRuntimePath)
  const stagingDir = await mkdtemp(path.join(opencodeDir, ".runtime-"))
  try {
    await writeFile(path.join(stagingDir, "tool.js"), runtimeSource, { flag: "wx" })
    await removeDirectoryRetry(runtimeDir)
    await rename(stagingDir, runtimeDir)
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true })
    throw error
  }
}

/**
 * 以打包内置 skill 为准重建 .opencode/skill/：先读源目录、确认可用后再清空旧目录逐个拷入。
 * 先读后删，避免源不可读时误删上一份好副本（rm 不能先于 readdir）。
 */
async function syncBundledSkills(
  opencodeDir: string,
  bundledSkillsDir: string | undefined,
  includeOomolSkills: boolean,
): Promise<void> {
  const skillDir = path.join(opencodeDir, "skill")

  if (!bundledSkillsDir) {
    await removeDirectoryRetry(skillDir)
    return
  }

  let entries
  try {
    entries = await readdir(bundledSkillsDir, { withFileTypes: true })
  } catch (error) {
    // 源缺失/不可读（如 dev 跳过 postinstall）：非致命——skills 全程 best-effort，不为 4 个可选 skill 阻断
    // agent 启动。但显式告警（不再静默），避免发布包遗漏 Resources/skills 时问题被完全掩盖；保留已有副本不删。
    console.warn(`[dweis] bundled skills source unavailable at ${bundledSkillsDir}; keeping existing skills:`, error)
    return
  }

  await removeDirectoryRetry(skillDir)

  const skillNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => includeOomolSkills || alwaysAvailableBundledSkillIds.has(name))
  if (skillNames.length === 0) {
    return
  }

  await mkdir(skillDir, { recursive: true })
  await Promise.all(
    skillNames.map((name) => cp(path.join(bundledSkillsDir, name), path.join(skillDir, name), { recursive: true })),
  )

  // 共享技能根镜像：把始终可用的内置技能也放进 .opencode/skills/（复数，技能管理页的数据源），
  // 让用户能在设置 → 技能里看到产品自带技能（如 skill-creator），而不是只存在于 opencode 扫描
  // 但管理页不可见的单数目录。⚠️ 该目录被技能 watcher 监听（任何文件变化都会调度 agent 重启），
  // 因此必须"内容一致就跳过覆盖"——否则每次启动覆盖自身造成 启动→写→重启 死循环。
  const sharedSkillDir = path.join(opencodeDir, "skills")
  await mkdir(sharedSkillDir, { recursive: true })
  const sharedSkillNames = [...alwaysAvailableBundledSkillIds].filter(
    (name) => name !== "browser" && skillNames.includes(name),
  )
  await Promise.all(
    sharedSkillNames.map((name) =>
      mirrorBundledSkillIfChanged(path.join(bundledSkillsDir, name), path.join(sharedSkillDir, name)),
    ),
  )
}

/** 仅当目标缺失或 SKILL.md 内容不一致时拷贝（内容一致跳过 → 不产生文件事件 → 不触发技能 watcher 重启）。 */
async function mirrorBundledSkillIfChanged(sourceSkill: string, targetSkill: string): Promise<void> {
  try {
    const [source, target] = await Promise.all([
      readFile(path.join(sourceSkill, "SKILL.md"), "utf-8"),
      readFile(path.join(targetSkill, "SKILL.md"), "utf-8"),
    ])
    if (source === target) {
      return
    }
  } catch {
    // 源或目标缺失：走正常拷贝。
  }
  await cp(sourceSkill, targetSkill, { recursive: true })
}
