import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionEventType, type SessionEvent } from "@zcode/contracts";
import { mapComputerUseOperationEvent } from "../src/zcode-protocol/computer-use-operation-event.js";
import { resolveBuiltInComputerUseMcpServer } from "../src/app/built-in-computer-use.js";
import { isZCodeCuaStdioServer } from "../src/mcp-config.js";
import { OFFICIAL_CUA_PLUGIN_ID } from "../src/app/official-plugin-definitions.js";

function scheduledEvent(toolName: string, input: unknown = {}): SessionEvent {
  return {
    id: 1,
    sequenceNumber: 1,
    sessionId: "sess-1",
    timestamp: new Date("2026-09-30T00:00:00Z"),
    turnId: "turn-1",
    type: SessionEventType.ToolCallScheduled,
    payload: { toolCallId: "tc-1", toolName, input },
  } as unknown as SessionEvent;
}

test("操作浮层事件：mcp__computer-use__* 工具调用即 CUA 操作", () => {
  const event = mapComputerUseOperationEvent(scheduledEvent("mcp__computer-use__click"));
  assert.equal(event?.computerUse, true);

  const started = mapComputerUseOperationEvent({
    ...scheduledEvent("mcp__computer-use__click"),
  });
  assert.equal(started?.kind, "tool-scheduled");
});

test("操作浮层事件：node_repl 路径仍以 bootstrap 锚点判定；无关工具不误报", () => {
  const withBootstrap = mapComputerUseOperationEvent(
    scheduledEvent("mcp__node_repl__js", {
      code: 'import("x").then(m => m.setupComputerUseRuntime())',
    }),
  );
  assert.equal(withBootstrap?.computerUse, true);

  const browser = mapComputerUseOperationEvent(
    scheduledEvent("mcp__node_repl__js", { code: 'agent.browsers.open("https://example.com")' }),
  );
  assert.equal(browser?.computerUse, undefined);

  const unrelated = mapComputerUseOperationEvent(scheduledEvent("mcp__other__thing"));
  assert.equal(unrelated?.computerUse, undefined);
});

test("built-in computer-use server：插件未启用不注册", () => {
  const none = resolveBuiltInComputerUseMcpServer({
    pluginOutcome: { plugins: [] },
    workingDirectory: "C:/work",
  });
  assert.deepEqual(none, {});

  const disabled = resolveBuiltInComputerUseMcpServer({
    pluginOutcome: {
      plugins: [{ id: OFFICIAL_CUA_PLUGIN_ID, enabled: false, rootPath: "C:/root" } as never],
    },
    workingDirectory: "C:/work",
  });
  assert.deepEqual(disabled, {});
});

test("built-in computer-use server：启用后裸名注册，带驱动标记与现代协议 pin", () => {
  const servers = resolveBuiltInComputerUseMcpServer({
    pluginOutcome: {
      plugins: [{ id: OFFICIAL_CUA_PLUGIN_ID, enabled: true, rootPath: "C:/root" } as never],
    },
    workingDirectory: "C:/work",
  });

  const config = servers["computer-use"];
  assert.ok(config, "必须以裸名 computer-use 注册（工具前缀 mcp__computer-use__*）");
  assert.equal(config.type, "stdio");
  assert.equal(config.protocolVersion, "2026-07-28");
  assert.equal(config.isolation, "workspace");
  assert.equal(config.env?.DWEIS_CUA_DRIVER_SERVER, "1");
  // server 路径指向插件根的 dist/mcp/server.js
  assert.ok(
    (config.args ?? []).some((arg) => String(arg).endsWith("server.js")),
    `args 应包含 server.js：${JSON.stringify(config.args)}`,
  );
});

test("retired 守卫：驱动标记放行；旧形态（裸名/插件 id）仍退役", () => {
  // 驱动型（本 fork 的 built-in 注册形态）：必须放行。
  assert.equal(
    isZCodeCuaStdioServer("computer-use", {
      type: "stdio",
      command: "node",
      args: [],
      env: { DWEIS_CUA_DRIVER_SERVER: "1" },
    }),
    false,
  );
  // 无标记的裸名 stdio（旧装机残留）：仍按上游语义退役。
  assert.equal(
    isZCodeCuaStdioServer("computer-use", { type: "stdio", command: "node", args: [] }),
    true,
  );
  // Helper 形态 official plugin server（权威 plugin id 识别）：仍退役。
  assert.equal(
    isZCodeCuaStdioServer("something-else", {
      type: "stdio",
      command: "node",
      args: [],
      env: { ZCODE_PLUGIN_ID: OFFICIAL_CUA_PLUGIN_ID },
    }),
    true,
  );
  // 非 stdio 不属于该判定。
  assert.equal(isZCodeCuaStdioServer("computer-use", { type: "http", url: "http://x" } as never), false);
});
