import { ooEndpoint } from "../domain.ts"

export interface OoMaintenanceEnvOptions {
  /** oo 配置目录。维护全局 oo store 时需要直接指向用户级 oo 根目录。 */
  configDir: string
  /** oo 数据目录。 */
  dataDir: string
  /** oo 日志目录。 */
  logDir: string
  /** oo 二进制绝对路径（注入 DWEIS_OO_BIN，供自定义工具直接调用，比 PATH 更稳）。 */
  ooBinPath?: string
}

/** R3: Build the oo environment used to maintain the Skill store with caller-owned directories.
 * 纯本地模式无网关凭证：不注入 OO_API_KEY / 连接器端点。 */
export function buildOomolMaintenanceEnv({
  configDir,
  dataDir,
  logDir,
  ooBinPath,
}: OoMaintenanceEnvOptions): Record<string, string> {
  return {
    ...buildOoBaseEnv({ configDir, dataDir, logDir, ooBinPath }),
    OO_ENDPOINT: ooEndpoint,
    DWEIS_ENDPOINT: ooEndpoint,
  }
}

function buildOoBaseEnv({ configDir, dataDir, logDir, ooBinPath }: OoMaintenanceEnvOptions): Record<string, string> {
  const env: Record<string, string> = {
    OO_CONFIG_DIR: configDir,
    OO_DATA_DIR: dataDir,
    OO_LOG_DIR: logDir,
    OO_SKILLS_SYNC_DISABLED: "1",
    OO_NO_SELF_UPDATE: "1",
    OO_TELEMETRY_DISABLED: "1",
    OO_LOG_LEVEL: "warn",
  }
  if (ooBinPath) {
    env.DWEIS_OO_BIN = ooBinPath
  }
  return env
}
