import { test } from "node:test";
import assert from "node:assert/strict";
import { getZCodeCopy, SUPPORTED_LOCALES } from "../src/index.js";

const ZCODE_IN_COPY = /\bZCode\b/u;

function collectStrings(value: unknown, path: string, sink: Map<string, string>): void {
  if (typeof value === "string") {
    sink.set(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, sink));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(child, `${path}.${key}`, sink);
    }
  }
}

// 品牌隔离：用户在 CLI/TUI 里读到的每一句文案都不能再出现 ZCode。这里是全量
// 遍历而不是抽查，漏改一句都会被这条测试拦住。
for (const locale of SUPPORTED_LOCALES) {
  test(`${locale} 文案不含 ZCode 品牌残留`, () => {
    const strings = new Map<string, string>();
    collectStrings(getZCodeCopy(locale), locale, strings);

    assert.ok(strings.size > 0, "文案目录不应为空");
    for (const [path, value] of strings) {
      assert.doesNotMatch(value, ZCODE_IN_COPY, `${path}: ${value}`);
    }
  });
}

test("CLI 帮助文案指向 dweis 命令", () => {
  const zh = getZCodeCopy("zh-CN").cli.help("0.0.0-test");
  assert.match(zh, /^dweis 0\.0\.0-test$/mu);
  assert.match(zh, /^\s+dweis \[command\] \[options\]$/mu);
  assert.match(zh, /不传 command 时，dweis 会打开全屏 TUI。/u);
  assert.match(zh, /app-server 运行 DWeis Next Protocol stdio app server/u);

  const en = getZCodeCopy("en-US").cli.help("0.0.0-test");
  assert.match(en, /^dweis 0\.0\.0-test$/mu);
  assert.match(en, /^\s+dweis \[command\] \[options\]$/mu);
  assert.match(en, /With no command, dweis opens the full-screen TUI\./u);
  assert.match(en, /app-server Run the DWeis Next Protocol stdio app server/u);
});
