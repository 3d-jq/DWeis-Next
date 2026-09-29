import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const BRAND_LEAK = /\bZCode\b/u;

/** 目录文件的行形如 `  "key.path": "用户可见文案",`；只取冒号后的值。 */
function collectCatalogValues(content: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of content.split("\n")) {
    const match = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/u.exec(line);
    if (match) values.set(match[1]!, match[2]!);
  }
  return values;
}

function* walkFiles(dir: string, extension: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkFiles(full, extension);
    } else if (entry.endsWith(extension)) {
      yield full;
    }
  }
}

test("桌面菜单/托盘文案不含 ZCode 品牌残留", () => {
  const content = readFileSync(join(repoRoot, "packages/shared/src/desktopMenu.ts"), "utf8");
  for (const [key, value] of collectCatalogValues(content)) {
    assert.doesNotMatch(value, BRAND_LEAK, `desktopMenu.ts ${key}: ${value}`);
  }
});

test("UI i18n 文案不含 ZCode 品牌残留", () => {
  const localesDir = join(repoRoot, "packages/ui/src/i18n/locales");
  for (const file of readdirSync(localesDir)) {
    if (!file.endsWith(".ts")) continue;
    const content = readFileSync(join(localesDir, file), "utf8");
    for (const [key, value] of collectCatalogValues(content)) {
      assert.doesNotMatch(value, BRAND_LEAK, `ui/i18n/${file} ${key}: ${value}`);
    }
  }
});

test("主进程/渲染进程硬编码的 label/title/tooltip/text/documentTitle 不含 ZCode", () => {
  // 曾漏掉的两处形态：HTML 模板里的文本节点（强更弹窗 brand-title）与
  // text/documentTitle 属性（CUA 操作浮层、权限面板窗口标题）。
  const userVisibleLabel =
    /(?:label|title|tooltip|text|documentTitle)\s*:\s*("[^"\n]*ZCode[^"\n]*"|`[^`\n]*ZCode[^`\n]*`)/gu;
  const htmlTextNode = />\s*ZCode\b[^<]*</gu;
  for (const dir of [
    join(repoRoot, "packages/desktop/src/main"),
    join(repoRoot, "packages/desktop/src/renderer"),
  ]) {
    for (const file of walkFiles(dir, ".ts")) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(userVisibleLabel)) {
        assert.fail(`${file}: 用户可见文案含 ZCode → ${match[1]}`);
      }
    }
    for (const file of walkFiles(dir, ".html")) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(htmlTextNode)) {
        assert.fail(`${file}: HTML 文本节点含 ZCode → ${match[0].trim()}`);
      }
    }
  }
});

test("托盘与关于菜单指向 DWeis Next", () => {
  const content = readFileSync(join(repoRoot, "packages/shared/src/desktopMenu.ts"), "utf8");
  const values = collectCatalogValues(content);
  assert.equal(values.get("tray.tooltip"), "DWeis Next");
  // zh 与 en 共用同一 message id，map 里后者覆盖前者；用正则分别锁两个语言。
  assert.match(content, /"tray\.menu\.openZCode": "(打开|Open) DWeis Next"/u);
  assert.match(content, /"titleBar\.menu\.help\.about": "(关于|About) DWeis Next"/u);
});
