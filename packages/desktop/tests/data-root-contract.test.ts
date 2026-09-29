import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { resolveSharedZCodeCredentialsPath } from "../../../apps/zcode-cli/packages/adapters/src/auth/shared-credentials.js";
import { DWEIS_DATA_BASE_DIR_ENV_KEY } from "@zcode/shared";

// 复现过的故障形态：旧 ZCode 装机给自己子进程注入 ZCODE_DATA_BASE_DIR，
// 谁继承到它，DWeis Next 的数据根就被扳到别的目录——引导记录、模型配置、
// 设置在两个根之间漂移，表现为「引导和配置模型界面反复出现」。
// 数据根契约已换到 DWEIS_* 命名空间，旧变量名必须不再是输入。
test("凭据路径不认旧 ZCode 的数据根变量", () => {
  const path = resolveSharedZCodeCredentialsPath({
    env: { ZCODE_DATA_BASE_DIR: "D:/zcode_workspace" },
  });

  assert.equal(path, join(homedir(), ".dweis", "v2", "credentials.json"));
});

test("凭据路径认 DWeis 自己的数据根变量", () => {
  const path = resolveSharedZCodeCredentialsPath({
    env: { [DWEIS_DATA_BASE_DIR_ENV_KEY]: "D:/dweis-data" },
  });

  assert.equal(path, join("D:/dweis-data", ".dweis", "v2", "credentials.json"));
});

// Windows 下 `set DWEIS_DATA_BASE_DIR=` 产生空串、误输入产生纯空白，
// 两种都必须回落 homedir：空串穿透会把凭据写到 cwd，空白会拼出坏路径。
test("凭据路径把空串与纯空白数据根回落到 homedir", () => {
  for (const value of ["", "   "]) {
    const path = resolveSharedZCodeCredentialsPath({
      env: { [DWEIS_DATA_BASE_DIR_ENV_KEY]: value },
    });

    assert.equal(path, join(homedir(), ".dweis", "v2", "credentials.json"));
  }
});
