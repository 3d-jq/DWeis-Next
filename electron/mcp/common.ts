import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

/** MCP server 传输类型：stdio（本地进程）/ http（Streamable HTTP）/ sse（SSE）。 */
export type McpTransportType = "stdio" | "http" | "sse"

/** 设置界面维护的 MCP server 条目（非凭证字段）。 */
export interface McpServerEntry {
  id: string
  name: string
  type: McpTransportType
  /** stdio：可执行文件路径。 */
  command?: string
  /** stdio：参数（空格分隔）。 */
  args?: string
  /** stdio：工作目录（相对路径基于 workspace）。 */
  cwd?: string
  /** stdio：环境变量。 */
  environment?: Record<string, string>
  /** http/sse：服务地址。 */
  url?: string
  /** http/sse：请求头。 */
  headers?: Record<string, string>
  /** 请求超时（毫秒）。 */
  timeout?: number
  enabled: boolean
}

/** 校验未知值是否为合法传输类型；旧数据 local/remote 迁移到新类型。 */
export function normalizeMcpTransportType(value: unknown): McpTransportType | null {
  if (value === "stdio" || value === "http" || value === "sse") {
    return value
  }
  if (value === "local") return "stdio"
  if (value === "remote") return "http"
  return null
}

/** 旧数据迁移：local→stdio、remote→http，补缺省字段。 */
export function normalizeMcpServerEntry(value: unknown): McpServerEntry | null {
  if (!value || typeof value !== "object") return null
  const entry = value as Record<string, unknown>
  const type = normalizeMcpTransportType(entry.type)
  if (typeof entry.id !== "string" || typeof entry.name !== "string" || !type) {
    return null
  }
  return {
    id: entry.id,
    name: entry.name,
    type,
    ...(typeof entry.command === "string" && entry.command ? { command: entry.command } : {}),
    ...(typeof entry.args === "string" && entry.args ? { args: entry.args } : {}),
    ...(typeof entry.cwd === "string" && entry.cwd ? { cwd: entry.cwd } : {}),
    ...(isStringRecord(entry.environment) ? { environment: entry.environment } : {}),
    ...(typeof entry.url === "string" && entry.url ? { url: entry.url } : {}),
    ...(isStringRecord(entry.headers) ? { headers: entry.headers } : {}),
    ...(typeof entry.timeout === "number" && entry.timeout > 0 ? { timeout: entry.timeout } : {}),
    enabled: entry.enabled === true,
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((item) => typeof item === "string")
}

// ── 表单模型 ↔ opencode 原生配置转换（JSON 编辑模式共用）──

interface OpencodeLocalConfig {
  type: "local"
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

interface OpencodeRemoteConfig {
  type: "remote"
  url: string
  headers?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export type OpencodeMcpConfig = OpencodeLocalConfig | OpencodeRemoteConfig

/** 表单条目 → opencode 原生配置（stdio→local；http/sse→remote，opencode 连接时自动探测传输）。 */
export function toOpencodeMcpConfig(server: McpServerEntry): OpencodeMcpConfig {
  if (server.type === "stdio") {
    const config: OpencodeLocalConfig = {
      type: "local",
      command: [server.command ?? "", ...(server.args ? server.args.split(/\s+/) : [])].filter(Boolean),
    }
    if (server.cwd) config.cwd = server.cwd
    if (server.environment && Object.keys(server.environment).length > 0) {
      config.environment = server.environment
    }
    if (server.timeout) config.timeout = server.timeout
    if (!server.enabled) config.enabled = false
    return config
  }
  const config: OpencodeRemoteConfig = { type: "remote", url: server.url ?? "" }
  if (server.headers && Object.keys(server.headers).length > 0) {
    config.headers = server.headers
  }
  if (server.timeout) config.timeout = server.timeout
  if (!server.enabled) config.enabled = false
  return config
}

/** opencode 原生配置 → 表单条目（remote 按 URL 启发式区分 http/sse）。 */
export function fromOpencodeMcpConfig(name: string, config: OpencodeMcpConfig): McpServerEntry | null {
  if (config.type === "local") {
    const [command, ...rest] = config.command
    if (!command) return null
    return {
      id: `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: "stdio",
      command,
      ...(rest.length > 0 ? { args: rest.join(" ") } : {}),
      ...(config.cwd ? { cwd: config.cwd } : {}),
      ...(config.environment && Object.keys(config.environment).length > 0 ? { environment: config.environment } : {}),
      ...(config.timeout ? { timeout: config.timeout } : {}),
      enabled: config.enabled !== false,
    }
  }
  if (!config.url) return null
  return {
    id: `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: inferRemoteTransport(config.url),
    url: config.url,
    ...(config.headers && Object.keys(config.headers).length > 0 ? { headers: config.headers } : {}),
    ...(config.timeout ? { timeout: config.timeout } : {}),
    enabled: config.enabled !== false,
  }
}

/** SSE 地址常见 /sse 或 .sse 结尾；其余按 Streamable HTTP 处理。 */
function inferRemoteTransport(url: string): McpTransportType {
  const normalized = url.trim().toLowerCase()
  return normalized.endsWith("/sse") || normalized.endsWith(".sse") ? "sse" : "http"
}

/** 表单条目 → JSON 编辑模式文本（opencode 原生配置）。 */
export function mcpEntryToJson(server: McpServerEntry): string {
  return JSON.stringify(toOpencodeMcpConfig(server), null, 2)
}

/**
 * JSON 编辑模式文本 → 表单条目；非法 JSON / 缺字段返回 null。
 * 兼容多种生态格式：
 * - opencode：{type:"local", command:[...]} / {type:"remote", url}
 * - Cursor / Claude Code：{type:"stdio", command, args:[...], env:{}} /
 *   {type:"http"|"streamablehttp"|"sse", url, headers:{}}
 * - 外层 {"mcpServers": {name: config}} 包裹（取第一个服务）。
 */
export function mcpEntryFromJson(name: string, text: string): McpServerEntry | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") {
    return null
  }
  const record = parsed as Record<string, unknown>
  if (record.mcpServers && typeof record.mcpServers === "object" && !Array.isArray(record.mcpServers)) {
    const servers = Object.entries(record.mcpServers as Record<string, unknown>)
    if (servers.length === 0) {
      return null
    }
    const [serverName, config] = servers[0]
    return parseSingleMcpConfig(serverName, config)
  }
  return parseSingleMcpConfig(name, parsed)
}

function parseSingleMcpConfig(name: string, config: unknown): McpServerEntry | null {
  if (!config || typeof config !== "object") {
    return null
  }
  const record = config as Record<string, unknown>
  const type = record.type

  // stdio 系：opencode local（command 数组）/ Cursor stdio（command 字符串 + args 数组）
  if (type === "stdio" || type === "local") {
    let command: string | null = null
    let args: string[] = []
    if (typeof record.command === "string") {
      command = record.command
    } else if (Array.isArray(record.command)) {
      const parts = record.command.filter((part): part is string => typeof part === "string")
      ;[command, ...args] = parts
    }
    if (!command) {
      return null
    }
    if (Array.isArray(record.args)) {
      args = [...args, ...record.args.filter((part): part is string => typeof part === "string")]
    }
    const environment = isStringRecord(record.env)
      ? record.env
      : isStringRecord(record.environment)
        ? record.environment
        : undefined
    return {
      id: newMcpId(),
      name,
      type: "stdio",
      command,
      ...(args.length > 0 ? { args: args.join(" ") } : {}),
      ...(typeof record.cwd === "string" && record.cwd ? { cwd: record.cwd } : {}),
      ...(environment && Object.keys(environment).length > 0 ? { environment } : {}),
      ...(typeof record.timeout === "number" && record.timeout > 0 ? { timeout: record.timeout } : {}),
      enabled: record.enabled !== false,
    }
  }

  // remote 系：opencode remote / Cursor http、streamablehttp、sse
  if (type === "remote" || type === "http" || type === "streamablehttp" || type === "sse") {
    if (typeof record.url !== "string" || !record.url) {
      return null
    }
    const transport: McpTransportType =
      type === "sse" ? "sse" : type === "remote" ? inferRemoteTransport(record.url) : "http"
    const headers = isStringRecord(record.headers) ? record.headers : undefined
    return {
      id: newMcpId(),
      name,
      type: transport,
      url: record.url,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      ...(typeof record.timeout === "number" && record.timeout > 0 ? { timeout: record.timeout } : {}),
      enabled: record.enabled !== false,
    }
  }
  return null
}

function newMcpId(): string {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── key=value 行编辑（环境变量 / 请求头）──

/** "KEY=VALUE" 每行一条的文本 → 记录（空行/非法行忽略）。 */
export function parseKeyValueLines(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf("=")
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    if (!key) continue
    result[key] = trimmed.slice(separator + 1).trim()
  }
  return result
}

/** 记录 → "KEY=VALUE" 每行一条的文本。 */
export function stringifyKeyValueLines(record: Record<string, string> | undefined): string {
  if (!record) return ""
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

export interface PersistedMcpServers {
  servers: McpServerEntry[]
}

export type McpService = typeof McpService
export const McpService = serviceName("mcp-service") as ServiceName<{
  ServerEvents: {
    mcpServersChanged: McpServerEntry[]
  }
  ClientInvokes: {
    listMcpServers(): Promise<McpServerEntry[]>
    saveMcpServer(server: McpServerEntry): Promise<McpServerEntry[]>
    deleteMcpServer(id: string): Promise<McpServerEntry[]>
  }
}>
