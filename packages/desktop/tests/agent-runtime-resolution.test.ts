import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDefaultZCodeAgentCommand } from "@zcode/services/storage-startup";
import { ZCODE_RUNTIME_ENV_KEY } from "@zcode/shared";

// 复现过的线上故障：安装包用户把 DWeis Next 仓库本身当 workspace 打开。host 的
// ZCODE_RUNTIME_ENV=production，但 resolver 会先走 monorepo dev 源码分支
// （apps/zcode-cli/packages/cli/src/main.ts + node_modules/.bin/tsx 都在仓库里），
// 该分支的 command 没有 storagePreparationEntry，DatabaseStartupCoordinator 随即抛
// unsupported_runtime，界面显示「无法完成启动准备」。
// 打包态必须只认随包 Agent，dev 分支一律不参与。
//
// 用伪造仓库布局而不是真实仓库根：干净机器上 resolver 在 production 下返回 null，
// 断言会全部空转（原测试就是零信息量）；伪造布局后 dev 分支必然可命中，
// production 分支的「不返回源码 command」也变成必然可失败的断言。
// 同时不依赖机器上是否装过部署版 native agent（那类 command 永远不等于源码 command）。

const SOURCE_MAIN = join("apps", "zcode-cli", "packages", "cli", "src", "main.ts");
const TSX_BIN = join("node_modules", ".bin", "tsx");

function createFakeRepoLayout(): string {
  const root = mkdtempSync(join(tmpdir(), "dweis-agent-resolver-"));
  mkdirSync(join(root, "apps/zcode-cli/packages/cli/src"), { recursive: true });
  writeFileSync(join(root, SOURCE_MAIN), "// fake cli entry\n");
  mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
  writeFileSync(join(root, TSX_BIN), "");
  return root;
}

/** env/cwd 都是全局态，用完必须还原，避免污染同进程里的其他测试文件。 */
function withResolverContext(runtimeEnv: string, fakeRoot: string, run: () => void): void {
  const previousEnv = process.env[ZCODE_RUNTIME_ENV_KEY];
  const previousCwd = process.cwd();
  const scrubbedKeys = ["ZCODE_AGENT_SERVER_COMMAND", "GLM_BINARY_PATH"] as const;
  const previousScrubbed = scrubbedKeys.map((key) => process.env[key]);

  process.env[ZCODE_RUNTIME_ENV_KEY] = runtimeEnv;
  // env 显式覆盖排在候选链最前，shell 里恰好设置过会让本测试测的不是 resolver 本身。
  delete process.env.ZCODE_AGENT_SERVER_COMMAND;
  delete process.env.GLM_BINARY_PATH;
  process.chdir(fakeRoot);
  try {
    run();
  } finally {
    process.chdir(previousCwd);
    if (previousEnv === undefined) {
      delete process.env[ZCODE_RUNTIME_ENV_KEY];
    } else {
      process.env[ZCODE_RUNTIME_ENV_KEY] = previousEnv;
    }
    scrubbedKeys.forEach((key, index) => {
      const value = previousScrubbed[index];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

test("development：dev 源码分支命中伪造仓库布局", () => {
  const fakeRoot = createFakeRepoLayout();
  try {
    withResolverContext("development", fakeRoot, () => {
      const command = resolveDefaultZCodeAgentCommand({
        workspacePath: fakeRoot,
        workspaceKey: fakeRoot,
        presentationSurface: "desktop",
      });

      assert.ok(command, "dev 布局齐全时必须解析出源码 command");
      assert.equal(String(command.args?.[0] ?? ""), join(fakeRoot, SOURCE_MAIN));
      assert.match(String(command.command), /tsx$/u);
    });
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("打包态：即使 cwd 是仓库布局也不返回 dev 源码 command", () => {
  const fakeRoot = createFakeRepoLayout();
  try {
    withResolverContext("production", fakeRoot, () => {
      const command = resolveDefaultZCodeAgentCommand({
        workspacePath: fakeRoot,
        workspaceKey: fakeRoot,
        presentationSurface: "desktop",
      });

      if (command === null) {
        // 干净机器：随包分支与部署兜底都没命中，符合预期。
        return;
      }
      // 装过部署版 native agent 的机器会拿到它——但绝不能是伪造成布局里的
      // tsx + main.ts：那正是「无法完成启动准备」的那条 dev 分支。
      assert.doesNotMatch(String(command.command), /(^|[\/\\])tsx([\/\\]|$)/u);
      assert.notEqual(String(command.args?.[0] ?? ""), join(fakeRoot, SOURCE_MAIN));
    });
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});
