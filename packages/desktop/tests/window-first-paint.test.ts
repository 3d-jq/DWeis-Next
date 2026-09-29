import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDesktopWindowVisualOptions } from "../src/main/desktopWindowChrome.js";

// 复现过的观感故障：Windows 主窗口创建即显示（Electron 默认 show:true），
// 页面首帧还没画，用户先看到透明/亚克力材质的原生窗口，暗色模式下是
// 「闪一段桌面底色 → 暗色图标」两段。窗口必须先隐藏、首帧完成后再 show。
test("Windows 主窗口先隐藏，等首帧后再显示", () => {
  const options = buildDesktopWindowVisualOptions();

  assert.equal(options.show, false, "win32 必须以 show:false 创建");
  assert.equal(options.paintWhenInitiallyHidden, true, "隐藏期必须继续绘制首帧");
  // 透明底保留；acrylic 不能在创建时设置（show:false + acrylic 显示时渲染成
  // 不透明白底），材质改在 show 之后补设——见 desktopWindowLifecycle dom-ready。
  assert.equal(options.backgroundColor, "#00000000");
  assert.equal(options.backgroundMaterial, undefined);
});
