import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const htmlPath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/renderer/index.html");
const html = readFileSync(htmlPath, "utf8");

// 启动画面契约：只有「主题底色 + 图标」一个画面。
// 以前的两段来自 (1) html/body/#loading 无背景色 → 暗色模式先闪白帧；
// (2) 图标淡入/跳动动画。两条都必须锁死。
test("首帧前按主题上底色，暗色不闪白", () => {
  // head 里在样式前同步判定主题（首帧前执行）
  const headScript = html.slice(0, html.indexOf("<style>"));
  assert.match(headScript, /localStorage\.getItem\("dweis-theme"\)/u);
  assert.match(headScript, /startup-on-dark/u);
  assert.match(headScript, /prefers-color-scheme/u);

  // 底色走 CSS 变量，html/body 与遮罩都用它
  assert.match(html, /--startup-bg:\s*#ffffff/u);
  assert.match(html, /html\.startup-on-dark\s*\{[^}]*--startup-bg:\s*#0b0d0e/u);
  assert.match(html, /background:\s*var\(--startup-bg\)/u);
});

test("启动壳不再有任何动画（淡入/跳动都不允许）", () => {
  const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  assert.doesNotMatch(style, /animation:/u);
  assert.doesNotMatch(style, /@keyframes/u);
  assert.doesNotMatch(style, /transform:\s*scale/u);
  assert.doesNotMatch(style, /opacity:\s*0;\s*\n\s*animation/u);
});

test("启动壳仍由 React 就绪事件驱动收尾", () => {
  assert.match(html, /zcode-react-startup-ready/u);
  // 事件丢失的兜底不能删，否则可能永久停在遮罩上
  assert.match(html, /setTimeout\(markReactReady,\s*3000\)/u);
  assert.match(html, /zcode-startup-ready/u);
});

test("启动壳保留主题双形态的两张标志图", () => {
  assert.match(html, /startup-logo-mark-for-light/u);
  assert.match(html, /startup-logo-mark-for-dark/u);
  assert.equal((html.match(/data:image\/png;base64,/gu) ?? []).length, 2);
});
