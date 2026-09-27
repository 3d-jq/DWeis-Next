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

> 清单为 2026-09-27 的静态核查结果，动手前以实际 grep 为准。

### 先分清：这两个不是云依赖，别删

`config/provider/zcode-builtin.json` 里的 `zai-api` / `zai-standard-api` 模板是**普通 API-key 供应商**（填 key 直连 api.z.ai 调 GLM），无账号、无回传。用户明确要求保留，删了会少两个可用供应商。同理 `assets/provider-icons/` 下各供应商 logo 属自包含资源，不用动。

### 删除清单

| 分类 | 文件 | 删除后的影响 |
| --- | --- | --- |
| OAuth / 账号登录 | `packages/services/src/oauth/providers/zaiProviderConfig.ts`、`zaiProviderAdapter.ts`、`bigmodelProviderConfig.ts`；`packages/web/src/auth/webZaiOAuthConfig.ts`；`packages/shared/src/model-provider-family.ts` 中 `zai` family 条目（`rootDomain: "z.ai"` + `oauthProviderId` + 三个 codingPlan providerId + `teamCodingPlanManageUrl`） | 设置页不再出现"Z.ai 账号登录"入口。无登录产品，本来就用不了 |
| CodingPlan / 会员额度 | `packages/services/src/coding-plan-subscription/zaiCodingPlanSubscriptionProvider.ts`、`bigmodelCodingPlanSubscriptionProvider.ts`；`packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts`；`apps/zcode-cli/packages/adapters/src/model/official-coding-plan-gateway.ts`、`auth/coding-plan-api-key.ts` | 会员额度查询与续费入口消失。UI 侧"升级"按钮此前已按"设置中是否存在账号类供应商"门控，自托管下已不显示 |
| 对话分享 | `packages/services/src/conversation-share/conversationShareService.ts`；`packages/web/src/share/ConversationShareLandingPage.tsx` | 不能再把对话生成分享链接（原本上传到 Z.ai 服务）。自托管场景下本就不该有 |
| 远端 provider 配置同步 | `packages/provider-node/src/` 下 7 个 `*zcode-builtin*` 文件（`endpoint-scoped-...-source`、`-cache-paths`、`-download`、`-provider-config-materializer`、`-provider-config-source`、`-release`、`-remote-synchronizer`） | 内置供应商/模型列表改为**纯本地** `config/provider/zcode-builtin.json`。新增模型、新供应商模板不再自动更新，需手改 json；换来的是离线可用、配置不会被远程改动（这原本是一条"你的模型配置可被远端修改"的通道，砍掉对自托管是收益） |
| 远端 CDN / 远程资源 | `packages/desktop/src/main/remoteCdn.ts`；`packages/desktop/src/main/desktopMainIpcRemote.ts` | 远程 workspace agent、官方插件、node 运行时的远端下载失效。与"只留桌面端"是同一批改动，合并处理 |
| 默认端点与文档 URL | `packages/shared/src/zcodeEndpoint.ts`（`https://zcode.z.ai`、`https://chat.z.ai`、`https://api.z.ai`、`DEFAULT_ZAI_OAUTH_CLIENT_ID`）；`packages/ui/src/lib/productDocs.ts`（`https://zcode.z.ai/docs`） | 帮助菜单不再跳 Z.ai 文档站；默认端点常量不再误导。自托管后改成自己的地址或去掉 |
| 自动更新源 | `packages/desktop/src/main/autoUpdater.ts`：更新源默认取 `DEFAULT_ZCODE_ENDPOINT_ORIGIN`，可被 `ZCODE_UPDATE_FEED_URL` 覆盖 | 自托管需显式关掉自动更新或指向自有源。注意 `latest.yml` / `.blockmap` 是 electron-updater 标准产物，打包产出本身没问题，只是没有 feed |
| 待确认 | `packages/desktop/src/main/desktopWindowChrome.ts`、`browserView/browserPlaywrightLocatorExecutor.ts`、`packages/ui/src/lib/appTelemetry.ts` | 动手时 grep 引用确认用途再决定去留（appTelemetry 那个 "z.ai" 文案随遥测摘除一并处理） |

### ⚠️ 插件市场默认源：只改 source，不能删市场

`packages/shared/src/plugin-marketplaces.ts:37`：

```ts
source: "https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json",
```

代码注释说明"本地 seed 分片与 CDN 分片在 Agent storage 内合并"——打包时 `prepare-prebuilds.mjs` 会生成本地 mock CDN（`packages/desktop/mock-cdn/releases/<version>/`，内含 `browser-use-plugin` 与 `node-repl-host` 两个官方插件的 `.zcode-plugin/plugin.json`）。

**正确做法**：保留 `ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID`（值 `zcode-plugins-official`）这个 id 与 name 不变，只把远端 `source` 置空或指向本地，让官方插件走本地 seed。

**错误做法**：直接删掉整个市场条目 → 插件市场页面变空白。

### 相关：标识符不要顺手改

清理过程中会看到一堆 `zcode` 字样的字符串，以下**不是** Z.ai 云依赖，改了会连带出问题（依据见 agent memory「monorepo 大范围产品改名」条目）：

- `.zcode-plugin`：git 跟踪的真实目录名，代码引用必须与磁盘一致
- `zcode-plugins-official` / `ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID`：marketplace 标识符，官方插件缓存目录名依赖它
- `config/provider/zcode-builtin.json` 及 `packages/provider-node/src/zcode-builtin-*` 文件名
- 协议命名空间 `com.zcode/*`、`_meta.zcode`、`window.zcode` 桥、`vnd.zcode` content type

### 验收

- 全局 grep `z\.ai` 仅剩 `zai-api` / `zai-standard-api` 两个 API 模板内的地址。
- 不配置任何 Z.ai 端点变量的干净环境下启动，无账号登录入口、无分享入口、无升级入口。
- 插件市场能列出内置的两个官方插件（走本地 seed）。
- `pnpm typecheck`、`pnpm lint` 通过。


## 3. 只留桌面端

- 删除 `packages/web`、`packages/server`、`apps/zcode-cli` 的 Web/Server 打包入口与 SSH-WSL 远程连接链路。
- 注意：`packages/web/index.html` 里还有一份内联的 `zcode-theme` 主题脚本和 ZCode logo，会随本项一起消失；如暂不删 Web，可顺手把它也换成 `dweis-theme` 与品牌标志。
- 注意：`packages/ui/src/store/index.ts` 的 locale 存储键仍是 `zcode-locale`（`dweis-theme` / `dweis-interface-mode` 已换），清理时可统一改成 `dweis-locale`。

## 4. 推到远端

- 远端 `3d-jq/DWeis-Next`：旧 opencode 代码已推到 `legacy-opencode` 分支；新的 fork 主线还在本地（浅克隆导致 force push 失败过，需要完整历史 clone 才能推）。
- 用户偏好：本地提交为主，推送由用户决定。
