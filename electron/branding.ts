// R1：产品品牌相关标识的**单一来源**。改名只动这一处。
//
// 注意（R1 例外）：`@oomol/connection` 的 ServiceName 字符串前缀虽放在这里集中，
// 但 oo-cli 的 `OO_` 环境变量前缀、connector 的 `x-oomol-*` 头等属于外部协议契约，
// **不随产品名改**，不在本文件管辖。
//
// 本文件为纯常量、无运行时依赖，可被 main / preload / renderer / scripts 共同 import。

export const branding = {
  /** 产品显示名（窗口标题、应用菜单、侧边栏 logo 文案）。 */
  appName: "DWeis Next",
  /** 公司/服务品牌名（如内置模型 provider、官方技能维护者）。 */
  companyName: "DWeis",
  /** 生产包 appId（electron-builder.ts 从这里派生）。 */
  appId: "com.dweis.next",
  /** 本地开发版 Electron 的 bundle id（download-electron 改写 .electron-dist 的 plist）。 */
  devBundleId: "com.dweis.next-local",
  /** 生产 deep-link scheme（electron-builder.ts 从这里派生）。 */
  protocolScheme: "dweis-next",
  /** 本地开发 deep-link scheme。 */
  devProtocolScheme: "dweis-next-local",
  /** 应用内部本地 Artifact 流式资源协议，不注册为系统 deep-link。 */
  artifactResourceProtocolScheme: "dweis-next-resource",
  /** @oomol/connection ServiceName 的命名空间前缀（产品内部约定）。 */
  servicePrefix: "dweisnext",
  /** preload 暴露到 renderer 的全局 bridge 名（window.<windowBridge>）。 */
  windowBridge: "dweisnext",
  /** 用户私有数据目录名（传给 oo-cli 的 OO_*_DIR 等使用）。 */
  storeDirName: "dweisnext",
  /** localStorage / 前端持久化 key 前缀。
   *  刻意保持 "dweis"（旧命名）：与 sidebar-persistence / app-shell-model /
   *  ChatErrorNotice 中硬编码的 dweis.* key 及老用户本地配置保持一致。不可改为 "dweisnext"——
   *  改了会出现双前缀并存、老用户配置静默丢失（详见代码审查结论）。service/bridge 身份走
   *  servicePrefix / windowBridge（均为 dweisnext），与存储 key 命名空间刻意分离。 */
  storageKeyPrefix: "dweis",
  /** GitHub 发布仓库（自动更新源：electron-updater github provider 从这里派生 owner/repo）。 */
  updateRepo: {
    owner: "3d-jq",
    repo: "DWeis-Next",
  },
} as const

/** 拼接一个 ServiceName 字符串，如 `serviceName("ping-service") === "dweisnext/ping-service"`。 */
export function serviceName(name: string): string {
  return `${branding.servicePrefix}/${name}`
}

/** 拼接一个带前缀的前端持久化 key，如 `storageKey("theme") === "dweis.theme"`。 */
export function storageKey(name: string): string {
  return `${branding.storageKeyPrefix}.${name}`
}
