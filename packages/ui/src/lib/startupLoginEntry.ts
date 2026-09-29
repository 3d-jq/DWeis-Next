/**
 * 启动登录入口（WelcomeScreen）判定。
 *
 * DWeis Next 无云账号体系：原判定 `!providerFamilyDomain || (!user && !hasUsableProvider)`
 * 里的 providerFamilyDomain 是智谱云登录成功后才写入的字段，本产品已摘除 OAuth 登录，
 * 它永远是 null → 守卫每次启动都打开欢迎页，即使用户已经配好模型。
 * 这里把判定收敛为纯函数：只看「有没有已登录用户」和「有没有可用 Provider」。
 */
export function shouldOpenStartupLoginEntry(input: {
  hasUser: boolean;
  hasUsableProvider: boolean;
}): boolean {
  return !input.hasUser && !input.hasUsableProvider;
}
