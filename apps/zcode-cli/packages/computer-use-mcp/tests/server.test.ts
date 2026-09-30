import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalog, toMcpResult } from "../src/server.js";

const validTool = (name: string) => ({
  name,
  description: `tool ${name}`,
  inputSchema: { type: "object", properties: {} },
});

test("parseCatalog：合法目录按上游原样透传并收敛 MCP 字段", () => {
  const tools = parseCatalog(
    JSON.stringify([
      { ...validTool("click"), annotations: { destructiveHint: true }, capabilities: ["x"], risk: "high" },
      validTool("list_apps"),
    ]),
  );

  assert.equal(tools.length, 2);
  assert.equal(tools[0].name, "click");
  // annotations 保留（客户端据此判断破坏性）；上游私有字段（capabilities/risk）被剥离。
  assert.deepEqual(tools[0].annotations, { destructiveHint: true });
  assert.equal("capabilities" in tools[0], false);
  assert.equal("risk" in tools[0], false);
});

test("parseCatalog：兼容 {tools: [...]} 包装形态", () => {
  const tools = parseCatalog(JSON.stringify({ tools: [validTool("click")] }));
  assert.equal(tools.length, 1);
});

test("parseCatalog：非法名/重名/坏 schema/空目录都必须抛错（启动即失败，不留半套工具）", () => {
  assert.throws(() => parseCatalog(JSON.stringify([validTool("bad name!")])), /不合法/u);
  assert.throws(
    () => parseCatalog(JSON.stringify([validTool("click"), validTool("click")])),
    /重名/u,
  );
  assert.throws(
    () =>
      parseCatalog(
        JSON.stringify([{ name: "x", description: "d", inputSchema: { type: "string" } }]),
      ),
    /inputSchema/u,
  );
  assert.throws(() => parseCatalog(JSON.stringify([])), /为空/u);
  assert.throws(() => parseCatalog("not json"), SyntaxError);
});

test("toMcpResult：rawJson 是规范 CallToolResult，直接透传", () => {
  const raw = JSON.stringify({
    content: [{ type: "text", text: "ok" }],
    structuredContent: { width: 1707 },
  });
  const result = toMcpResult({ rawJson: raw });

  assert.deepEqual(result.content, [{ type: "text", text: "ok" }]);
  assert.deepEqual(result.structuredContent, { width: 1707 });
  assert.equal(result.isError, undefined);
});

test("toMcpResult：两层 isError 任一为真即判定失败", () => {
  const raw = JSON.stringify({ content: [{ type: "text", text: "boom" }] });
  assert.equal(toMcpResult({ rawJson: raw, isError: true }).isError, true);
  assert.equal(
    toMcpResult({ rawJson: JSON.stringify({ content: [], isError: true }) }).isError,
    true,
  );
  assert.equal(toMcpResult({ rawJson: raw }).isError, undefined);
});

test("toMcpResult：不可解析时降级为 isError 文本（保留原始输出供排障）", () => {
  const result = toMcpResult({ rawJson: "<<not json>>" });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].type, "text");
  assert.match(String(result.content[0].text), /not json/u);

  const missing = toMcpResult({ errorCode: "E_X" });
  assert.equal(missing.isError, true);
  assert.match(String(missing.content[0].text), /E_X/u);
});
