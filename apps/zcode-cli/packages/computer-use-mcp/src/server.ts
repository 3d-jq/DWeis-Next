/**
 * DWeis Next 电脑控制 MCP server。
 *
 * 架构取舍（Phase 0 探针实证，详见 docs/specs/computer-use.md）：
 * - 引擎 = @trycua/cua-driver（MIT，npm 平台二进制），进程内嵌在本 server 进程，
 *   经 official-plugin-runtime 的 `__zcode-plugin-host` 以 stdio 形式挂进 agent——
 *   与 dsh 的 cua-driver-native 同构：工具目录由上游 listToolsJson() 动态决定，
 *   描述与 JSON schema 原样透传，不手写工具清单。
 * - 与 zcode 原 Helper/broker 链路无关：不读 broker socket、不拉 Helper，
 *   Windows 上无权限门槛（探针实测 UIA available、无需提权）。
 * - 生命周期契约对照 dsh native 提供方：启动任一步失败即整体失败（进程退出非零
 *   = 天然回滚，不留半套工具）；关闭顺序 abort → 等 in-flight 结算 → shutdown →
 *   uniffiDestroy。注意上游 `shutdown({})` 会因 optional-chain 写法抛错，必须无参调用。
 */
import { Server, type CallToolResult, type Tool } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { CuaDriver } from "@trycua/cua-driver";
import { pathToFileURL } from "node:url";

/** 上游 create() 的返回接口；uniffiDestroy 只在具体类上、不在该接口里，见 destroyDriver。 */
type TryCuaDriver = ReturnType<typeof CuaDriver.create>;

export const COMPUTER_USE_SERVER_NAME = "computer-use";
export const COMPUTER_USE_SERVER_VERSION = "1.0.0";

/**
 * 服务级 GUIDANCE（对照 dsh 的 `computer-use:cua-driver-native` 系统提示段）。
 * 工具描述本身由上游提供且质量很高，这里只补「循环纪律」这一层上游不负责的内容。
 */
export const COMPUTER_USE_SERVER_INSTRUCTIONS = [
  "Computer use (DWeis Next): you observe and operate the local desktop through the tools in this server.",
  "Always work in an observe → act → observe loop: read the current state first (get_desktop_state / get_window_state / list_apps), perform exactly one action, then verify the result before the next action.",
  "Prefer element tokens / element_index over raw pixel coordinates whenever the target tool supports them; coordinates are physical pixels of the target display.",
  "If an action fails or behaves unexpectedly, call check_permissions (prompt=false) and report its output verbatim before retrying with a different strategy.",
  "Do not spam repeated identical actions; if two attempts fail, stop and describe what you observed so the user can intervene.",
  "Screenshots and window images arrive as image content blocks and require a vision-capable model to be useful.",
].join(" ");

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SHUTDOWN_SETTLE_TIMEOUT_MS = 5_000;

/** 上游 listToolsJson 的单条形态（Phase 0 探针实测字段）。 */
type UpstreamToolEntry = {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
};

/** 上游 callTool 返回：rawJson 是规范 MCP CallToolResult 的 JSON 字符串。 */
export type UpstreamCallResult = {
  rawJson?: unknown;
  isError?: unknown;
  errorCode?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 把上游工具条目收敛成 MCP tools/list 允许的字段白名单。
 * 上游还带 capabilities/risk 等私有字段，直接透传可能被严格的客户端 schema 拒绝。
 * 返回 null 表示条目不合法——目录里出现脏条目应当让启动失败，而不是静默少一个工具。
 */
function normalizeTool(entry: UpstreamToolEntry): Tool {
  const name = typeof entry.name === "string" ? entry.name : "";
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new Error(`computer-use 工具名不合法：${JSON.stringify(entry.name)}`);
  }
  const inputSchema = asRecord(entry.inputSchema);
  if (inputSchema.type !== "object") {
    throw new Error(`computer-use 工具 ${name} 的 inputSchema 不是 object`);
  }
  return {
    name,
    description:
      typeof entry.description === "string" && entry.description.length > 0
        ? entry.description
        : `computer-use tool ${name}`,
    inputSchema,
    ...(asRecord(entry.outputSchema).type === "object"
      ? { outputSchema: asRecord(entry.outputSchema) }
      : {}),
    ...(typeof entry.annotations === "object" && entry.annotations !== null
      ? { annotations: asRecord(entry.annotations) }
      : {}),
  } as Tool;
}

export function parseCatalog(json: string): Tool[] {
  const parsed: unknown = JSON.parse(json);
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(asRecord(parsed).tools)
      ? (asRecord(parsed).tools as UpstreamToolEntry[])
      : null;
  if (entries === null) {
    throw new Error("computer-use 工具目录不是数组形态");
  }
  const tools = entries.map(normalizeTool);
  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.name)) {
      throw new Error(`computer-use 工具重名：${tool.name}`);
    }
    names.add(tool.name);
  }
  if (tools.length === 0) {
    throw new Error("computer-use 工具目录为空");
  }
  return tools;
}

