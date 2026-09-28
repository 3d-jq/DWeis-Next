import { app } from "electron";
import { join } from "node:path";

export function resolveZCodeBuiltinProviderConfigFilePath(options?: {
  readonly appPath?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly isPackaged?: boolean;
  readonly resourcesPath?: string;
}): string {
  // DWeis Next 修复：本机 env 的 ZCODE_BUILTIN_PROVIDER_CONFIG_FILE 是「运行时
  // Active 缓存路径」开关，属于另一份 ZCode 装机（或历史版本）的遗留配置。
  // 桌面进程读它会把 provider registry 指向那份旧缓存（模板为空），导致刚打出
  // 的安装包启动后误报「去配置供应商」。DWeis Next 的内置配置只认随包资源与
  // 仓库 config 目录，不读该 override。
  if (options?.isPackaged ?? app.isPackaged) {
    return join(
      options?.resourcesPath ?? process.resourcesPath,
      "config/provider/zcode-builtin.json",
    );
  }
  // 开发态与打包共用唯一配置源。
  const filename = "zcode-builtin.json";
  return join(options?.appPath ?? app.getAppPath(), "../../config/provider", filename);
}
