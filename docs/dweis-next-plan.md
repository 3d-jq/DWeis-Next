# DWeis Next — 计划中的改造项

本文件记录 DWeis Next（ZCode v3.14.3 fork）已确定但尚未执行的改造项。
品牌名/图标/双模式/桌面端-only 等约束见 `AGENTS.md` 末尾与用户偏好，此处不重复。

## 1. 摘除全部遥测（用户 2026-09-27 确认要做，等喊开工再做）

现状：三套体系并存，**默认都是开启状态**。

| 体系 | 主要文件 | 端点来源 | 采集内容 |
| --- | --- | --- | --- |
| ARMS RUM（阿里云前端监控） | `packages/desktop/src/main/appARMSBootstrap.ts`、`armsUserIdentity.ts`、`armsEventRedaction.ts`、`shared/armsRumShared.ts`，以及 `main/` 下 13 个 `*Telemetry*.ts` / `desktopRemoteUsageArmsTelemetry.ts` | `process.env.ZCODE_ARMS_RUM_ENDPOINT` | `perf`、`webvitals`、`exception`、`whiteScreen`、`api`、`staticResource`；带 `device_mid` 设备标识（`ensureDesktopDeviceMidSync`） |
| 数仓事件上报 | `packages/desktop/src/main/appTelemetryRuntime.ts`、`desktopTelemetryFetch.ts`、`startupTelemetryDelivery.ts` | `process.env.ZCODE_TELEMETRY_REPORT_ENDPOINT` | 产品打点事件 |
| CLI OpenTelemetry / OTLP | `apps/zcode-cli/packages/telemetry/` | `OTEL_EXPORTER_OTLP_*_ENDPOINT` | Agent trace：模型调用、HTTP 状态码、token 用量 |

### 为什么要删

1. **违背产品定位**：本产品无登录、无账号、无云服务；ARMS 会把 `device_mid` + API 请求记录 + 异常堆叠传出本机。
2. **默认开启**：`packages/shared` 中 `ZCODE_TELEMETRY_ENABLED = true`，`main/index.ts` 里 `await armsInitPromise`。
3. **当前是空转但很危险**：三个 `.env*` 文件都没配 ARMS/TELEMETRY 端点，代码注释明确"未配置即停用，构建产物不内嵌"。所以现在采集了没处发——但任何人只要在打包环境里带上端点变量，数据就会外流。这是默认开启 + 环境变量触发的组合。
4. **顺带清依赖**：`packages/desktop/electron-builder.config.js` 的 `REQUIRED_ASAR_RUNTIME_MODULES` 为让 OTel 启动不崩，写死了 `@opentelemetry/api-logs`、`sdk-metrics`、`exporter-trace-otlp-proto`、`exporter-metrics-otlp-proto`、`module-details-from-path`。删遥测时可一并摘掉，减小 app.asar。

### 删除范围（建议顺序）

1. `packages/desktop/src/main/index.ts`：移除 `armsInitPromise` await、armsRum import、`createAppTelemetryRuntime` 相关装配。
2. 删除 `packages/desktop/src/main/` 下的 `appARMSBootstrap.ts`、`armsUserIdentity.ts`、`armsEventRedaction.ts`、`appTelemetryRuntime.ts`、`desktopTelemetryFetch.ts`、`startupTelemetryDelivery.ts`、`databaseStartupTelemetry.ts`、`desktopStabilityTelemetry.ts`、`desktopMcpTelemetry.ts`、`desktopNetworkTelemetry.ts`、`networkTelemetryAggregator.ts`、`desktopZCodeDataSizeTelemetry.ts`、`zcodeDataSizeTelemetryState.ts`、`desktopRemoteUsageArmsTelemetry.ts`、`desktopResourceTelemetry.ts`、`processResourceMcpTelemetrySource.ts`、`shared/armsRumShared.ts`。
   > 先逐个 grep 引用再删，`*Telemetry*` 文件名清单是 2026-09-27 的静态结果，动手前以实际目录为准。
3. `packages/shared`：`ZCODE_TELEMETRY_ENABLED`、`ZCODE_TELEMETRY_REPORT_ENDPOINT`、`ZCODE_ARMS_RUM_ENDPOINT`、`mapZCodeEnvToArmsRumEnv` 及其引用。
4. `electron-builder.config.js`：从 `REQUIRED_ASAR_RUNTIME_MODULES` 摘掉 5 个 OTel 相关条目（保留 `mime-db` 那次发现的问题背景）。
5. `apps/zcode-cli/packages/telemetry/`：整包摘除，并清理 workspace 依赖引用与 `bootstrap.ts` 的 endpoint 解析。
6. `package.json` 中的 `@arms/rum-electron` 及 `@opentelemetry/*` 依赖。

### 验收

- `pnpm typecheck`、`pnpm lint` 通过。
- 全局 grep `ARMS`、`armsRum`、`OTEL_EXPORTER`、`ZCODE_TELEMETRY` 无残留代码引用。
- 打包后 `app.asar` 内不再有 `@opentelemetry`、`@arms`。
- 启动日志无遥测初始化记录。

## 2. Z.ai 云依赖清理

- `packages/provider-node/src/*zcode-builtin*`：内置 provider 配置的远端源（`cdn-zcode.z.ai` 默认源需改为本地 `config/provider/zcode-builtin.json`）。
- OAuth / 账号登录相关配置与 UI（`packages/ui` 中 account / codingPlan / share 相关）。
- 插件市场默认源 `zcode-plugins-official`（保留 marketplace id 不变，只改默认下载源）。
- 文档/帮助链接中的 z.ai URL。

## 3. 只留桌面端

- 删除 `packages/web`、`packages/server`、`apps/zcode-cli` 的 Web/Server 打包入口与 SSH-WSL 远程连接链路。
- 注意：`packages/web/index.html` 里还有一份内联的 `zcode-theme` 主题脚本和 ZCode logo，会随本项一起消失；如暂不删 Web，可顺手把它也换成 `dweis-theme` 与品牌标志。
- 注意：`packages/ui/src/store/index.ts` 的 locale 存储键仍是 `zcode-locale`（`dweis-theme` / `dweis-interface-mode` 已换），清理时可统一改成 `dweis-locale`。

## 4. 推到远端

- 远端 `3d-jq/DWeis-Next`：旧 opencode 代码已推到 `legacy-opencode` 分支；新的 fork 主线还在本地（浅克隆导致 force push 失败过，需要完整历史 clone 才能推）。
- 用户偏好：本地提交为主，推送由用户决定。
