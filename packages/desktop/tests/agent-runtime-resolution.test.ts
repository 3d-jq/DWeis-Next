import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDefaultZCodeAgentCommand } from "@zcode/services/storage-startup";
import { ZCODE_RUNTIME_ENV_KEY } from "@zcode/shared";

// 复现过的线上故障：安装包用户把 DWeis Next 仓库本身当 workspace 打开。host 的
// ZCODE_RUNTIME_ENV=production，但 resolver 会先走 monorepo dev 源码分支
// （apps/zcode-cli/packages/cli/src/main.ts + node_modules/.bin/tsx 都在仓库里），
// 该分支的 command 没有 storagePreparationEntry，DatabaseStartupCoordinator 随即抛
// unsupported_runtime，界面显示「无法完成启动准备」。
// 打包态必须只认随包 Agent，dev 分支一律不参与。
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("打包态 resolver 不返回 dev 源码 command", () => {
  const previousEnv = process.env[ZCODE_RUNTIME_ENV_KEY];
  const previousCwd = process.cwd();

  process.env[ZCODE_RUNTIME_ENV_KEY] = "production";
  process.chdir(repoRoot);
  try {
    const command = resolveDefaultZCodeAgentCommand({
      workspacePath: repoRoot,
      workspaceKey: repoRoot,
      presentationSurface: "desktop",
    });

    if (command) {
      // 命中的必须是随包/解析出的 Agent，而不是仓库源码或 tsx。
      assert.doesNotMatch(String(command.command), /(^|[\/])tsx([\/]|$)/u);
      assert.doesNotMatch(String(command.args?.[0] ?? ""), /src[\/]main\.ts$/u);
      // 存储准备入口必须存在，否则照样 unsupported_runtime。
      assert.ok(command.storagePreparationEntry, "storagePreparationEntry 必须存在");
      assert.equal(command.supportsStorageStartup, true);
    }
  } finally {
    process.chdir(previousCwd);
    if (previousEnv === undefined) {
      delete process.env[ZCODE_RUNTIME_ENV_KEY];
    } else {
      process.env[ZCODE_RUNTIME_ENV_KEY] = previousEnv;
    }
  }
});
