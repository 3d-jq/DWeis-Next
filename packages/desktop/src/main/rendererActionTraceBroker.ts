// DWeis Next 不做遥测：renderer 用户操作 Trace 的 broker 已退化为 no-op。
//
// 历史上该 broker 把 renderer 上报的操作批次折算成 span，交给
// rendererActionTraceExporter 导出到 OTLP。现在导出端点恒不可用，
// 且 @opentelemetry/* 依赖已从 package.json 摘除。
//
// 这里只保留调用方（index.ts / rendererActionTraceIpc.ts）需要的接口形状：
//   enqueue(batch): boolean   —— 恒返回 false（未入队）
//   flush(): Promise<void>    —— 直接 resolve
//   shutdown(): Promise<void> —— 直接 resolve

export interface RendererActionTraceBroker {
  enqueue(batch: unknown): boolean;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export function createRendererActionTraceBroker(_options: {
  exporter: unknown;
  logger: {
    debug(...args: unknown[]): void;
    warn(...args: unknown[]): void;
  };
  shutdownTimeoutMs?: number;
  flushTimeoutMs?: number;
  exportTimeoutMs?: number;
}): RendererActionTraceBroker {
  return {
    // no-op：renderer 操作 Trace 仅用于历史 OTLP 上报。
    enqueue(_batch: unknown): boolean {
      return false;
    },
    async flush(): Promise<void> {
      // no-op
    },
    async shutdown(): Promise<void> {
      // no-op
    },
  };
}
