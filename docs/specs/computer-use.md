# 电脑控制（Computer Use）规格

> 状态：Windows 首发可用；macOS 保留既有 Helper 语义但本期不启用。
> 引擎：`@trycua/cua-driver`（MIT，npm 平台二进制随插件分发），参照 DeepSeek
> Harness cua-driver-native 提供方的动态工具面与生命周期契约。

## 1. 产品规则

| 规则 | 取值 |
|---|---|
| 默认开关 | **关闭**（`official-plugin-definitions` 不声明 `defaultEnabled`；用户在 设置 → 基础设置 → 电脑控制 开启） |
| 插件 id | `computer-use@zcode-plugins-official`（不变，UI/协议按此寻址） |
| 插件版本 | 本 fork 自有 `1.0.0`（`plugin.json`、definitions、seed 缓存目录、marketplace 条目四处一致） |
| 模型工具面 | 裸名 built-in MCP server `computer-use`，模型侧前缀 **`mcp__computer-use__*`**；工具目录由上游 `listToolsJson()` 动态决定（当前 56 个），描述/schema/annotations 原样透传 |
| 平台矩阵 | Windows：可用（无系统权限门槛）；macOS：Helper/权限链代码保留、本期不启用驱动；Linux：不可用（上游能力判定不变） |
| 子代理 | 延续既有 `computer-use-policy`：按官方 server 前缀阻止 subagent 使用 |

## 2. 状态所有者与链路

```
设置页 computerUse 分区（HIDDEN_SETTINGS_SECTIONS 不含它）
  → pluginManagementService.setPluginEnabled(computer-use@...)
  → agent 配置 plugins.enabledPlugins 落盘（重启/新会话生效）
  → bootstrap resolveOfficialPluginRoots 解析插件根（seed 缓存）
  → create-app: resolveBuiltInComputerUseMcpServer（enabled 才注册）
  → mcp-config 合并（builtIn 最后，防同名劫持；DWEIS_CUA_DRIVER_SERVER 标记跳过 retired 守卫）
  → MCP 客户端 stdio 拉起 __zcode-plugin-host <插件根>/dist/mcp/server.js
  → 引擎进程内 CuaDriver.create → 工具目录/调用
```

- **操作浮层（Windows）**：`computer-use-operation-event` 在 `ToolCallScheduled`
  上按 `mcp__computer-use__*` 前缀（或 node_repl 的 `setupComputerUseRuntime`
  锚点）置 `computerUse:true` → host → main → `windowsCuaOperationIndicator`，
  30s 兜底隐藏。
- **Helper 旁路**：`shouldEnableDefaultCuaProductHelper` 仅 darwin 返回 true；
  win32 的 spawn acquire 同步跳过——本产品 Windows 没有 Helper，引擎在插件内。
- **broker/权限**：驱动路径不读 `ZCODE_CUA_*` broker env；macOS 权限面板链不动。

## 3. 打包与 seed 契约

- `apps/zcode-cli/packages/computer-use-mcp`：引擎（server + 构建脚本），
  `@trycua/cua-driver` 在 esbuild 中 external。
- `apps/zcode-cli/packages/zcode-cua-plugin`：插件内容包（manifest/skill/README）
  + 构建产物（`dist/mcp/server.js`、按 `ZCODE_TARGET_OS/ARCH` 裁剪的驱动闭包
  进本包 `node_modules`，含 `.node` 平台守卫；全平台全量 234MB → 目标平台 27MB）。
- `requiredSeedPaths` 三件套钉住完整性（server/skill/驱动 manifest），缺任一
  seed 拒绝写缓存且不做旧版本回退（宁可不注册）。
- 打包两处清单都已登记：`prepare-agent-node-bundle.mjs`（含 `includeTopLevelPaths:
  ["node_modules"]` 按包放行）与 `build-desktop-agent-cli.mjs`（dev 产物校验）。

## 4. 验收场景

1. 全新装机：插件默认关，模型工具池无 `mcp__computer-use__*`，启动无 CUA 相关报错。
2. 设置 → 电脑控制 → 开启 → 新会话中模型可见动态工具目录（`tools/list` 来自上游）。
3. 模型执行「看屏幕 → 点击 → 再看」循环；截图以图像内容块进入会话（模型需支持图像）。
4. 操作期间 Windows 浮层显示「DWeis Next 正在操作电脑」，结束/30s 后消失。
5. 关闭插件 → 新会话工具消失，重启保持关闭。
6. `pnpm typecheck`（含 apps/zcode-cli）/ `pnpm lint` / `pnpm test` /
   `pnpm architecture:check --changed` 全绿；`pnpm bundle:desktop -- --os win`
   打包成功且安装包体积增量 ≈ 目标平台驱动（约几十 MB 内）。

## 5. 已知边界

- 进程内原生崩溃会带走该 server 进程（MCP 客户端断开重连），不影响 agent 主进程；
  后续可加 MCP 可执行程序形态作隔离选项。
- `cua-app-snapshot` 的旧前缀表未含 `mcp__computer-use__`（应用投影降级，不影响
  浮层/工具）；如需 app identity 投影再补前缀。
- 非开源代码零拷贝：不使用旧 ZCode 缓存里的 0.6.x 插件文件；skill/文档全部自写。
