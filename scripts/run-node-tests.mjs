import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import esbuild from "esbuild";

// 仓库没有单测框架；这里用 esbuild（CLI/desktop 既有依赖）把 TS 测试连同被
// 测源码打成单文件，再交给 Node 内置 test runner 执行。esbuild 是必需的：
// monorepo 内 workspace 包以 TS 源码作入口（package.json exports 指向 src/*.ts），
// 且源码用 `.js` 后缀 import 同目录 `.ts` 文件，Node 原生 type stripping 两者都做不到。
// 测试一律从被测包的 src 相对路径导入，保证跑的是当前源码而不是上一次 tsc 产物。

function collectTestFiles(testsDir) {
  return readdirSync(testsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.test\.(ts|mts|js|mjs)$/u.test(entry.name))
    .map((entry) => join(testsDir, entry.name))
    .sort();
}

// 只打包 workspace TS 源码（@zcode/* 全部是 workspace:* 依赖），真实 npm 依赖
// 保持 external，由运行时从包自身 node_modules 解析。electron 由调用方提供的
// stub 顶替，否则桌面主进程模块在 import 期就会读 electron 的 app 单例。
function createResolvePlugin(packageDir) {
  const electronStub = join(packageDir, "tests/stubs/electron.mjs");

  return {
    name: "dweis-node-tests-resolve",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (args.kind === "entry-point") return null;
        if (args.path.startsWith("@zcode/")) return null;
        if (args.path === "electron" && existsSync(electronStub)) {
          return { path: electronStub };
        }
        return { path: args.path, external: true };
      });
    },
  };
}

async function bundleTestFile(packageDir, testFile, outFile) {
  await esbuild.build({
    entryPoints: [testFile],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "warning",
    // 源码是 CJS/ESM 混布的 workspace 包；测试产物只需要能 import，不发布。
    mainFields: ["module", "main"],
    plugins: [createResolvePlugin(packageDir)],
  });
}

function runTests(packageDir, testArtifacts) {
  // 传目录在 Node 22 下会把目录自身当成一个用例执行，必须逐个传打包产物。
  return spawnSync(process.execPath, ["--test", ...testArtifacts], {
    cwd: packageDir,
    stdio: "inherit",
    env: process.env,
  });
}

async function runPackageTests(packageDirArg) {
  const packageDir = resolve(packageDirArg);
  const testsDir = join(packageDir, "tests");

  if (!existsSync(testsDir)) {
    console.log(`[tests] ${packageDir} 无 tests 目录，跳过`);
    return 0;
  }

  const testFiles = collectTestFiles(testsDir);
  if (testFiles.length === 0) {
    console.log(`[tests] ${packageDir} 无测试文件，跳过`);
    return 0;
  }

  const outDir = join(packageDir, ".tmp-tests");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const testArtifacts = testFiles.map((testFile) =>
    join(
      outDir,
      testFile
        .split(/[\\/]/u)
        .pop()
        .replace(/\.(ts|mts)$/u, ".mjs"),
    ),
  );

  try {
    for (const [index, testFile] of testFiles.entries()) {
      await bundleTestFile(packageDir, testFile, testArtifacts[index]);
    }
  } catch (error) {
    console.error(`[tests] ${packageDir} 打包失败：${error?.message ?? error}`);
    return 1;
  }

  const result = runTests(packageDir, testArtifacts);
  if (result.status === 0) {
    rmSync(outDir, { recursive: true, force: true });
  } else {
    console.error(`[tests] ${packageDir} 失败，保留产物目录 ${outDir}`);
  }
  return result.status ?? 1;
}

const packageDirs = process.argv.slice(2);
if (packageDirs.length === 0) {
  console.error("用法：node scripts/run-node-tests.mjs <packageDir> [...]");
  process.exit(1);
}

for (const packageDir of packageDirs) {
  const status = await runPackageTests(packageDir);
  if (status !== 0) process.exit(status);
}
