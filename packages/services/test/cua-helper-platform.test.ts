import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldEnableDefaultCuaProductHelper } from "../src/node.js";

// DWeis Next 的 Windows 电脑控制由插件内驱动（@trycua/cua-driver）承担，没有
// Helper 进程：win32 必须从 Helper 启用平台移除，否则 services 会按占位 producer
// 去拉起并不存在的 resources/tools/cua-helper（spawn acquire 每次都失败）。
// macOS 保留既有 Helper 语义（本期不启用驱动）。

test("Windows 不启用 Helper（驱动型引擎旁路）", () => {
  assert.equal(shouldEnableDefaultCuaProductHelper({ platform: "win32", env: {} }), false);
});

test("macOS 在特性开关默认开启时仍启用 Helper", () => {
  assert.equal(shouldEnableDefaultCuaProductHelper({ platform: "darwin", env: {} }), true);
});

test("Linux 不启用 Helper", () => {
  assert.equal(shouldEnableDefaultCuaProductHelper({ platform: "linux", env: {} }), false);
});

test("显式关闭特性开关时任何平台都不启用", () => {
  for (const value of ["0", "false", "off"]) {
    assert.equal(
      shouldEnableDefaultCuaProductHelper({ platform: "darwin", env: { ZCODE_CUA_PRODUCT_HELPER: value } }),
      false,
      `ZCODE_CUA_PRODUCT_HELPER=${value} 应关闭`,
    );
  }
});
