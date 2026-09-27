// DWeis Next 无云绑定：SSH/WSL/Docker 连接流程已摘除，本类型仅为兼容保留——
// CLI v4 协议层解析历史 session 的 workspace identity、旧 settings.json 里残留的
// RemoteTarget 快照、以及 workspace tab 的 remote 类型字段都需要它。新会话不再
// 产生 remote target；assetInstallMode / resourcePackages（原远端资产部署选项）
// 已失去构造入口，按字符串保留字段形状供历史数据反序列化。
export interface SSHConnectOptions {
  kind: "ssh";
  host: string;
  port?: number;
  username: string;
  sshConfigAlias?: string;
  password?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  assetInstallMode?: string;
  resourcePackages?: { selectedPackageIds?: string[] };
}

export interface WSLConnectOptions {
  kind: "wsl";
  distro?: string;
  user?: string;
}

export interface DockerConnectOptions {
  kind: "docker";
  container: string;
}

export type RemoteTarget = SSHConnectOptions | WSLConnectOptions | DockerConnectOptions;

/** 删除只应存在于当前连接流程中的 secret，供长期内存状态和跨进程回包使用。 */
export function stripRemoteTargetSecrets(target: RemoteTarget): RemoteTarget {
  if (target.kind === "ssh") {
    const {
      password: _password,
      privateKeyPassphrase: _privateKeyPassphrase,
      ...sanitized
    } = target;
    return sanitized;
  }
  return target;
}
