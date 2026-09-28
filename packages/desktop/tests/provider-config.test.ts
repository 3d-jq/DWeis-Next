import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveZCodeBuiltinProviderConfigFilePath } from "../src/main/desktopProviderConfig.js";
import { join } from "node:path";

const BUILTIN_CONFIG_FILENAME = "config/provider/zcode-builtin.json";

test("打包态忽略本机 env 的 provider 配置覆盖路径", () => {
  // 这是「去配置供应商」误报的根因：机器上另一份 ZCode 装机在环境变量里留下了
  // 指向它自己 Active 缓存的路径，桌面进程读它就会拿到模板为空的内置配置。
  const resolved = resolveZCodeBuiltinProviderConfigFilePath({
    isPackaged: true,
    resourcesPath: "D:/apps/DWeis Next/resources",
    env: { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: "D:/other-zcode/cache/active/zcode-builtin.json" },
  });

  assert.equal(resolved, join("D:/apps/DWeis Next/resources", BUILTIN_CONFIG_FILENAME));
});

test("打包态未显式给 env 时同样以随包资源为准", () => {
  const resolved = resolveZCodeBuiltinProviderConfigFilePath({
    isPackaged: true,
    resourcesPath: "D:/apps/DWeis Next/resources",
  });

  assert.equal(resolved, join("D:/apps/DWeis Next/resources", BUILTIN_CONFIG_FILENAME));
});

test("process.env 里的覆盖路径不会渗进解析结果", () => {
  const polluted = "D:/legacy-zcode/active-cache/zcode-builtin.json";
  const previous = process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE;
  process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = polluted;

  try {
    const resolved = resolveZCodeBuiltinProviderConfigFilePath({
      isPackaged: true,
      resourcesPath: "D:/apps/DWeis Next/resources",
    });
    assert.equal(resolved, join("D:/apps/DWeis Next/resources", BUILTIN_CONFIG_FILENAME));

    const devResolved = resolveZCodeBuiltinProviderConfigFilePath({
      isPackaged: false,
      appPath: "D:/program/ZCode/packages/desktop",
    });
    assert.equal(
      devResolved,
      join("D:/program/ZCode/packages/desktop", "../../config/provider", "zcode-builtin.json"),
    );
  } finally {
    if (previous === undefined) {
      delete process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE;
    } else {
      process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = previous;
    }
  }
});
