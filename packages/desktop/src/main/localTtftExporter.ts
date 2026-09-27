// DWeis Next 不做遥测：TTFT / renderer Trace 链路已整体退化为 no-op。
//
// 这三个文件历史上构成一条本地可观测链路：
//   renderer 上报 batch → localTtftExporter 折算 span → OTLP 导出
//   renderer 用户操作 → rendererActionTraceBroker → rendererActionTraceExporter → OTLP
// 现在导出端点恒不可用，且 @opentelemetry/* 依赖已从 package.json 摘除，
// 因此这里只保留调用方需要的接口形状，不再引用任何 OTel 类型或实现。

/** 历史上由 OTel MeterProvider 提供的 instrument surface。 */
type NoopInstrument = {
  record(..._args: unknown[]): void;
  add(..._args: unknown[]): void;
};

type NoopMeter = {
  createHistogram(_name: string, _init?: unknown): NoopInstrument;
  createCounter(_name: string, _init?: unknown): NoopInstrument;
};

export interface LocalTtftExporter {
  enqueue(input: unknown): void;
  shutdown(): Promise<void>;
}

/**
 * TTFT 导出器。DWeis Next 不做遥测：
 * - 不再构造 MeterProvider / OTLP exporter / Resource；
 * - enqueue 直接返回，本地队列与 span 构造逻辑一并移除。
 */
export function createLocalTtftExporter(_options: {
  env: Record<string, string | undefined>;
  now?: () => number;
  version: string;
  logger: { warn(...args: unknown[]): void };
}): LocalTtftExporter {
  const instrument: NoopInstrument = { record() {}, add() {} };
  const meter: NoopMeter = {
    createHistogram: () => instrument,
    createCounter: () => instrument,
  };
  // 保留 instrument/meter 的构造（供将来本地诊断使用），但不挂任何 reader、不导出。
  void meter;
  return {
    enqueue(_input: unknown): void {
      // no-op：TTFT 样本仅用于历史 OTLP 上报。
    },
    async shutdown(): Promise<void> {
      // no-op
    },
  };
}
