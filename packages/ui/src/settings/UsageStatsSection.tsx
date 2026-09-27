// 用量统计：只保留本地 App 用量，移除 CodingPlan 面板
import { AppUsagePanel } from "@/settings/usage-stats/AppUsagePanel.js";

/**
 * 用量统计的 tab。历史上还有 `codingPlan` / `codingPlan:${sourceId}` 两种，
 * 用于展示 Z.ai / BigModel 订阅套餐的配额与用量。DWeis Next 无账号体系，
 * 已随 CodingPlan 一起移除，只保留本地 App 用量。
 */
export type UsageStatsSectionTab = "app";

export function UsageStatsSection({ activeTab }: { activeTab: UsageStatsSectionTab }) {
  // 只保留 app 一个 tab；其它历史值一律回落，避免旧路由把页面渲染成空白。
  void activeTab;
  return <AppUsagePanel />;
}
