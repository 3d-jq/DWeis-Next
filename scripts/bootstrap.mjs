#!/usr/bin/env node

// DWeis Next：只保留桌面端。原 `--with-remote`（远程 mock-cdn / packages/server 构建）
// 随远程工作区与 Web/Server 形态摘除一并移除，bootstrap 简化为
// install → prepare:desktop-runtime → build:bootstrap。
// apps/zcode-cli 是普通目录（无 .gitmodules），不再执行 submodule 初始化。

import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./spawn-command.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runPnpm(args) {
  runCommand(pnpmCommand, args, {
    cwd: rootDir,
    env: process.env,
  });
}

runPnpm(["install"]);
runPnpm(["prepare:desktop-runtime"]);
runPnpm(["run", "build:bootstrap"]);