/** 把上游 callTool 结果收敛成 MCP CallToolResult；解析失败降级为 isError 文本。 */
export function toMcpResult(result: UpstreamCallResult): CallToolResult {
  type ContentBlock = CallToolResult["content"][number];
  let parsed: Record<string, unknown> | null = null;
  if (typeof result.rawJson === "string") {
    try {
      const value: unknown = JSON.parse(result.rawJson);
      parsed = asRecord(value);
    } catch {
      parsed = null;
    }
  }
  const upstreamIsError = result.isError === true;
  if (parsed === null || !Array.isArray(parsed.content)) {
    const fallback =
      typeof result.rawJson === "string"
        ? result.rawJson.slice(0, 2000)
        : `computer-use 工具返回不可解析（errorCode=${String(result.errorCode)}）`;
    return {
      content: [{ type: "text", text: fallback }],
      ...(upstreamIsError || parsed === null ? { isError: true } : {}),
    };
  }
  const structuredContent = asRecord(parsed.structuredContent);
  return {
    content: parsed.content as ContentBlock[],
    // 上游 isError 在 rawJson 与结果对象两层都可能出现，任一为真即判定失败。
    ...(parsed.isError === true || upstreamIsError ? { isError: true } : {}),
    ...(Object.keys(structuredContent).length > 0 ? { structuredContent } : {}),
  };
}

export async function main(): Promise<void> {
  const lifetime = new AbortController();
  const pending = new Set<Promise<unknown>>();
  let shutdownStarted = false;

  // 启动失败回滚：目录解析前不注册任何工具；此处抛错会向上传播，
  // plugin-host 进程退出非零，MCP 客户端按启动失败处理，不留半套工具面。
  const driver = CuaDriver.create(undefined);
  let tools: Tool[];
  try {
    const catalogJson = await driver.listToolsJson({ signal: lifetime.signal });
    tools = parseCatalog(catalogJson);
  } catch (error) {
    await safeDriverShutdown(driver);
    throw error;
  }

  const server = new Server(
    { name: COMPUTER_USE_SERVER_NAME, version: COMPUTER_USE_SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: COMPUTER_USE_SERVER_INSTRUCTIONS },
  );
  const knownToolNames = new Set(tools.map((tool) => tool.name));

  server.setRequestHandler("tools/list", async () => ({ tools }));
  server.setRequestHandler("tools/call", async (request, extra) => {
    const name = request.params.name;
    if (!knownToolNames.has(name)) {
      return {
        content: [{ type: "text" as const, text: `Unknown computer-use tool: ${name}` }],
        isError: true,
      };
    }
    const signal = AbortSignal.any([lifetime.signal, extra.mcpReq.signal]);
    const callPromise = (async () => {
      try {
        const result = await driver.callTool(
          name,
          JSON.stringify(request.params.arguments ?? {}),
          { signal },
        );
        return toMcpResult(result);
      } catch (error) {
        if (lifetime.signal.aborted) {
          return {
            content: [{ type: "text" as const, text: "computer-use server is shutting down" }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `computer-use tool failed: ${errorMessage(error)}` }],
          isError: true,
        };
      }
    })();
    pending.add(callPromise);
    void callPromise.finally(() => pending.delete(callPromise));
    return callPromise;
  });

  const handle = serveStdio(() => server, { legacy: "reject" });

  const shutdown = async (): Promise<void> => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    // dsh 关闭顺序：abort lifetime → 等 in-flight 结算 → shutdown → uniffiDestroy。
    lifetime.abort();
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_SETTLE_TIMEOUT_MS)),
    ]);
    await safeDriverShutdown(driver);
    await handle.close().catch(() => undefined);
    process.exit(0);
  };

  // 父进程（plugin-host / MCP 客户端）关闭管道时收尾；serveStdio 自身也监听 stdin，
  // 这里只保证驱动被释放，幂等标记防止双重退出。
  process.stdin.on("end", () => void shutdown());
  process.stdin.on("close", () => void shutdown());
}

async function safeDriverShutdown(driver: TryCuaDriver): Promise<void> {
  try {
    // 上游 shutdown 对 optional-chain 的写法导致 `shutdown({})` 会抛错，必须无参调用。
    await driver.shutdown();
  } catch {
    // 关闭失败不阻塞进程退出；uniffiDestroy 仍尝试执行。
  }
  try {
    // uniffiDestroy 只在上游具体类上、不在 create() 的接口类型里，故收窄访问。
    (driver as { uniffiDestroy?: () => void }).uniffiDestroy?.();
  } catch {
    // 同上：native 已不可达时忽略。
  }
}

// 直接执行（node dist/mcp/server.js，手动冒烟/排障）时自动启动；经 plugin-host
// 加载时由 host 显式调用 main()，argv[1] 是 CLI 入口、不会命中此分支。
// NODE_TEST_CONTEXT/execArgv 检查：单测会把本模块打进测试产物，届时 argv[1] 与
// import.meta.url 同为测试产物自身，误判会把 serveStdio/驱动挂进测试进程导致挂死。
const runningUnderTest =
  process.env.NODE_TEST_CONTEXT !== undefined ||
  process.execArgv.some((arg) => arg.includes("--test"));
const entryPath = process.argv[1];
if (!runningUnderTest && entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error) => {
    process.stderr.write(`[computer-use-mcp] ${errorMessage(error)}\n`);
    process.exit(1);
  });
}
