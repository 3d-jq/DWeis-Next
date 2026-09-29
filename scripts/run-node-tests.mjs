import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import esbuild from "esbuild";

// 仓库没有单测框架；这里用 esbuild（CLI/desktop 既有依赖）把 TS 测试连同被
// 测源码打成单文件，再交给 Node 内置 test runner 执行。esbuild 是必需的：
// monorepo 内 workspace 包以 TS 源码作入口（package.json exports 指向 src/*.ts），
// 且源码用 `.js` 后缀 import 同目录 `.ts` 文件，Node 原生 type stripping 两者都做不到。
// 测试一律从被测包的 src 相对路径导入，保证跑的是当前源码而不是上一次 tsc 产物。

// 遍历发现：同时认 `tests/` 与 `test/` 两种历史目录名并递归下钻，
// 否则 packages/services/test、packages/ui/test 这类上游遗留测试会被静默跳过。
function collectTestFiles(testsDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.test\.(ts|mts|js|mjs)$/u.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(testsDir);
  return files;
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
        // @zcode/* 是 workspace TS 源码，需要打包；`#` 开头的是 package.json
        // imports 子路径（如 #src/...），同样交给 esbuild 按包内规则解析。
        if (args.path.startsWith("@zcode/") || args.path.startsWith("#")) return null;
        // `@/` 是包内 tsconfig paths 别名（packages/ui → ./src/*）。标 external 会把
        // 裸的 "@/lib/..." 留给 Node 解析并报 ERR_MODULE_NOT_FOUND，必须交还 esbuild
        // 按 tsconfig 解析。
        if (args.path.startsWith("@/")) return null;
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
  // 上游同时用过 tests/ 与 test/ 两种目录名，都要收；两者都不存在才跳过。
  const testsRoots = ["tests", "test"]
    .map((name) => join(packageDir, name))
    .filter((root) => existsSync(root));

  if (testsRoots.length === 0) {
    console.log(`[tests] ${packageDir} 无 tests 目录，跳过`);
    return 0;
  }

  const testFiles = testsRoots.flatMap(collectTestFiles).sort();
  if (testFiles.length === 0) {
    console.log(`[tests] ${packageDir} 无测试文件，跳过`);
    return 0;
  }

  const outDir = join(packageDir, ".tmp-tests");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 递归发现后可能同名（tests/a/foo.test.ts 与 tests/b/foo.test.ts），
  // 产物名用相对路径拍平，避免互相覆盖。
  const testArtifacts = testFiles.map((testFile) => {
    const relativeName = relative(packageDir, testFile)
      .split(/[\\/]/u)
      .slice(1)
      .join("__")
      .replace(/\.(ts|mts)$/u, ".mjs");
    return join(outDir, relativeName);
  });

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

// 不在首个失败包就退出：一次跑完所有包，报告全部失败面。
let failedStatus = 0;
for (const packageDir of packageDirs) {
  const status = await runPackageTests(packageDir);
  if (status !== 0 && failedStatus === 0) failedStatus = status;
}
if (failedStatus !== 0) process.exit(failedStatus);
