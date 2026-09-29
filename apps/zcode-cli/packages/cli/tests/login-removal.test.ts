import { test } from "node:test";
import assert from "node:assert/strict";
import type { GlobalOptions, RunContext } from "@zcode/shared-types";
import { formatSlashCommandHelp, parseSlashCommand } from "../src/command-center.js";
import { AVAILABLE_COMMANDS } from "../src/command-center/slash-commands.js";
import { runPrompt } from "../src/prompt-command.js";
import type { RunDependencies } from "../src/cli-types.js";

// /login、/logout 已随账号隧道下线（90b6699）。这组测试锁三件事：
// 1) 可用命令与 /help 不再宣传它们；2) headless 收到旧命令形态必须拒绝退出，
//    不能当普通 prompt 转发（否则 API key 会进会话历史并发给模型）；
// 3) 守卫必须发生在触碰任何运行时依赖之前——deps 用会抛错的 Proxy 表达这一点。

function createForbiddenDeps(): RunDependencies {
  return new Proxy(
    {},
    {
      get(_target, property): never {
        throw new Error(
          `deps.${String(property)} 被访问：凭据命令必须在进入运行时之前被拒绝`,
        );
      },
    },
  ) as RunDependencies;
}

function createCapturingContext(): { ctx: RunContext; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const ctx = {
    stdout: {
      write: (chunk: string) => {
        stdout.push(chunk);
        return true;
      },
    },
    stderr: {
      write: (chunk: string) => {
        stderr.push(chunk);
        return true;
      },
    },
  } as unknown as RunContext;
  return { ctx, stdout, stderr };
}

test("可用命令与 /help 不再包含 login/logout", () => {
  assert.equal(AVAILABLE_COMMANDS.includes("/login"), false);
  assert.equal(AVAILABLE_COMMANDS.includes("/logout"), false);

  const help = formatSlashCommandHelp("");
  assert.doesNotMatch(help, /\/login\b|\/logout\b/u);
  assert.match(formatSlashCommandHelp("login"), /Unknown slash command: \/login/u);
  assert.match(formatSlashCommandHelp("logout"), /Unknown slash command: \/logout/u);
});

test("headless 拒绝带 API key 的 /login，不转发给模型", async () => {
  const { ctx, stdout, stderr } = createCapturingContext();
  const code = await runPrompt(
    ctx,
    "/login zai-coding-plan-api-key sk-secret-do-not-leak",
    [],
    {} as GlobalOptions,
    createForbiddenDeps(),
    "0.0.0",
  );

  assert.equal(code, 1);
  assert.match(stderr.join(""), /Command \/login has been removed/u);
  assert.equal(stdout.join(""), "");
});

test("headless 同样拒绝 /logout", async () => {
  const { ctx, stderr } = createCapturingContext();
  const code = await runPrompt(
    ctx,
    "/logout",
    [],
    {} as GlobalOptions,
    createForbiddenDeps(),
    "0.0.0",
  );

  assert.equal(code, 1);
  assert.match(stderr.join(""), /Command \/logout has been removed/u);
});

test("旧命令形态解析为 unknown，由守卫而不是模型路径处理", () => {
  const parsed = parseSlashCommand("/login zai-coding-plan-api-key sk-x");
  assert.equal(parsed?.type, "unknown");
  assert.equal(parsed?.type === "unknown" ? parsed.rawName : undefined, "login");
});
