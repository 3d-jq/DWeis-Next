import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const htmlPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/renderer/index.html",
);
const html = readFileSync(htmlPath, "utf8");

// 启动壳原来的 keyframes 带 scale 0.72 → 1.045 → 0.985 → 1.008 的过冲和回弹，
// 图标会先跳一下再静止，观感上是两段动画。这里锁死「不做缩放」，只允许淡入。
test("启动 logo 不做缩放/回弹，只淡入", () => {
  assert.doesNotMatch(html, /transform:\s*scale/u);
  assert.doesNotMatch(html, /startup-logo-pop/u);
  assert.match(html, /@keyframes startup-logo-fade/u);
  assert.match(html, /animation:\s*startup-logo-fade\s+0\.2s/u);
});

test("启动壳仍由 animationend 驱动移除", () => {
  // 删动画不能顺手删掉收尾逻辑，否则 HTML loading 会一直盖在界面上。
  assert.match(html, /startupLogoShell\.addEventListener\("animationend"/u);
  assert.match(html, /zcode-startup-ready/u);
});

test("启动壳保留主题双形态的两张标志图", () => {
  assert.match(html, /class="startup-logo startup-logo-mark-for-light"/u);
  assert.match(html, /class="startup-logo startup-logo-mark-for-dark"/u);
  assert.equal((html.match(/data:image\/png;base64,/gu) ?? []).length, 2);
});
