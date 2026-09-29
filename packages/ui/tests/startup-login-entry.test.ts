import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldOpenStartupLoginEntry } from "../src/lib/startupLoginEntry.js";

// 线上顽固故障：启动欢迎页（「前往设置配置模型供应商」）每次启动都出现，
// 即使用户已经配好模型。原判定要求 providerFamilyDomain 非空——那是智谱云
// 登录写入的字段，DWeis Next 摘除登录后它永远是 null，条件恒真。
// 判定收敛为纯函数后在这里锁定语义。
test("已配置可用模型时不再弹欢迎页", () => {
  assert.equal(shouldOpenStartupLoginEntry({ hasUser: false, hasUsableProvider: true }), false);
});

test("无用户且无可用模型时弹欢迎页", () => {
  assert.equal(shouldOpenStartupLoginEntry({ hasUser: false, hasUsableProvider: false }), true);
});

test("已登录用户不弹欢迎页", () => {
  assert.equal(shouldOpenStartupLoginEntry({ hasUser: true, hasUsableProvider: false }), false);
  assert.equal(shouldOpenStartupLoginEntry({ hasUser: true, hasUsableProvider: true }), false);
});
