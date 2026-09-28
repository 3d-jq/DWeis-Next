// DWeis Next 环境契约：provider 配置的「显式路径」由本产品自己的 env 命名空间承载。
// 之前复用 ZCode 的 ZCODE_* 变量名，等于把插入点暴露给任何在本机跑过的 ZCode
// 进程——它写入的那个值会被我们的 CLI 入口原样透传，agent 于是读到另一份装机的
// 空模板缓存。换成 DWEIS_* 之后，外部注入在变量名上就不匹配，隔离不再依赖过滤。
export const ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV = "DWEIS_BUILTIN_PROVIDER_CONFIG_FILE";
export const ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV =
  "DWEIS_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE";
export const ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV = "DWEIS_PERSONAL_PROVIDER_CONFIG_FILE";
export const PERSONAL_PROVIDER_CONFIG_FILE_NAME = "provider_config.json";

export interface NodeProviderRuntimePaths {
  readonly zcodeBuiltinFilePath: string;
  readonly personalFilePath: string;
}

export function createNodeProviderRuntimePathEnv(
  paths: NodeProviderRuntimePaths,
): Record<string, string> {
  return {
    [ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: paths.zcodeBuiltinFilePath,
    [ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: paths.personalFilePath,
  };
}

export function resolveNodeProviderRuntimePaths(
  env: Readonly<Record<string, string | undefined>>,
): NodeProviderRuntimePaths | null {
  const zcodeBuiltinFilePath = env[ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV]?.trim();
  const personalFilePath = env[ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV]?.trim();
  if (!zcodeBuiltinFilePath && !personalFilePath) return null;
  if (!zcodeBuiltinFilePath || !personalFilePath) {
    throw new Error("ZCode Built-in 与 Personal Provider Config 路径必须同时提供");
  }
  return Object.freeze({ zcodeBuiltinFilePath, personalFilePath });
}
