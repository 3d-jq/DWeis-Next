import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildComputerUseMcpBundle } from "@zcode/computer-use-mcp/build";

const packageRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(packageRoot, "..", "..", "..", "..");
const sourceNodeModules = join(repoRoot, "node_modules");

/**
 * 把 @trycua/cua-driver 及其依赖闭包（含**目标平台**的二进制包）从 hoisted 根
 * node_modules 拷进插件自己的 node_modules。原因有二：
 * 1) 本仓 node-linker=hoisted，包目录下没有自己的 node_modules，而 seed/staging
 *    只会携带插件目录内的文件（definitions 的 runtimeTopLevelPaths 里声明 node_modules）；
 * 2) server.js 从插件缓存根被 plugin-host import，运行期按目录向上解析，必须在
 *    插件根能找到驱动。
 *
 * 上游 optionalDependencies 列出全平台二进制（全量 234MB），这里按 ZCODE_TARGET_OS/
 * ZCODE_TARGET_ARCH（与 prepare-agent-node-bundle 同一目标三元组语义，默认本机）
 * 裁剪，只保留目标平台包——否则安装包会背六个平台的原生库。
 */
const PLATFORM_PACKAGE_PATTERN = /-(darwin|linux|win32)-(arm64|x64)(-|$)/u;

function resolveTargetPlatformTriple() {
  const rawOs = (process.env.ZCODE_TARGET_OS || process.platform).toLowerCase();
  const platform =
    rawOs === "mac" || rawOs === "osx" || rawOs === "darwin"
      ? "darwin"
      : rawOs === "win" || rawOs === "windows" || rawOs === "win32"
        ? "win32"
        : rawOs === "linux"
          ? "linux"
          : process.platform;
  const rawArch = (process.env.ZCODE_TARGET_ARCH || process.arch).toLowerCase();
  const arch = rawArch === "aarch64" ? "arm64" : rawArch === "x86_64" ? "x64" : rawArch;
  return { platform, arch };
}

function isTargetPlatformPackage(name, target) {
  if (!PLATFORM_PACKAGE_PATTERN.test(name)) return true; // 纯 JS 包（@ubjs/core 等）
  return name.includes(`-${target.platform}-`) && name.includes(target.arch);
}

function collectDependencyClosure(rootName, target, seen = new Set()) {
  if (seen.has(rootName)) return seen;
  seen.add(rootName);
  const manifestPath = join(sourceNodeModules, rootName, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`[zcode-cua-plugin] 依赖不在根 node_modules：${rootName}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const deps = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
  };
  for (const dep of Object.keys(deps)) {
    if (isTargetPlatformPackage(dep, target)) collectDependencyClosure(dep, target, seen);
  }
  return seen;
}

function vendorDriverRuntime() {
  const target = resolveTargetPlatformTriple();
  const closure = collectDependencyClosure("@trycua/cua-driver", target);
  const targetRoot = join(packageRoot, "node_modules");
  // 只清驱动作用域（@trycua/@ubjs），保留 pnpm 的 @zcode 链接与 .bin——它们是本包
  // 依赖解析的入口，删掉会让**下一次**构建的静态 import 直接 ERR_MODULE_NOT_FOUND；
  // 这两个目录在 stage 时按 basename 排除，不会进安装包（见 prepare-agent-node-bundle）。
  for (const scope of ["@trycua", "@ubjs"]) {
    rmSync(join(targetRoot, scope), { recursive: true, force: true });
  }
  for (const name of closure) {
    const from = join(sourceNodeModules, name);
    const to = join(targetRoot, name);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true, dereference: true });
  }
  // 构建守卫：目标平台二进制没拷到就立刻失败，否则症状要到用户点开电脑控制才出现。
  const hasNativeBinary = [...closure].some(
    (name) =>
      existsSync(join(targetRoot, name)) &&
      readdirSync(join(targetRoot, name), { recursive: true }).some((file) =>
        String(file).endsWith(".node"),
      ),
  );
  if (!hasNativeBinary) {
    throw new Error(
      `[zcode-cua-plugin] @trycua 闭包中没有 ${target.platform}-${target.arch} 的 .node 平台二进制，驱动无法加载`,
    );
  }
  return [...closure];
}

export const buildZcodeCuaPlugin = async () => {
  const { outfile } = await buildComputerUseMcpBundle({
    outfile: join(packageRoot, "dist", "mcp", "server.js"),
  });
  const closure = vendorDriverRuntime();
  return { outfile, driverClosure: closure };
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const { outfile, driverClosure } = await buildZcodeCuaPlugin();
  console.log(`[zcode-cua-plugin] ${outfile}`);
  console.log(`[zcode-cua-plugin] driver closure: ${driverClosure.join(", ")}`);
}
