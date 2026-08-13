import { lstat } from "node:fs/promises"
import path from "node:path"

/**
 * opencode 的 @ 文件引用（FILE_REGEX）在 sidecar 里按实例 worktree（agent workspace）解析相对路径，
 * 而 DWeis 的用户项目在别处——相对路径会落到错误目录。这里在发送前把用户消息里的 @ 相对路径
 * 基于项目根解析为绝对路径（仅转换项目内真实存在的路径；不存在时保留原样，可能是 @agent 引用或拼写）。
 */
export async function resolveAtMentionPaths(text: string, projectRoot: string): Promise<string> {
  if (!text.includes("@")) {
    return text
  }
  // 与 opencode 的 FILE_REGEX 一致：@ 后跟路径片段（可含 ./ 与扩展名）。
  const matches = [...text.matchAll(/(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g)]
  if (matches.length === 0) {
    return text
  }
  let result = text
  for (const match of matches.reverse()) {
    const name = match[1]
    if (!name || path.isAbsolute(name) || name.startsWith("~/")) {
      continue
    }
    const candidate = path.resolve(projectRoot, name)
    try {
      await lstat(candidate)
    } catch {
      continue
    }
    const start = match.index ?? 0
    result = result.slice(0, start) + `@${candidate}` + result.slice(start + match[0].length)
  }
  return result
}
