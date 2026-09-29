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

### 进展（2026-09-27）：对话分享摘除 —— 已完成

**策略**：「关出口 + 保留契约」。接口文件 `conversationShare.ts` 本就带有
`createUnsupportedConversationShareService` 门禁工厂（原为 desktop-attached-remote
宿主准备），直接复用它替换两处网络实现装配：

- 删除 `conversation-share/` 网络实现簇 7 个文件：`conversationShareService.ts`、
  `conversationShareHttpClient.ts`、`conversationShareArtifactSource.ts`、
  `conversationShareArtifactDiscovery.ts`、`conversationSharePublicProjection.ts`、
  `sharedContextFormatter.ts`、`conversationShareIntegrity.ts`。
  `ConversationShareClientErrorKind` 类型内联进契约文件。
- `node.ts` 与 `remoteWorkspaceServiceCollection.ts` 的分享服务统一替换为
  不可用门禁——上传发布（publish）与从链接导入（importShare/getPreview/getContinuation）
  双向出网点全部消失；attachment 侧的连接 scope 包装随实现删除，改为透传。
- UI 分享入口无需改动：`WorkspaceHeaderActionSection` 本按登录态渲染分享菜单
  （`activeTaskId && user && isDesktop !== false`），OAuth 摘除后 `user` 恒空，
  入口已自动隐藏；UI 分享组件保留为惰性契约代码。
- web 落地页（`packages/web/src/share/`）随「只留桌面端」整包删除。

### 进展（2026-09-27）：OAuth / 账号登录摘除 —— 已完成

**策略**：「关出口 + 保留契约」。与 CodingPlan 网络层同款——删真实出口，保留跨包
类型与渲染契约，让 UI 侧 ~20 个账号状态文件无需连带重构即可安全空转。

- **服务层（登录能力归零）**：删除 `oauth/providers/` 下 zai/bigmodel 的
  config + adapter 四个文件；`createOAuthRuntimeConfig` 恒返回空 provider 列表、
  `createOAuthProviderAdapters` 恒返回空数组——OAuthService 没有任何可用登录方式，
  authorize/token/userinfo 全链路不可达，登录尝试快速失败。`oauthUnauthorizedRequest`
  移除业务 token 的 userinfo 401 识别分支（无登录来源），保留 ZCode JWT 路径。
- **UI 层（入口消失）**：`settings/model-provider-section/constants.ts` 的
  `PRESET_PROVIDER_SPECS`（Z.ai/BigModel 预设卡）与 `CODING_PLAN_PROVIDER_SPECS`
  （套餐导航/状态卡静态源）置空；升级对话框按「账号类供应商存在」门控自然不可达。
  账号状态渲染代码（StatusCards / Detail / navigation 等）保留但不再产生条目。
- **shared 层**：删除 `ModelProviderFamilySpec.rootDomain` 字段与
  `resolveModelProviderFamilyIdByBaseURL`（grep 证实无任何消费方）。`oauthProviderId`、
  三个 codingPlan providerId、`teamCodingPlanManageUrl` 暂留：它们有 11 个 UI 文件消费
  （正式摘除随 UI 账号区整体清理做），且已无登录出口可达，属惰性元数据。
- **web 侧**：`webZaiOAuthConfig.ts` 暂不单独摘除——web 登录与分享回调
  （`shareRedirectUri`）、`webAuthService`、`WebCallbackPage` 相互耦合，而 `packages/web`
  整包属「只留桌面端」阶段，届时随包删除，避免重复劳动。

### 进展（2026-09-27）：CodingPlan 网络层摘除 —— 已完成

**策略**：「关出口 + 保留契约」（与遥测阶段同款）。`ICodingPlanSubscriptionService`、
`IUsageStatsService` 是跨包公开契约（client/remoteServiceAccess、desktop host 装配、
ui store/hooks 依赖），方法签名保持不变，只把实现替换为本地空值/本地判定，
所有 CodingPlan 网络请求从此不再出网。

- 删除 `bigmodelCodingPlanSubscriptionProvider.ts`、`zaiCodingPlanSubscriptionProvider.ts`
  （两个 provider 的登录态请求头平移到 `codingPlanAuthHeaders.ts`，供
  availability 校验与 Team Plan runtime key 继续引用）。
