import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

// 与 vite.config.ts 同机制：经 loadEnv 读取 .env(.local) 的 DWEIS_ENDPOINT 并常量替换到
// electron/domain.ts 的 __OO_ENDPOINT__，缺省 oomol.com。无需任何运行时注入。
// 测试断言由 ooEndpoint 派生（与具体取值无关），故 CI（缺省 oomol.com）与本地
// （.env.local 覆盖）都确定性通过。测试文件与本配置都不进打包产物。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const ooEndpoint = env.DWEIS_ENDPOINT?.trim() || "oomol.com"
  return {
    resolve: {
      alias: {
        "@": path.resolve(dirname, "src"),
      },
    },
    define: {
      __OO_ENDPOINT__: JSON.stringify(ooEndpoint),
    },
    test: {
      // .test.tsx 与 .test.ts 都收集：组件测试允许使用 JSX（如 src/routes/Chat/index.test.tsx），
      // 其余纯逻辑/模型测试沿用 .test.ts。两种约定均被 vitest run 收集。
      include: [
        "electron/**/*.test.ts",
        "electron/**/*.test.tsx",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "scripts/**/*.test.ts",
        "scripts/**/*.test.tsx",
      ],
      environment: "node",
    },
  }
})
