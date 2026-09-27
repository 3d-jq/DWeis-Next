# DWeis Next — 计划中的改造项

本文件记录 DWeis Next（ZCode v3.14.3 fork）的改造项进展。
品牌名/图标/双模式/桌面端-only 等约束见 `AGENTS.md` 末尾与用户偏好，此处不重复。

## 1. 摘除全部遥测 —— 已完成（2026-09-27，提交 3093ff0 / 7058dd1 / 64c1f29）

**结论：所有出口已关闭，应用不再有任何数据出网。**

### 实际策略（与原计划的"删文件"不同）

原计划删 32 个模块 + 拆 21 个 UI 调用点。实施时发现
`IPlatformService.reportTelemetryEvent / reportArmsCustomEvent / getDeviceId`
被 **21 个 UI 文件**依赖，且 `getDeviceId()` 还被 onboarding 本地记录与
stream client id 复用（非遥测用途）。逐点删除会大面积破坏功能。

因此采用**"关出口 + 保留契约"**，privacy 效果等价、回归风险极低：

| 体系 | 处置 | 效果 |
| --- | --- | --- |
| 数仓上报 | `packages/shared/src/env.ts` 的 `ZCODE_TELEMETRY_ENABLED` 恒 `false` | **总闸**：`services/telemetry/telemetryCore.ts:368` 与 desktop 侧都先判它，事件在此终止 |
| ARMS RUM | 32 个模块删除；`main/index.ts` 不再 `await armsInitPromise` | SDK 不再初始化 |
| cli OTel | `prepareModelTelemetryEnv` 直接返回原始 env；`createModelTelemetry` 恒返回 disabled | 不加载 OTel SDK、不建 Provider/Exporter |
| renderer Trace / TTFT | `rendererActionTraceExporter` 恒 `undefined`；`localTtftExporter` 的 endpoint 恒 `undefined` | 两条原本遗漏的 OTLP 出口关闭 |
| 打包依赖 | `REQUIRED_ASAR_RUNTIME_MODULES` 摘掉 5 个 OTel 包 | app.asar 减小 |
| deviceMid | 透传链全部置空；`getDeviceId()` 改进程内匿名随机值 | 不再产生/持久化设备指纹 |

### 有意保留但已空转

- `IPlatformService` 的 3 个方法：实现为空操作/匿名值，UI 调用点不报错
- `packages/shared/src/telemetry.ts`、`channels.ts` 的类型与 channel 定义
- `apps/zcode-cli/packages/telemetry` 包（128KB，10 文件）

这些是跨包公开契约，删除会牵连 UI 21 个文件与 cli 多个依赖方。若要彻底删除，
作为独立小阶段做，每步以 `pnpm typecheck` + grep 无调用点为准。

### 验收结果

- desktop typecheck：main 83 err（改动前基线 **89**）/ host **0** / preload 3 / scheduler 1
- shared **0** / ui **0** / cli telemetry **0**
- `oxlint` **0 error**（warnings 33 → 25，余为上游遗留）
- 错误总数不高于改动前基线，未引入新类型错误

## 2. Z.ai 云依赖清理

> 清单为 2026-09-27 的静态核查结果，动手前以实际 grep 为准。

### 进展（2026-09-27）：CodingPlan 网络层摘除 —— 已完成

**策略**：「关出口 + 保留契约」（与遥测阶段同款）。`ICodingPlanSubscriptionService`、
`IUsageStatsService` 是跨包公开契约（client/remoteServiceAccess、desktop host 装配、
ui store/hooks 依赖），方法签名保持不变，只把实现替换为本地空值/本地判定，
所有 CodingPlan 网络请求从此不再出网。

- 删除 `bigmodelCodingPlanSubscriptionProvider.ts`、`zaiCodingPlanSubscriptionProvider.ts`
  （两个 provider 的登录态请求头平移到 `codingPlanAuthHeaders.ts`，供
  availability 校验与 Team Plan runtime key 继续引用）。
- `codingPlanSubscriptionService.ts`：账号/套餐/购买/支付/企业订单全部恒返回
  「未连接」语义空值；平台级配置改为纯本地判定——闲时任务仅 `ZCODE_OFFPEAK_MOCK=1`
  可用、动态工作流仅 `ZCODE_DYNAMIC_WORKFLOW_MODE` 本地覆盖生效、预算固定
  preflight-v1、强更恒 null（原 client/configs 出网通道随 provider 一并消失）。
- 删除 `usage-stats/providers/` 整个集群（`bigmodelUsageQuotaProvider`、
  `bigmodelSubscriptionProvider`、`bigmodelUsageMonitorMapper`、`bigmodelUsageMonitorRange`、
  `bigmodelUsageQuotaMapper`、`zcodeMcpQuotaProvider`）；`usageStatsService.ts` 只保留
  本地 App Usage（agent 数据库统计），entitlement 恒 `not_configured`，重置通道恒空，
  Coding Plan monitor 链路以稳定错误码 `coding_plan_unavailable` 快速失败。
- `apps/zcode-cli/packages/telemetry`：删除 `otlp-exporter.ts` 及 bootstrap 内死代码
  （`createPreparedOwner` / deviceMid 状态文件链），修复依赖摘除后遗留的 7 个类型错误。
- CLI `official-coding-plan-gateway.ts` 维持 cb4757f 的停用状态（恒直连、无出网）；
  `coding-plan-api-key.ts` 属 OAuth 登录链路，随「OAuth / 账号登录」行一并处理。
- `officialMcpCredentialSource` 凭证注入源随额度查询摘除；MCP 调用身份头不受影响。

**验收**：根 `pnpm typecheck` 0 错误；desktop typecheck main 82 / preload 3 /
scheduler 1 / host 0（与基线一致）；`apps/zcode-cli` turbo typecheck 27/27 通过；
`pnpm lint` 0 error（改动文件 0 warning）；`pnpm architecture:check --changed` 0 违规；
`registry:check` 通过。全仓库 grep 已删模块名无代码残留（仅历史注释提及）。

### 先分清：这两个不是云依赖，别删

`config/provider/zcode-builtin.json` 里的 `zai-api` / `zai-standard-api` 模板是**普通 API-key 供应商**（填 key 直连 api.z.ai 调 GLM），无账号、无回传。用户明确要求保留，删了会少两个可用供应商。同理 `assets/provider-icons/` 下各供应商 logo 属自包含资源，不用动。

### 删除清单

| 分类 | 文件 | 删除后的影响 |
| --- | --- | --- |
| OAuth / 账号登录 | ⏳ 待做：`packages/services/src/oauth/providers/zaiProviderConfig.ts`、`zaiProviderAdapter.ts`、`bigmodelProviderConfig.ts`；`packages/web/src/auth/webZaiOAuthConfig.ts`；`packages/shared/src/model-provider-family.ts` 中 `zai` family 条目（`rootDomain: "z.ai"` + `oauthProviderId` + 三个 codingPlan providerId + `teamCodingPlanManageUrl`） | 设置页不再出现"Z.ai 账号登录"入口。无登录产品，本来就用不了 |
| CodingPlan / 会员额度 | ✅ 已完成（2026-09-27，见上方「进展」）：`packages/services/src/coding-plan-subscription/` 两 provider、`usage-stats/providers/` 集群已删；`apps/zcode-cli/packages/adapters` 的 `official-coding-plan-gateway.ts` 已于 cb4757f 停用，`auth/coding-plan-api-key.ts` 待 OAuth 行一并处理 | 会员额度查询与续费入口消失，网络层不再出网。UI 侧"升级"按钮此前已按"设置中是否存在账号类供应商"门控，自托管下已不显示 |
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
