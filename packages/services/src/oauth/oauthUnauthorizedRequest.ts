import type { ICredentialService } from "#src/credential/credential.js";

// 这里只判定候选请求；实际退出须由 OAuthService 在会话变更队列内复核，不能依赖异步旧快照。
export async function isCurrentOAuthCredentialRequest(options: {
  input: string | URL;
  headers: Headers;
  credentialService: Pick<ICredentialService, "load">;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  void options.env;
  const authorization = options.headers.get("authorization")?.trim() ?? "";
  if (!authorization) return false;
  const currentJwt = (await options.credentialService.load("zcodejwttoken"))?.trim() ?? "";
  if (currentJwt && authorization === `Bearer ${currentJwt}`) return true;

  // DWeis Next 无账号体系：Z.ai / BigModel OAuth 登录链路已摘除（provider config 删除、
  // 运行时配置恒空），业务 access token 的 userinfo 401 识别不再有登录来源，
  // 原 provider 分支（buildBigModelApiUrl / resolveZaiUserinfoUrl 等候选 URL 匹配）一并移除。
  // 保留 ZCode JWT 识别路径，兼容历史凭据的会话清理语义。
  return false;
}
