import type { ApiClient } from "@zcode/shared";
import type { OAuthRuntimeConfig } from "../runtimeConfig.js";
import type { OAuthProviderAdapter } from "./providerAdapter.js";

/**
 * 根据运行时配置创建可用 provider adapter。
 *
 * DWeis Next 无账号体系：原 BigModel/Zai 两个 adapter 已随登录链路摘除删除，
 * 运行时配置恒为空 provider 列表（见 runtimeConfig.ts），这里恒返回空数组——
 * 没有任何 OAuth 登录方式可达。保留接口是为不破坏 OAuthService 的导入契约。
 */
export function createOAuthProviderAdapters(
  config: OAuthRuntimeConfig,
  options: { apiClient?: ApiClient } = {},
): OAuthProviderAdapter[] {
  void config;
  void options;
  return [];
}

export type { OAuthProviderAdapter, OAuthProviderContext } from "./providerAdapter.js";
