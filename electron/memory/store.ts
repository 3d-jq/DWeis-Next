import { readFile } from "node:fs/promises"
import path from "node:path"
import { atomicWriteText } from "../atomic-file.ts"
import { isMissingFileError, logStoreReadFailure } from "../store-diagnostics.ts"

/**
 * 持久记忆文件存储（借鉴 Hermes builtin memory）：
 * - MEMORY.md —— agent 长期记忆（上限 2200 字符，由 memory 工具与设置页共同维护）
 * - USER.md —— 用户档案（上限 1375 字符）
 *
 * 文件位于 userData 根目录，与 settings.json 平级，用户可直接查看/备份。
 * 不存在时按空记忆处理（ENOENT 静默），其余读失败走 logStoreReadFailure 后同样回落空内容，
 * 保证记忆故障永不阻塞对话。
 */
export class MemoryStore {
  private readonly agentFile: string
  private readonly userFile: string

  public constructor(dir: string) {
    this.agentFile = path.join(dir, "MEMORY.md")
    this.userFile = path.join(dir, "USER.md")
  }

  public async readAgent(): Promise<string> {
    return this.readFile(this.agentFile)
  }

  public async readUser(): Promise<string> {
    return this.readFile(this.userFile)
  }

  public async writeAgent(content: string): Promise<void> {
    await this.writeFile(this.agentFile, content)
  }

  public async writeUser(content: string): Promise<void> {
    await this.writeFile(this.userFile, content)
  }

  private async readFile(file: string): Promise<string> {
    try {
      return await readFile(file, "utf-8")
    } catch (error) {
      if (isMissingFileError(error)) {
        return ""
      }
      logStoreReadFailure("memory", file, error)
      return ""
    }
  }

  private async writeFile(file: string, content: string): Promise<void> {
    await atomicWriteText(file, content, { mode: 0o600 })
  }
}
