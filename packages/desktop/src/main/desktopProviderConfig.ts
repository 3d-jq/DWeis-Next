import { app } from "electron";
import { join } from "node:path";

/**
 * 解析内置 provider 配置路径。DWeis Next 的契约：只认两个来源——
 * 打包态取随包 `resources/config/provider/`，开发态取仓库 `config/provider/`。
 *
 * 这里刻意不接受任何外部路径输入（env、参数 override 都没有）。历史上该开关复用了
 * ZCode 的运行时变量，导致本机另一份 ZCode 装机的缓存能被塞进来，模板为空时启动
 * 即误报「去配置供应商」；env 契约已改到 DWeis 自己的命名空间，并且桌面侧不再
 * 把任何外部路径透传给 host/agent，路径解析从此只有这一条确定性链路。
 */
export function resolveZCodeBuiltinProviderConfigFilePath(options?: {
  readonly appPath?: string;
  readonly isPackaged?: boolean;
  readonly resourcesPath?: string;
}): string {
  if (options?.isPackaged ?? app.isPackaged) {
    return join(
      options?.resourcesPath ?? process.resourcesPath,
      "config/provider/zcode-builtin.json",
    );
  }
  const filename = "zcode-builtin.json";
  return join(options?.appPath ?? app.getAppPath(), "../../config/provider", filename);
}
