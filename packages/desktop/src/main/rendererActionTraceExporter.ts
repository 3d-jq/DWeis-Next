
type EnvRecord = Record<string, string | undefined>;

/**
 * SpanExporter 形状（DWeis Next 不再依赖 @opentelemetry/sdk-trace-base）。
 */
type SpanExporterLike = {
  export(spans: unknown[], callback?: (result: { code?: number }) => void): void;
  shutdown(): Promise<void>;
};

export function parseRendererActionTraceHeaders(
  value: string | undefined,
): Record<string, string> | undefined {
  if (!value?.trim()) return undefined;
  const headers: Record<string, string> = {};
  for (const pair of value.split(",")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const key = safeDecode(pair.slice(0, separator).trim());
    const headerValue = safeDecode(pair.slice(separator + 1).trim());
    if (key && headerValue) headers[key] = headerValue;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * DWeis Next 不做遥测：renderer 用户操作 Trace 不再导出到 OTLP。
 * 恒返回 undefined（即"未配置 exporter"），调用方会把 Trace 只留在本地链路。
 */
export function createRendererActionTraceExporter(_env: EnvRecord): SpanExporterLike | undefined {
  return undefined;
}

export function validHttpUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
