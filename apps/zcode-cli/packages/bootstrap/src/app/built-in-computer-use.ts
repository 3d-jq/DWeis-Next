import type { McpServerConfig, PluginLoadOutcome } from "@zcode/contracts";
import { createBundledMcpRuntimeConfig } from "./official-plugin-runtime.js";
import { OFFICIAL_CUA_PLUGIN_ID } from "./official-plugin-definitions.js";

export const BUILT_IN_COMPUTER_USE_SERVER_NAME = "computer-use";

/**
 * DWeis Next 驱动型电脑控制 server 的标记 env。
 *
 * 存在于两处、目的同一个：让 mcp-config 的 retired 守卫识别「这是 @trycua 引擎的
 * 新形态 server，不是上游已退役的 Helper 形态」（守卫对名为 computer-use 的 stdio
 * server 一票否决，见 isZCodeCuaStdioServer）。built-in 注册在下面显式写入；
 * manifest 形态若未来启用则由 writeOfficialPluginRuntimeManifest 保留 env 字段。
 */
export const DWEIS_CUA_DRIVER_SERVER_ENV_KEY = "DWEIS_CUA_DRIVER_SERVER";

/**
 * computer-use 是裸名 built-in server（与 node_repl 同一注册面），而不是插件
 * manifest mcpServers：插件形态会被 toNamespacedServerName 改写成
 * `plugin:computer-use:computer-use`，工具前缀就不再命中操作浮层事件与
 * cua-app-snapshot 既有的 `mcp__computer-use__*` 约定。
 *
 * 启用门控 = 插件 enabled（设置页开关的落盘结果）；server.js 与驱动闭包来自
 * 插件 seed 缓存根。生命周期失败语义交给 server 进程本身：启动失败退出非零，
 * MCP 客户端按断开处理，不留半套工具。
 */
export function resolveBuiltInComputerUseMcpServer(input: {
  pluginOutcome: Pick<PluginLoadOutcome, "plugins">;
  workingDirectory: string;
}): Record<string, McpServerConfig> {
  const cuaPackage = input.pluginOutcome.plugins.find(
    (plugin) => plugin.id === OFFICIAL_CUA_PLUGIN_ID && plugin.enabled,
  );
  if (!cuaPackage) return {};

  const computerUse = createBundledMcpRuntimeConfig({
    cwd: input.workingDirectory,
    env: { [DWEIS_CUA_DRIVER_SERVER_ENV_KEY]: "1" },
    rootPath: cuaPackage.rootPath,
    // 截图/窗口状态类调用在繁忙桌面上秒级完成；60s 与 dsh 的 toolCallTimeout 默认一致。
    timeoutMs: 60_000,
  });
  if (!computerUse) return {};

  return {
    [BUILT_IN_COMPUTER_USE_SERVER_NAME]: {
      ...computerUse,
      // 每个工作区一个 server 实例：同工作区会话共享驱动，跨工作区互不干扰。
      isolation: "workspace",
      // server 只服务 2026-07-28 现代协议（SDK v2 默认）；显式 pin 让客户端跳过
      // legacy 探测——否则默认 legacy 协商会以 Unsupported protocol version 失败。
      protocolVersion: "2026-07-28",
    },
  };
}