- `codingPlanSubscriptionService.ts`：账号/套餐/购买/支付/企业订单全部恒返回
  「未连接」语义空值；平台级配置改为纯本地判定——闲时任务本机有可用模型即默认启用
  （后续修正：初版误按 fail-closed 关闭，属通用产品自有能力）、动态工作流打包产物
  固定 alwaysOn（desktopRuntimeEnv）/其余场景走 `ZCODE_DYNAMIC_WORKFLOW_MODE` 本地覆盖、
  预算固定 preflight-v1、强更恒 null（原 client/configs 出网通道随 provider 一并消失）。
- 删除 `usage-stats/providers/` 整个集群（`bigmodelUsageQuotaProvider`、
  `bigmodelSubscriptionProvider`、`bigmodelUsageMonitorMapper`、`bigmodelUsageMonitorRange`、
  `bigmodelUsageQuotaMapper`、`zcodeMcpQuotaProvider`）；`usageStatsService.ts` 只保留
  本地 App Usage（agent 数据库统计），entitlement 恒 `not_configured`，重置通道恒空，
  Coding Plan monitor 链路以稳定错误码 `coding_plan_unavailable` 快速失败。
- `apps/zcode-cli/packages/telemetry`：删除 `otlp-exporter.ts` 及 bootstrap 内死代码
  （`createPreparedOwner` / deviceMid 状态文件链），修复依赖摘除后遗留的 7 个类型错误。
- CLI `official-coding-plan-gateway.ts` 维持 cb4757f 的停用状态（恒直连、无出网）；
  `coding-plan-api-key.ts` 已随「OAuth / 账号登录」下线一并删除（90b6699）。
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
| OAuth / 账号登录 | ✅ 已完成（2026-09-27，见下方「进展」）：`oauth/providers/` 的 `zaiProviderConfig.ts`、`zaiProviderAdapter.ts`、`bigmodelProviderConfig.ts`、`bigmodelProviderAdapter.ts` 已删；`packages/web/src/auth/webZaiOAuthConfig.ts` 随「只留桌面端」一并删除（web 登录/分享回调与其耦合，单独摘除会做无用功）；`model-provider-family.ts` 的 `rootDomain` 字段与 `resolveModelProviderFamilyIdByBaseURL` 死代码已删，其余字段按「保留契约」暂留（见下方说明） | OAuth 运行时配置恒空、adapter 恒空，任何登录尝试快速失败；设置页预设区/Coding Plan 导航的静态 spec 源置空，无账号登录入口 |
| CodingPlan / 会员额度 | ✅ 已完成（2026-09-27，见上方「进展」）：`packages/services/src/coding-plan-subscription/` 两 provider、`usage-stats/providers/` 集群已删；`apps/zcode-cli/packages/adapters` 的 `official-coding-plan-gateway.ts` 已于 cb4757f 停用，`auth/coding-plan-api-key.ts` 已随 90b6699 的 /login 下线一并删除 | 会员额度查询与续费入口消失，网络层不再出网。UI 侧"升级"按钮此前已按"设置中是否存在账号类供应商"门控，自托管下已不显示 |
| 对话分享 | ✅ 已完成（2026-09-27，见下方「进展」）：services 侧删除 `conversation-share/` 网络实现簇 7 个文件（service/httpClient/artifactSource/ArtifactDiscovery/publicProjection/sharedContextFormatter/integrity），仅保留契约文件 `conversationShare.ts`（接口 + 错误类型 + 现成的 `createUnsupportedConversationShareService` 门禁）；本地与 remote 宿主装配统一走门禁。`packages/web/src/share/` 落地页随「只留桌面端」整包删除（与 webZaiOAuthConfig 同批） | 分享上传/从链接导入（双向都出 Z.ai 网）全部不可达；UI 分享入口本按登录态门控（`user` 恒空），随 OAuth 摘除自动消失 |
| 远端 provider 配置同步 | ✅ 已完成（2026-09-27，见下方「进展」）：删除 `zcode-builtin-download.ts`、`zcode-builtin-remote-synchronizer.ts`、`endpoint-scoped-zcode-builtin-source.ts` 与 services 侧 `zcodeBuiltinRemoteConfig.ts`；`zcode-builtin-release.ts`（本地源的类型/编解码）、`-cache-paths`（本地路径）、`-materializer`（本地文件物化）、`-provider-config-source`（本地 bundled/Active 读取）按「保留契约」留下，服务纯本地读路径 | 内置供应商/模型列表改为**纯本地** `config/provider/zcode-builtin.json`。新增模型、新供应商模板不再自动更新，需手改 json；换来的是离线可用、配置不会被远程改动 |
| 远端 CDN / 远程资源 | 🔄 与「只留桌面端」合并处理：`remoteCdn.ts` 生产态仍服务于官方插件包/node 运行时下载（打包产物不含 mock-cdn，直接删会断插件安装）；`desktopMainIpcRemote.ts` 属远程 workspace 链路 | 插件市场默认源已置空（走本地 seed）；运行时下载链路的最终处置随整包重构决定 |
| 默认端点与文档 URL | ✅ 已完成（2026-09-27）：`productDocs.ts` 删除（帮助菜单/quick pick 的文档入口移除，帮助菜单保留资源管理/检查更新/关于）；zcodeEndpoint 清理零消费导出（`buildZaiOAuthUrl`、`buildRuntimeZaiOAuthUrl`、`buildBigModelCodingPlanPersonalManageUrl`）。运行时端点管道（`buildRuntimeZCodeApiUrl`/`resolveRuntimeZCodeEndpointOrigin` 等）仍有官方 MCP、CLI 运行时路径等活消费方，保留但自托管应显式设置 `ZCODE_ENDPOINT_ORIGIN` | 帮助菜单不再跳 Z.ai 文档站；webview/业务域白名单随待确认项保留为惰性规则 |
| 自动更新源 | ✅ 已完成（2026-09-27）：自动更新**默认关闭**——打包产物按既有安全策略忽略 feed 覆盖，永远打 `zcode.z.ai` 默认源，存在把 fork 更新回上游的风险；现在仅当显式配置 `ZCODE_UPDATE_FEED_URL` / `--zcode-update-feed-url` 时才启用 updater，「检查更新」菜单保持可见但置灰 | 自托管默认不再向任何远端做版本检查；需要更新能力时指向自有 feed |
| 待确认 | ✅ 已确认（2026-09-27）：三者均为 CodingPlan 嵌入式 webview / 支付中转（PayPal approveUrl 302 到 api.z.ai）的导航白名单与遥测标签链路，随账号摘除已不可达，但文件同时承载窗口管理、Playwright locator 执行、远程 IPC 等非账号功能——保留原状，白名单成为惰性安全规则；彻底删除随 UI 账号区 / 只留桌面端清理 | 无行为影响 |

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


