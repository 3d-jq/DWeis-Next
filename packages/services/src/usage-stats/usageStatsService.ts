import type {
  AppUsageRequest,
  AppUsageSnapshot,
  CodingPlanUsageRequest,
  CodingPlanUsageSnapshot,
  CodingPlanResetOpportunityRequest,
  CodingPlanResetOpportunityResult,
  CodingPlanResetScopeRequest,
  CodingPlanResetStatusSnapshot,
  CodingPlanResetUseRequest,
  CodingPlanResetUseResult,
  UsageEntitlementRequest,
  UsageEntitlementSnapshot,
  UsageStatsRequest,
  UsageStatsSnapshot,
} from "@zcode/shared";
import type { IZCodeAgentService } from "../zcode-agent/zcodeAgent.js";
import type { IUsageStatsService } from "./usageStats.js";

interface UsageStatsServiceDependencies {
  /** App Usage 经 ZCode Protocol 读取 agent 数据库真实统计。 */
  zcodeAgentService: Pick<IZCodeAgentService, "getAppUsageStats">;
}

/**
 * DWeis Next：会员额度（Coding Plan usage/quota/reset）网络链路摘除后的本地实现。
 *
 * DWeis Next 是无账号、无云绑定的自托管产品（见 docs/dweis-next-plan.md）：
 * BigModelUsageQuotaProvider 及其 monitor/mapper/订阅摘要、官方 MCP 额度查询全部
 * 依赖 Z.ai / BigModel 平台账号，已随网络层一并删除。用量统计只保留本地
 * App Usage（agent 数据库真实统计），其余方法按「关出口 + 保留契约」返回
 * 「未配置账号」语义的本地空值或稳定错误码，绝不发起网络请求。
 *
 * IUsageStatsService 是跨包公开契约（client/remoteServiceAccess、desktop host 装配、
 * ui hooks 都依赖），方法签名保持不变，只替换实现。
 */
export function createUsageStatsService(
  dependencies: UsageStatsServiceDependencies,
): IUsageStatsService {
  return {
    async getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot> {
      // App Usage 读取 agent 数据库真实统计（model_usage/turn_usage/tool_usage），
      // 经 ZCode Protocol usage/stats 取回。这是 DWeis Next 唯一保留的用量面。
      return dependencies.zcodeAgentService.getAppUsageStats({
        range: request.range,
        timeZone: request.timeZone,
      });
    },
    async getCodingPlanUsageSnapshot(
      _request: CodingPlanUsageRequest,
    ): Promise<CodingPlanUsageSnapshot> {
      // Coding Plan 用量监控依赖平台账号；入口（设置页用量 tab）已随 UI 清理移除，
      // 保留契约但以稳定错误码快速失败，不发起网络请求。
      throw new Error("coding_plan_unavailable");
    },
    async getCodingPlanResetStatus(
      _request: CodingPlanResetScopeRequest,
    ): Promise<CodingPlanResetStatusSnapshot> {
      return {
        availableFiveHourResets: [],
        availableWeekResets: [],
        latestFiveHourResetHistory: null,
        latestWeekResetHistory: null,
        hasUnreadHistory: false,
      };
    },
    async requestCodingPlanResetOpportunity(
      _request: CodingPlanResetOpportunityRequest,
    ): Promise<CodingPlanResetOpportunityResult> {
      // 无账号即无可领取的重置机会。
      return { granted: false, nextTryAt: null };
    },
    async useCodingPlanReset(
      _request: CodingPlanResetUseRequest,
    ): Promise<CodingPlanResetUseResult> {
      // 无账号即无重置可消耗；契约字面量类型要求 used: true。
      return { used: true };
    },
    async markCodingPlanResetHistoryRead(_request: CodingPlanResetScopeRequest): Promise<void> {
      // 本地无历史记录，空操作。
    },
    async getSnapshot(_request: UsageStatsRequest): Promise<UsageStatsSnapshot> {
      // getSnapshot 仅服务 Coding Plan monitor 链路；网络层摘除后以稳定错误码快速失败。
      throw new Error("coding_plan_unavailable");
    },
    async getEntitlementSnapshot(
      _request: UsageEntitlementRequest = {},
    ): Promise<UsageEntitlementSnapshot> {
      // 无账号体系：恒为「未配置」态。provider/remaining/subscription/quota 全空，
      // UI（设置页状态卡、连接判定）据此呈现未连接，不会触发任何出网。
      return {
        generatedAt: Date.now(),
        authenticated: false,
        unavailableReason: "not_configured",
        provider: null,
        remaining: null,
        subscription: null,
        quota: null,
        mcpQuota: null,
      };
    },
  } satisfies IUsageStatsService;
}
