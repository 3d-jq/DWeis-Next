# @zcode/computer-use-mcp

DWeis Next 电脑控制（Computer Use）的 MCP server：进程内包装
[@trycua/cua-driver](https://github.com/trycua/cua)（MIT）。

## 形态

- 工具目录由上游 `listToolsJson()` 动态决定（Phase 0 探针实测 56 个工具：
  `list_apps` / `get_window_state` / `click` / `type_text` / `get_desktop_state` /
  `check_permissions` / 浏览器与会话类工具等），描述与 JSON schema 原样透传——
  与 DeepSeek Harness 的 cua-driver-native 提供方同构，不手写工具清单。
- 经 official-plugin-runtime 的 `__zcode-plugin-host <dist/mcp/server.js>` 以 stdio
  挂进 agent；模型侧工具名空间为 `mcp__computer-use__<上游工具名>`。
- 不依赖 zcode 原 Helper/broker 链路。Windows 无权限门槛（探针实测
  `check_permissions`：UIA available、PostMessage available、无需提权）。

## 生命周期契约（对照 dsh native 提供方）

1. 启动任一步失败（驱动创建 / 目录解析 / 条目校验 / 工具重名）→ `main()` 抛错 →
   进程退出非零 = 天然回滚，不留半套工具面。
2. 关闭顺序：abort lifetime → 等待 in-flight 调用结算（5s 上限）→ `shutdown()`
   （**必须无参**：上游对 `shutdown({})` 的 optional-chain 写法会抛错）→ `uniffiDestroy()`。
3. 取消：lifetime signal 与请求 signal 经 `AbortSignal.any` 合并。

## 构建

```bash
pnpm --filter @zcode/computer-use-mcp build   # tsc(仅声明) + esbuild → dist/mcp/server.js
```

`@trycua/cua-driver` 在 esbuild 中保持 external（原生二进制不可打包），运行期由
插件缓存根的 `node_modules` 解析；驱动闭包（平台包）随插件 seed/staging 分发，
见 `official-plugin-definitions.ts` 的 `runtimeTopLevelPaths` 与
`prepare-agent-node-bundle.mjs`。

行为规格与验收场景：`docs/specs/computer-use.md`。