## 3. 只留桌面端 —— 已完成（2026-09-27）

- 删除 `packages/web`、`packages/server`、`packages/zcode-server-cli` 三个包；
  `zcode --web` 的发行打包入口（`scripts/build-zcode.mjs`、`scripts/zcode-distribution/`、
  smoke 脚本）随 Web/Server 一起删除，CLI 只保留 TUI 与 app-server/agent-server 协议模式
  （桌面端仍在用，不删）。根 `package.json` 的 `dev:web`/`dev:server`/`build:zcode`/
  typecheck 列表同步清理，lockfile 已重整。
- SSH-WSL/Docker 远程工作区链路整体摘除（见第 2 节「OAuth / 账号登录」下方记录）：
  远程会话管理、远端服务集合、连接向导 UI、Bot 远程桥、SSH/WSL 资产部署全部删除。
- locale 存储键已统一为 `dweis-locale` / `dweis-locale-preference`。
- 保留的历史数据兼容层：`remoteTarget.ts`（RemoteTarget 类型，CLI v4 协议要解析旧
  session 的 remote identity）、`remote-workspace-identity.ts`（旧 sqlite/settings 行
  判定，防同路径实体串键）、`workspaceTelemetryDetail.ts`（埋点载荷形状，随遥测空转）。
- 有意保留的被动透传：UI 里约 200 处 `remoteSessionId?: string` 可选字段（本地也用同一
  WorkspaceTab 类型，且 provider 侧仍解析旧协议数据）；后续如要彻底清理可单独一轮。
- 剩余一项随打包重构处理：`remoteCdn.ts` 负责的运行时资产下载（生产态官方插件包/
  node 运行时路径）在本次删除后失去来源，packaged 构建时需确认两个官方插件的装载方式
  （本地 seed 是否覆盖），再决定是否保留模块。

## 4. 推到远端

- 远端 `3d-jq/DWeis-Next`：旧 opencode 代码已推到 `legacy-opencode` 分支；新的 fork 主线还在本地（浅克隆导致 force push 失败过，需要完整历史 clone 才能推）。
- 用户偏好：本地提交为主，推送由用户决定。
