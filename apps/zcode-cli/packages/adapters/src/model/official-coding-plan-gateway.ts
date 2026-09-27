/**
 * 官方 Coding Plan 网关 —— DWeis Next 已停用。
 *
 * 历史上 Z.ai / BigModel Coding Plan 订阅者的请求会被改写发往 ZCode 平台网关
 * （zcode.z.ai），由平台做套餐权益校验后再转发。但 DWeis Next 是无账号的自托管产品，
 * 用户自行填写 api.z.ai / open.bigmodel.cn 的 API Key 直连：
 *   1. 直连请求会被劫持到 zcode.z.ai，用户在 Z.ai 的 Key 在网盖上无效 → 直接报错；
 *   2. 更严重的是，用户的 prompt 实际被发去了 Z.ai 平台网关，与「无云服务」冲突。
 *
 * 因此本模块恒返回 viaGateway=false，所有模型请求按用户配置的端点原样直连。
 * 路由表与构造器保留（含类型导出）以免破坏历史 import 形状。
 */

import type { EnvRecord } from "./model-execution.js";

export interface OfficialCodingPlanGatewayRoute {
  /** 官方模型端点（含路径），仅 https。 */
  readonly providerEndpoint: string;
  /** 对应的网关端点路径，相对 ZCode 平台 origin。 */
  readonly gatewayPath: string;
}

/** DWeis Next 停用网关：路由表恒为空。 */
export const OFFICIAL_CODING_PLAN_GATEWAY_ROUTES: readonly OfficialCodingPlanGatewayRoute[] = [];

export interface OfficialCodingPlanGatewayDecision {
  /** 是否命中官方端点并改为经网关发送。 */
  readonly viaGateway: boolean;
  /** 实际发送的 URL；未命中时与入参一致。 */
  readonly url: string;
}

export type OfficialCodingPlanGatewayFetch = typeof globalThis.fetch;

const GATEWAY_PATH_BY_PROVIDER_ENDPOINT: ReadonlyMap<string, string> = new Map(
  OFFICIAL_CODING_PLAN_GATEWAY_ROUTES.map((route) => [
    endpointKey(new URL(route.providerEndpoint)),
    route.gatewayPath,
  ]),
);

export function resolveOfficialCodingPlanGatewayUrl(
  requestUrl: string,
  _env: EnvRecord = process.env,
): OfficialCodingPlanGatewayDecision {
  // DWeis Next 不做账号/套餐：任何请求都不经平台网关，原样直连用户配置的端点。
  void _env;
  void GATEWAY_PATH_BY_PROVIDER_ENDPOINT;
  return { viaGateway: false, url: requestUrl };
}

/**
 * 包装模型 provider 的 fetch。DWeis Next 下永不改写 URL，直接透传。
 */
export function createOfficialCodingPlanGatewayFetch(options: {
  env?: EnvRecord;
  fetch: OfficialCodingPlanGatewayFetch;
}): OfficialCodingPlanGatewayFetch {
  return async (input, init) => {
    void options.env;
    return await options.fetch(input, init);
  };
}

function endpointKey(url: URL): string {
  const effectivePort = url.port || "443";
  return `${url.protocol}//${url.hostname.toLowerCase()}:${effectivePort}${normalizedPath(url.pathname)}`;
}

function normalizedPath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/u, "") || "/";
}
