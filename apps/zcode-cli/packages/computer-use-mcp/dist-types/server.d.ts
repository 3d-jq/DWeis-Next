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
import { type CallToolResult, type Tool } from "@modelcontextprotocol/server";
export declare const COMPUTER_USE_SERVER_NAME = "computer-use";
export declare const COMPUTER_USE_SERVER_VERSION = "1.0.0";
/**
 * 服务级 GUIDANCE（对照 dsh 的 `computer-use:cua-driver-native` 系统提示段）。
 * 工具描述本身由上游提供且质量很高，这里只补「循环纪律」这一层上游不负责的内容。
 */
export declare const COMPUTER_USE_SERVER_INSTRUCTIONS: string;
/** 上游 callTool 返回：rawJson 是规范 MCP CallToolResult 的 JSON 字符串。 */
export type UpstreamCallResult = {
    rawJson?: unknown;
    isError?: unknown;
    errorCode?: unknown;
};
export declare function parseCatalog(json: string): Tool[];
/** 把上游 callTool 结果收敛成 MCP CallToolResult；解析失败降级为 isError 文本。 */
export declare function toMcpResult(result: UpstreamCallResult): CallToolResult;
export declare function main(): Promise<void>;
//# sourceMappingURL=server.d.ts.map