# DWeis Next

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="DWeis Next" width="128" height="128" />
</div>
<p align="center">
  通用 AI 编程 Agent 桌面应用 —— 无遥测、无账号绑定、能力开放
</p>
<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

DWeis Next 是一个通用的 AI 编程工作台：本地桌面应用 + Agent 运行时，模型请求由用户
自行配置端点直连（API Key 或任意兼容服务），不依赖任何云平台账号。

DWeis Next 基于 [zai-org/ZCode](https://github.com/zai-org/ZCode) v3.14.3（Apache License 2.0）
修改而来。依据 Apache License 2.0 第 4(b) 条的修改声明见
[NOTICE.md](NOTICE.md)；与上游的差异清单与进度见 [docs/dweis-next-plan.md](docs/dweis-next-plan.md)。

## 与上游的主要差异

- **无遥测**：ARMS RUM、数仓事件上报与 OpenTelemetry 导出链全部移除，应用不产生、
  不发送任何埋点数据，也不持久化设备指纹。
- **无账号体系**：OAuth 登录、CodingPlan 会员/购买/企业订单、对话分享上传均已移除，
  设置页无账号入口，运行时不向平台发起任何账号类请求。
- **模型请求直连**：不经过任何平台网关，请求按用户配置的端点原样发出。
- **配置纯本地**：内置供应商/模型列表来自随包 `config/provider/zcode-builtin.json`，
  不会被远端改动。
- **自动更新默认关闭**：默认不连接任何更新源；自托管分发可用
  `ZCODE_UPDATE_FEED_URL` 指向自有 feed。

保留的通用能力：插件市场（官方插件随包内置，支持添加任意第三方 marketplace）、
定时自动化与闲时任务、动态工作流、MCP、本地 App 用量统计。

## 仓库结构

| 目录                                  | 内容                                    |
| ------------------------------------- | --------------------------------------- |
| `packages/desktop`                    | Electron 桌面端（main、host、renderer） |
| `packages/ui`                         | 共享 React 组件、hooks 与 Zustand store |
| `packages/services`                   | 业务服务                                |
| `packages/shared`                     | 共享协议与类型                          |
| `packages/provider` / `provider-node` | 模型 Provider 配置与运行时              |
| `packages/rpc` / `packages/client`    | RPC 框架与 Agent 客户端 SDK             |
| `apps/zcode-cli`                      | Agent CLI 与运行时源码                  |

Web（`packages/web` / `packages/server`）与远程链路按计划移除中，见
[docs/dweis-next-plan.md](docs/dweis-next-plan.md)。

## 初始化

准备 Git、Node.js **24.14.0** 和 pnpm **10.33.2**，版本以 [mise.toml](mise.toml) 为准。
以下命令均在仓库根目录执行。

```bash
pnpm bootstrap
```

`pnpm bootstrap` 安装 workspace 依赖、准备桌面本地运行资源，再执行 `build:bootstrap`。
Agent CLI 与运行时源码位于 [apps/zcode-cli/](apps/zcode-cli/)，随仓库一起克隆，无需
单独初始化 submodule。

## 开发与运行

```bash
pnpm dev:desktop

# 使用测试环境
pnpm dev:desktop:test
```

`pnpm dev:desktop` 默认等同于 `pnpm dev:desktop:prod`。启动脚本会准备本地运行资源、
构建桌面 Agent，再启动 Electron 和源码监听。需要独立开发数据目录时设置
`DWEIS_DATA_BASE_DIR`。

### 配置

根目录 [.env.example](.env.example) 提供配置示例，可复制为 `.env`，本地覆盖放入
`.env.local`。

| 配置                                 | 用途                                             |
| ------------------------------------ | ------------------------------------------------ |
| `DWEIS_DATA_BASE_DIR`                | 应用数据基目录，数据写入其下的 `.dweis/`         |
| `DWEIS_BUILTIN_PROVIDER_CONFIG_FILE` | 本地 Provider 配置文件路径；未设置时使用内置配置 |
| `ZCODE_UPDATE_FEED_URL`              | 自有更新源；未设置时自动更新保持关闭             |

### CLI

```bash
pnpm --filter @zcode/cli dev
node apps/zcode-cli/packages/cli/dist/dweis.cjs --help
```

### 检查与验证

| 命令                                | 用途                          |
| ----------------------------------- | ----------------------------- |
| `pnpm typecheck`                    | 类型检查                      |
| `pnpm lint` / `pnpm lint:fix`       | Lint                          |
| `pnpm verify:pre-push`              | 提交前检查（Lint 与架构检查） |
| `pnpm architecture:check --changed` | 架构检查                      |
| `pnpm knip`                         | 未使用依赖与导出              |

## 打包

```bash
pnpm bundle:desktop

# 指定目标平台与 CPU 架构
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

默认目标为 macOS arm64，输出目录为 `packages/desktop/dist/`。`--os` 支持 `mac`、
`win`、`linux`，`--arch` 支持 `x64`、`arm64`；实际打包与签名需要目标平台对应的工具链。

## License

本项目基于 [Apache License 2.0](LICENSE) 开源，包含对
[zai-org/ZCode](https://github.com/zai-org/ZCode) 的修改，修改声明见
[NOTICE.md](NOTICE.md)，第三方组件信息见
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
