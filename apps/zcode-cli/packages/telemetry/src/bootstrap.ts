import type {
  AgentTelemetryRuntimeOwner,
  AgentExecutionTelemetryPort,
  ModelApiRuntimeSurface,
  ModelExecutionTelemetryPort,
  TelemetryIdentitySnapshot,
  TelemetryResourceContext,
} from "@zcode/contracts/telemetry";
import type { ModelStatusSink } from "@zcode/contracts/model";
import { NoopAgentExecutionTelemetry } from "./agent-trace-runtime.js";

type EnvRecord = Record<string, string | undefined>;

const TELEMETRY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
let preparedOwner: AgentTelemetryRuntimeOwner | undefined;
const noopExecution = new NoopAgentExecutionTelemetry();

export interface CreateModelTelemetryOptions {
  owner?: AgentTelemetryRuntimeOwner;
  sessionId?: string;
}

export interface ModelTelemetryBootstrap {
  agentExecution: AgentExecutionTelemetryPort;
  enabled: boolean;
  modelExecution: ModelExecutionTelemetryPort;
  statusSink?: ModelStatusSink;
  shutdown(): Promise<void>;
}

export function createModelTelemetry(
  options: CreateModelTelemetryOptions = {},
): ModelTelemetryBootstrap {
  // DWeis Next 不做遥测：OpenTelemetry / OTLP 导出链（模型 trace、agent metrics）
  // 永久关闭，无论 OTEL_EXPORTER_OTLP_* 是否配置都不再初始化 Provider / Exporter。
  // 保留该模块与 noop 返回，是为了不破坏 cli 各调用点的导入契约。
  void options;
  void preparedOwner;
  return {
    agentExecution: noopExecution,
    enabled: false,
    modelExecution: noopExecution,
    async shutdown() {},
  };
}

export interface PrepareModelTelemetryOptions {
  buildCommitId?: string;
  cliVersion?: string;
  onWarning?: (message: string, context: Record<string, unknown>) => void;
  productVersion?: string;
  runtimeDistribution?: TelemetryResourceContext["runtimeDistribution"];
  runtimeSurface?: ModelApiRuntimeSurface;
}

export function resolveOtlpTraceEndpoint(env: EnvRecord): string | undefined {
  const traceEndpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (traceEndpoint) return validHttpUrl(traceEndpoint);
  const commonEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!commonEndpoint) return undefined;
  const valid = validHttpUrl(commonEndpoint);
  if (!valid) return undefined;
  const parsed = new URL(valid);
  parsed.pathname = `${parsed.pathname.replace(/\/$/u, "")}/v1/traces`;
  return parsed.toString();
}

export function resolveOtlpMetricEndpoint(env: EnvRecord): string | undefined {
  const metricEndpoint = env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim();
  if (metricEndpoint) return validHttpUrl(metricEndpoint);
  const commonEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!commonEndpoint) return undefined;
  const valid = validHttpUrl(commonEndpoint);
  if (!valid) return undefined;
  const parsed = new URL(valid);
  parsed.pathname = `${parsed.pathname.replace(/\/$/u, "")}/v1/metrics`;
  return parsed.toString();
}

export function parseOtlpHeaders(value: string | undefined): Record<string, string> | undefined {
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
 * 在 CLI 的异步启动边界准备遥测身份。DWeis Next 永久关闭遥测：不再准备 OTLP 身份、
 * 不加载 OTel SDK（原动态 import 的 otlp-exporter 已随依赖摘除删除），
 * 直接返回原始 env。保留函数是为不破坏 CLI 启动链的导入契约。
 */
export async function prepareModelTelemetryEnv(
  env: EnvRecord,
  options: PrepareModelTelemetryOptions = {},
): Promise<EnvRecord> {
  void options;
  return env;
}

export async function shutdownPreparedModelTelemetry(): Promise<void> {
  await preparedOwner?.shutdown({ timeoutMs: 1_500 });
  preparedOwner = undefined;
}

export function updatePreparedTelemetryIdentity(snapshot: TelemetryIdentitySnapshot): void {
  preparedOwner?.updateIdentity(snapshot);
}

export function normalizeTelemetryDeviceMid(value: string | undefined): string | undefined {
  return normalizeTelemetryId(value);
}

function normalizeTelemetryId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && TELEMETRY_ID_PATTERN.test(normalized) ? normalized : undefined;
}

function validHttpUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
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
