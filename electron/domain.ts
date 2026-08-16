// 全局唯一 endpoint：由构建期常量替换注入（vite define `__OO_ENDPOINT__`）。
// 缺省 oomol.com；本地开发可在 .env.local 设 DWEIS_ENDPOINT 覆盖（见 .env.example）。
// **App 层不可见、不可切换**，其余域名一律由它派生。**禁止散落硬编码具体域名**。
//
// 注入点见 vite.config.ts（dev/构建）与 vitest.config.ts（测试），均经 loadEnv 读取。

declare const __OO_ENDPOINT__: string

/** 当前 endpoint 主域（如 `oomol.com`）。oo-cli 的 OO_ENDPOINT / DWEIS_ENDPOINT 用此裸值。 */
export const ooEndpoint: string = __OO_ENDPOINT__

/** 第三方自定义模型提供方默认 API 基址。业务代码统一从这里引用，避免域名散落。 */
export const externalModelProviderBaseUrls = {
  deepseek: "https://api.deepseek.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
  zhipuCn: "https://open.bigmodel.cn/api/paas/v4",
  zhipuGlobal: "https://api.z.ai/api/paas/v4",
  zhipuCoding: "https://api.z.ai/api/coding/paas/v4",
  kimiCn: "https://api.moonshot.cn/v1",
  kimiGlobal: "https://api.moonshot.ai/v1",
  minimaxCn: "https://api.minimaxi.com/v1",
  minimaxGlobal: "https://api.minimax.io/v1",
  qwenStandardCn: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  qwenStandardGlobal: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  qwenCodingCn: "https://coding.dashscope.aliyuncs.com/v1",
  qwenCodingGlobal: "https://coding-intl.dashscope.aliyuncs.com/v1",
  xiaomiStandard: "https://api.xiaomimimo.com/v1",
  xiaomiTokenCn: "https://token-plan-cn.xiaomimimo.com/v1",
  xiaomiTokenSgp: "https://token-plan-sgp.xiaomimimo.com/v1",
  xiaomiTokenAms: "https://token-plan-ams.xiaomimimo.com/v1",
} as const
