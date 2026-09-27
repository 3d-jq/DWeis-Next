/**
 * DWeis Next：CodingPlan 登录态业务请求头的独立小模块。
 *
 * 原实现位于 bigmodelCodingPlanSubscriptionProvider（该文件已随 CodingPlan 网络层
 * 摘除而删除）；availability 校验与 Team Plan runtime key 仍需要这两个请求头构造器，
 * 平移到此处保持行为不变。
 */

export function createBigModelLoginAuthHeaders(token: string): Record<string, string> {
  return {
    // BigModel 登录态业务接口要求 Authorization 直接传 accessToken。
    // 这里不能套 Bearer；Bearer 只适用于模型/API Key 类接口。
    Authorization: token,
    "Content-Type": "application/json",
  };
}

export function createZaiLoginAuthHeaders(token: string): Record<string, string> {
  return {
    // Z.ai provider connection 已把 access_token 持久化为业务 JWT。
    // 这里不能使用模型 API key，也不能给业务 JWT 添加 Bearer 前缀。
    Authorization: token,
    "Content-Type": "application/json",
  };
}
