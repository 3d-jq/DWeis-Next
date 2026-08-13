// 校验 vendored 技能安装副本与 skills-lock.json 一致（检测本地漂移/缺失）。
// 锁的 computedHash 记录的是上游源文件 hash（skillPath 为上游仓库内路径）；
// installedHash 记录本地安装副本（.claude/skills/<name>/SKILL.md）的 sha256——
// 只有它才能检测"本地副本被修改/污染"这一漂移。
// 对齐 opencode：本地技能目录是模型读取的事实来源；本脚本让锁文件有可执行的校验入口。
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const lockPath = path.join(root, "skills-lock.json")

let lock
try {
  lock = JSON.parse(await readFile(lockPath, "utf8"))
} catch (error) {
  console.error(`[skills-lock] cannot read ${lockPath}:`, error.message)
  process.exit(1)
}

let failed = false
const entries = lock.skills ?? {}
if (Object.keys(entries).length === 0) {
  console.error("[skills-lock] no skills recorded in lock file")
  process.exit(1)
}

for (const [name, entry] of Object.entries(entries)) {
  const installed = path.join(root, ".claude", "skills", name, "SKILL.md")
  try {
    await stat(installed)
  } catch {
    console.error(`[skills-lock] missing installed skill: ${installed}`)
    failed = true
    continue
  }
  const content = await readFile(installed)
  const hash = createHash("sha256").update(content).digest("hex")
  if (entry.installedHash && entry.installedHash !== hash) {
    console.error(`[skills-lock] installed skill drifted: ${name} (${installed})`)
    console.error(`  lock: ${entry.installedHash}`)
    console.error(`  disk: ${hash}`)
    failed = true
  } else if (!entry.installedHash) {
    console.error(`[skills-lock] ${name}: no installedHash recorded — run with --update to record current disk hash`)
  }
}

if (process.argv.includes("--update")) {
  // 记录当前磁盘安装副本 hash，供后续漂移检测对比。
  for (const [name, entry] of Object.entries(entries)) {
    const installed = path.join(root, ".claude", "skills", name, "SKILL.md")
    try {
      const content = await readFile(installed)
      entry.installedHash = createHash("sha256").update(content).digest("hex")
    } catch {
      // 缺失的安装副本保持无 installedHash，由校验失败暴露
    }
  }
  const { writeFile } = await import("node:fs/promises")
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log("[skills-lock] installedHash updated")
}

if (failed) {
  console.error("[skills-lock] verification failed")
  process.exit(1)
}
console.log("[skills-lock] ok")
