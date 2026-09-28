import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveZCodeBuiltinProviderConfigFilePath } from "../src/main/desktopProviderConfig.js";
import { join } from "node:path";

const BUILTIN_CONFIG_PACKAGED_PATH = "config/provider/zcode-builtin.json";

test("打包态只认随包 resources 下的内置配置", () => {
  const resolved = resolveZCodeBuiltinProviderConfigFilePath({
    isPackaged: true,
    resourcesPath: "D:/apps/DWeis Next/resources",
  });

  assert.equal(resolved, join("D:/apps/DWeis Next/resources", BUILTIN_CONFIG_PACKAGED_PATH));
});

test("开发态只认仓库 config/provider 目录", () => {
  const resolved = resolveZCodeBuiltinProviderConfigFilePath({
    isPackaged: false,
    appPath: "D:/program/ZCode/packages/desktop",
  });

  assert.equal(
    resolved,
    join("D:/program/ZCode/packages/desktop", "../../config/provider", "zcode-builtin.json"),
  );
});

test("解析器不再接受任何外部路径输入", () => {
  // 契约本身不接外部路径：这台机器上真实存在的 ZCode 注入变量，以及 DWeis 自己
  // 命名空间下的同名变量，都不能改变解析结果。
  const polluted = "D:/zcode_workspace/.zcode/v2/runtime/provider/active.json";
  // 签名里已经没有 env/override 口子；这里用运行时对象再确认一次：即使调用方硬塞
  // 一个 env（旧 ZCode 变量名或 DWeis 新变量名），解析结果也不变。
  const withEnv = {
    isPackaged: true,
    resourcesPath: "D:/apps/DWeis Next/resources",
    env: {
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: polluted,
      DWEIS_BUILTIN_PROVIDER_CONFIG_FILE: polluted,
      DWEIS_PERSONAL_PROVIDER_CONFIG_FILE: polluted,
    },
  } as Parameters<typeof resolveZCodeBuiltinProviderConfigFilePath>[0];

  assert.equal(
    resolveZCodeBuiltinProviderConfigFilePath(withEnv),
    join("D:/apps/DWeis Next/resources", BUILTIN_CONFIG_PACKAGED_PATH),
  );
});
