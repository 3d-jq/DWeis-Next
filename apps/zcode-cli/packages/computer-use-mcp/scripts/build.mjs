import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");

// createRequire banner 与 node-repl-host 同款：esbuild ESM 产物里的 __require shim
// 在 ESM 作用域没有 require 可用，被捆绑的 CJS 依赖会在模块求值阶段抛错。
const nodeRequireBanner = `import { createRequire as __zcodeCreateRequire } from "node:module";
const require = __zcodeCreateRequire(import.meta.url);`;

/**
 * @trycua/cua-driver 必须保持 external：它按平台分发 .node/.dll 原生二进制，
 * 无法被 esbuild 打进 bundle。运行期由插件缓存根的 node_modules 解析
 * （definitions 的 runtimeTopLevelPaths 与打包 staging 都会带上驱动闭包）。
 */
export const buildComputerUseMcpBundle = async ({
  outfile = resolve(packageRoot, "dist", "mcp", "server.js"),
} = {}) => {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    banner: { js: nodeRequireBanner },
    bundle: true,
    entryPoints: [resolve(packageRoot, "src", "server.ts")],
    external: ["@trycua/cua-driver"],
    format: "esm",
    legalComments: "none",
    outfile,
    platform: "node",
    target: "node24",
  });
  return { outfile };
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const { outfile } = await buildComputerUseMcpBundle();
  console.log(`[computer-use-mcp] ${outfile}`);
}
