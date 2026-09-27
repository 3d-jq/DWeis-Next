// DWeis Next 不做遥测：renderer 用户操作 Trace 的 span 构造已移除。
//
// 历史上这里把一条 TTFT 观测记录展开为若干 OTel ReadableSpan。
// 现在 TTFT/Trace 全链路不再导出，且 @opentelemetry/* 依赖已从 package.json 摘除。
// 保留空的 createLocalTtftSpans 导出以免破坏历史 import 形状。

export function createLocalTtftSpans(
  ..._args: unknown[]
): [] {
  // no-op：span 仅用于历史 OTLP 上报。
  return [];
}
