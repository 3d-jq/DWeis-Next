import type { OAuthProviderId } from "@zcode/shared";

/** Provider 运行时配置（仅 host process 可见） */
export interface OAuthProviderRuntimeConfig {
  id: OAuthProviderId;
  displayName: string;
  enabled: boolean;
  order: number;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  appId: string;
  redirectUri: string;
  businessLoginUrl?: string;
  appSecret?: string;
}

/** OAuth 全局运行时配置 */
export interface OAuthRuntimeConfig {
  providers: OAuthProviderRuntimeConfig[];
}

/**
 * 从运行时环境变量生成 OAuth 配置。
 *
 * DWeis Next 无账号体系：Z.ai / BigModel 的 OAuth provider 配置
 * （原 createZaiProviderRuntimeConfig / createBigModelProviderRuntimeConfig）已随
 * 登录链路摘除删除，这里恒返回空 provider 列表——OAuthService 因此没有任何
 * 可用登录方式，authorize/token/userinfo 全链路不可达。
 * 保留接口是为不破坏 OAuthService 与 DI 装配的导入契约（「关出口 + 保留契约」）。
 *
 * 注意：这里只能在 host process 使用，避免把敏感配置暴露给 renderer。
 */
export function createOAuthRuntimeConfig(_env: NodeJS.ProcessEnv = process.env): OAuthRuntimeConfig {
  void _env;
  return {
    providers: [],
  };
}
