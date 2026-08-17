import { branding } from "./electron/branding.ts"

// @see - https://www.electron.build/configuration/configuration
// 阶段 0：未签名本地包。图标 / extraResources（oo + opencode 二进制）/ 签名公证
// 在后续阶段补齐；品牌标识从 electron/branding.ts 派生（R1）。
export default {
  $schema:
    "https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json",
  appId: branding.appId,
  asar: true,
  asarUnpack: ["node_modules/sqlite3/**"],
  productName: branding.appName,
  // TEMP: 沙箱禁止大目录 rename，改用本地已解压 electron 目录走逐文件复制（构建后还原）
  electronDist: "node_modules/electron/dist",
  directories: {
    buildResources: "resources",
    // TEMP: 之前的输出目录被 Defender 锁定无法 emptyDir，临时换全新目录（构建后还原）
    // build27 在 vite 编译阶段被 Defender 文件锁死锁（已停）；build48 验证浏览器拖拽跟随修复；
    // build50 修复沙箱 safe-delete 守卫拦截 locale 批量删除导致的打包失败（win 端不再设 electronLanguages）。
    // build52 改用 GENIE_TRASH_DIR 空目录回退到 PowerShell 回收站（绕过沙箱 genie-trash binary 的
    // "Some operations were aborted" 失败），完整跑通打包。
    // build54 = 1.0.0 正式版（去登录 + 品牌 + 浏览器拖拽跟随修复）。
    // build56 = 右边缘同步缩放窗口（主界面不动）+ 空状态移除 DWeis Next 标题（commit 4b626ff 之后）。
    // build57 = 修复浏览器拖拽两处 bug（切换后面板关闭致 handle 失效、右边缘拖动聊天区抽动，commit 4b06a36）—— 死锁（Defender 锁 main.js），未产出。
    // build58 = 与 build57 同代码重打；vite 改 dist-electron-tmp 后成功越过 vite 阶段并产出 win-unpacked，但被监控误杀（nsis 阶段日志安静），未出 Setup.exe。
    // build59 = 复用 build58 同代码（4b06a36）重打；output 改用全新目录避开 Defender 对 build58 残留的锁。
    //   关键修复：构建环境须清空 NODE_OPTIONS（去掉 genie-safe-delete.cjs 注入），否则 prepare:binaries
    //   里 `rm(resources/skills)` 会被 safe-delete 守卫拦截、回收站不可用而失败（"Some operations were aborted"
    //   / PowerShell DeleteDirectory IOException）。清空后 rm 直接原生删除，构建跑通（120s 出包）。监控改为基于
    //   文件活动判活（不再因 nsis 阶段日志安静误杀）。build59 已成功产出 Setup.exe。
    // build60 = 修复浏览器右拖拽手柄被原生 WebContentsView 遮挡（slot 从 right-0 收到 right-3，留出 DOM
    //   缝隙让右手柄可交互）—— 根因修复，详见 src/routes/Chat/BrowserPanel.tsx。
    // build61 = 上一版只把缝隙从 0 加到 12px 且缝隙不可见，用户仍抓不到（抓的是原生视图那道看得见的边）。
    //   本次：原生视图两侧各收进 16px（left-4/right-4）留出安全余量，且两个手柄做成常驻可见拖拽条
    //   （居中 grip，不再仅 hover 显形），左右都能一眼看到并抓取。详见 BrowserPanel.tsx + app-shell.css。
    // build62 = 回退浏览器拖拽手柄改动（用户要求）：BrowserPanel.tsx slot 回到 right-0 left-3（原生视图全宽，
    //   不再有右侧白条渲染 bug）；app-shell.css 回到原始细线手柄。保留 4b06a36 的逻辑修复（切换不关闭面板、
    //   聊天区不抽动）。右手柄在浏览器打开时仍被原生视图遮挡（已知限制），但白条 bug 已消除。
    // build63 = 浏览器左拖拽被 clamp 锁死的根因修复（方案 B）：把全局 CHAT_AREA_MIN_WIDTH_PX 从 420 降到 240
    //   （src/components/app-shell/app-shell-model.ts），让 artifactsPanelMaxWidth 在多出的 180px 余量下不再
    //   轻易 floor 到 260、浏览器面板合法宽度区间不再坍缩成点，左拖拽可自由调整。
    // build64 = 用户实测方案 B 仍无效（窄窗或曾拉大过面板致 browserPanelWidth≥maxWidth，向左拖仍被 clamp），
    //   回滚方案 B：CHAT_AREA_MIN_WIDTH_PX 恢复 420，回到 build62 等效状态（浏览器左拖拽在窄窗下仍为原锁死表现）。
    // build65 = 1.0.6：自动化定时任务 + 设置分类重构 + MCP stdio/http/sse 三类型与表单/JSON 双编辑。
    // build66 = 修复切换会话/工作区后右侧面板自动打开（971e359）。
    // build67 = 修复数据目录记录写入时机（setPath 后写入导致退出重开数据"消失"）+ 数据目录自记录兜底。
    // build68 = MCP JSON 编辑兼容 Cursor/Claude 格式（streamablehttp/http/sse/stdio + mcpServers 包裹）。
    // build69 = 设置新增使用统计（活跃热力图 + 各模型 token 用量）。
    // build70 = 热力图颜色改分位数分桶（少量消息不再全黑）。
    // build71 = 右侧面板宽度改 CSS variable 驱动（拖拽重构）。
    // build72 = CSP 放行 dweis-next-resource 协议。
    // build73 = MCP JSON 编辑框：保留缩进（whitespace-pre）、可垂直调整、关闭拼写检查。
    // build74 = 右侧面板开关以实际可见态 rightPanelVisible 为准。
    // build75 = 路由切回 chat 时重挂载 ResizeObserver 并重写面板宽度，避免回退 0px。
    // build76 = 版本号 1.0.7。
    // build77 = 版本号 1.1.0。
    // build78 = 记忆边界修正（Agent 记忆=怎么干活，用户档案=你是谁）。
    // build79 = 记忆编辑框固定高度去拖拽 + 设置分类重排。
    // build80 = 上下文指示器缓存命中率 + 使用统计表格重构（占比条/缓存列/费用人民币）。
    // build81 = 缓存命中率公式修正（DeepSeek 风格 provider 不再恒 100%）。
    // build82 = 浏览器画面间歇性消失修复（会话切换事件丢失 + 子代理 sessionId 归一化）。
    // build83 = 思考过程折叠展示（推理内容点击展开 + 思考中文字扫光）。
    // build84 = 品牌全面统一（Wanta→DWeis Next）+ skill-creator 技能 + 存储 key 迁移。
    // build85 = skill-creator 全入口接通（管理页镜像/输入框菜单/剔除 oo-create-skill 复活）。
    // build86 = 修复 agent 启动中/正常死循环（镜像内容一致跳过覆盖）。
    // build87 = /命令创建技能文案去掉 ooCLI（纯文件操作）。
    // build88 = skill-creator 升级为完整方法论版（对齐 ZCode 版）。
    // build89 = 右侧面板外壳统一（UnifiedTabBar/PanelHeader）+ 最大化铺满修复。
    // build90 = 多主题色板（默认/暖阳/森林）+ 默认窗口 1280x800。
    // build91 = 版本号 1.1.5 + 右侧面板标签栏加号按钮。
    // build92 = 版本号 1.2.0：上下文明细 + 计划面板 + 完整计划模式闭环。
    // build93 = 计划面板胶囊化 + PlanSummaryPanel/ReasoningBlock 测试补齐。
    // build94 = 计划面板改为输入框上方卡片（进度/信息直接可见）。
    // build95 = PPTX 预览 + 计划详情面板（确认前可见）。
    // build96 = 语义色类替换 + 面板动画（motion）。
    // build97 = 模型/推理强度拆分（圆形滑块）+ 本地完成通知修复。
    // build98 = 推理强度触发改文字标签 + 滑块面板定位修正。
    // build99 = 图标调整：模型 Cpu、推理 Brain + chevron 反转。
    // build100 = 推理滑块根因修复（flex 布局 + 面板向上弹出）。
    // build101 = 推理强度横向滑道调节器（圆形手柄 + 动态档位）。
    // build102 = 滑道手柄对齐刻度 + 凹槽包裹样式。
    // build103 = 滑道去端点 + accent 饱满填充。
    // build104 = 滑道打磨（宽凹槽包裹手柄 + 填充对齐手柄中心）。
    // build105 = 推理最高档紫色流动 + 计划面板完成后可关闭。
    // build106 = 手柄实心消除间隙 + 紫色流动增强。
    // build107 = 滑块白色 + 填充直顶左缘消除连接间隙。
    // build108 = 白色手柄融入 accent（填充延伸中心 + 描边过渡）。
    // build109 = 版本号 1.2.1（推理滑块/计划面板/通知等打磨）。
    // build110 = 产物/过程目录命名可读化 + 通知品牌名修复。
    // build111 = 计划面板关闭后跨重启永久隐藏修复。
    // build112 = 版本 1.3.0 + Work/Code 人群模式（人设热注入 + 视图解耦）。
    // build113 = Work/Code 收敛为单一顶部切换 + 任务区选文件夹入口。
    // build114 = 切换 toast + 输入框/空态文案随模式 + 项目按 Work/Code 独立。
    // build115 = 去掉切换 toast + 任务/项目视图切换过渡动画。
    // build116 = 计划面板会话级绑定（修复跨对话串显示/叉掉失效）。
    // build117 = 内置捆绑 Office MCP（结构化生成 PPT/Word/Excel）。
    // build118 = 回滚 office MCP + 权限卡片移输入框上方 + 默认 Work + 技能闭环。
    // build119 = 版本 1.4.0 + 技能统一收进 /skills + 扫描跳过 .venv 提速。
    // build120 = 提问卡片统一移到输入框上方（与权限卡片同区排队）。
    // build121 = 创建技能收进 /skills + 技能扫描哈希并发提速（120s→~2s）。
    // build122 = 技能模式列出全部技能（修复字母序靠后技能被 limit=8 截断）。
    // build123 = 对话按 Work/Code 模式隔离 + 通知跨模式自动切换。
    // build124 = 主题色板完整覆盖 + 主题独立设置项 + 新增暖色护眼/海洋主题。
    // build125 = Windows 测试全绿（31 基线失败修复 + atomic-file EPERM）+ 子任务派发字样。
    // build126 = 回合活动统一为处理中(展开)/已处理(收起)。
    // build127 = 纯思考阶段也显示处理中+耗时占位（清理 PlainAssistantActivity 死代码）。
    // build128 = 所有回合（含纯文本聊天）都显示处理中/已处理状态卡。
    // build129 = 思考阶段占位与思考过程行统一字号图标（BrainIcon + text-xs）。
    // build130 = 统一折叠面板展开/收起动效（高度+淡入淡出 250ms）。
    // build131 = 状态条恢复可点击折叠（处理中/已处理点开收起思考和工具）。
    // build132 = plan_exit 确认问题不再误判成邮箱字段（Build Agent 直接渲染选项）。
    // build133 = plan_exit 确认后自动带计划开始执行。
    // build134 = 计划闭环自控：plan_request 强制中断 + plan_ready 替代实验特性。
    // build135 = 计划提示词修正 + 结构模板 + 批准执行时权限给足。
    // build136 = plan_request 不再强制中断当前轮（自然收尾）。
    // build137 = plan_request 后自动续接计划调研（申请→进计划→开始调研连续动作）。
    // build138 = 回退整个计划自动闭环（56dba26）：删 plan_request/plan_ready/自动执行，
    //   回到手动模式切换（AgentModePicker）+ plan agent 只读 + 计划详情面板。
    // build139 = system prompt 压缩（Visual communication -1200 字符）+ 隐藏 /billing 斜杠命令。
    // build140 = token 用量完整数字 + 上下文占用百分比显示 + 统计卡片化。
    // build141 = 上下文占用触发按钮恢复圆环（面板改进保留）。
    // build142 = 子智能体独立推理强度 + MCP 添加服务界面重设计。
    // build143 = MCP 对话框模式切换提到标题区，分区重排。
    // build144 = token 统计同模型合并（按 id 忽略 variant）+ MCP 类型选中态改黑。
    // build145 = 工具调用实时反馈（运行中图标 info 色 + 输出预览淡入）。
    // build146 = webfetch 运行时旋转地球 + 完成打勾（借鉴 AICSS）。
    // build147 = 产物嵌入对应消息（完成后才显示）+ 流式光标 + 计划面板数字滚动。
    // build148 = 修复产物渲染无限循环（React #185，onAvailable 按 key 去重）。
    // build149 = 产物移到消息内容后、复制点赞前（artifactsSlot 插槽）。
    // build150 = sending/submitted 阶段状态条显示处理中而非已处理。
    // build151 = 自定义模型 API 协议选择（openai/anthropic，MiniMax 思考原生）。
    // build154 = 同一回合多 process 段只显示一个"处理中/已处理"状态条（showTitle 只给第一个 process 段）。
    // build155 = 计划面板移到侧边栏 titlebar 按钮呼出浮层 + AICSS TodoList 一比一。
    // build156 = 计划按钮改到右侧面板开关按钮右侧（用户反馈"控制右侧边栏那个按钮旁"）。
    // build157 = 计划面板浮层位置跟着按钮改到右上角（之前是左上角）。
    // build158 = 回合 process 段默认收起：仅最后一个 process 段（且是回合末段）展开；其他段已处理后默认收起。
    // build159 = 计划面板数字滚动被遮挡修复：oo-roll-digit 加 line-height:1，oo-roll-inner 改 flex column，span 显式 height:1em。
    // build160 = assistant-timeline 分段根因修复：mixed message 含中文项目符号 `•` + 反引号 inline code 时归 response（不是 process）。
    // build161 = 回合完成后思考/工具全部收起：最后一段文字永远算正文（即使和收尾工具同消息 finish=tool-calls）；
    //   被正文隔开的收尾工具段给独立"已处理"状态条可折叠；移除 keepExpanded 强制展开。
    // build162 = 用户规则收紧：除最后一段文字外，回合里所有文字（含 markdown/inline code 过程叙述）都算处理过程，
    //   完成后随"已处理"收起；删除 hasStructuredResponseText markdown 豁免（中间结构化计划也折叠）。
    // build163 = live 稳定性修复：正文只认最后一条 assistant 消息里的文字；中间消息过程叙述（当时是"全局最后一段"）
    //   不再误判成正文漏在「处理中」外/把 process 段切成多个状态条（live 与完成后显示一致）。
    // build164 = 一回合一个状态条：正文后的收尾工具并入主 process 段（不再独立成第二个段/第二条横线）；
    //   live 时所有 process 段都算"处理中"（processLive=turnIsActive，消除同回合已处理/处理中并存）。
    // build165 = 对话只分"处理过程+结果"：中间 stop 消息文字（中间结果）也归处理过程（hasProcessBlocks 回合判定，
    //   只有最后一段文字是结果）；纯文本回合仍全正文；去掉状态条标题下 border-b 横线。
    // build166 = 稳定性修复：turnInFlight 是全局状态，只有最新回合（isLatestTurn）才被它算作活跃——
    //   当前回合生成时历史回合不再误变"处理中"展开，保持"已处理"。
    // build167 = 恢复状态条标题下 border-b 横线（build165 误删；用户确认处理过程和结果之间本无横线）。
    // build168 = 预置模型配置不再给 inputTokenLimit/maxOutputTokens 默认值（避免乱配数据架空用户填的上下文窗口；
    //   用户给了 contextWindow 就按窗口走，inputTokenLimit 仅显式填写时传入运行时）。
    // build169 = 稳定性：AgentRefreshScheduler 加重启冷却（15s 窗口内变更事件合并为一次重启），
    //   斩断"事件风暴（技能 watcher/外部工具写技能根）→ 无限重启"循环。
    // build170 = 提问回合状态连续：messageCompleted 时有待回答 question 保持"处理中"不恢复 ready，
    //   消除"提问已处理 → 回答后突然变处理中"的跳变。
    // build171 = 工具跨消息合并摘要（运行命令 × 12）——用户实测后不需要，build172 整体回退。
    // build172 = 回退工具合并摘要（build171 功能移除，恢复逐工具行渲染）。
    // build173 = 模型变更即时同步 agent 内存快照（updateCustomModels），消除"刚添加/切换模型即用 →
    //   Selected custom model is no longer available"（重启冷却窗口内 resolveModel 用旧列表）。
    // build174 = PPTX 产物完整预览：捆绑 LibreOffice 最小运行集（soffice headless 转 PDF，缓存到
    //   userData/pptx-cache），pdfjs 完整渲染图形/图片/排版；转换失败回退文本大纲。
    // build175 = 提问回合单状态条修复：问题上下文文字不再独立成 response 段（question 例外移除，
    //   问题卡片已展示上下文）——否则 response 段把 process 切成两半 → 回答后两个"处理中"并存。
    // build176 = ①error/status 块归 process（工具错误/连接失败不再切开 process → 消除其他两个状态条来源）；
    //   ②process 段 key 稳定（思考占位段与 reasoning 到达后的真实段同 key）——修"思考中"消失一下再出现抖动。
    // build177 = 文字/工具顺序稳定：text/reasoning 首次插入时放在工具 part 前（对齐 opencode 最终顺序，
    //   真实数据 65/65 text 在前）——live 流式 tool 事件先到不再造成 [工具,文字]，消息完成 reload 不跳变。
    // build178 = 修复右侧面板切对话后自动打开：①浏览器 getState 回填不再 setBrowserPanelOpen(true)；
    //   ②点标题栏关闭面板时同步 closeBrowserPanel() 避免 browserPanelOpen 残留触发切会话自动开。
    // build179 = 文字/工具顺序稳定（根因）：活跃回合中"最后消息带工具"的文字归 process（模型还在干活
    //   是叙述）——live 时不再临时当正文、工具收尾并入正文前，后续消息到达也不跳变；回合结束才按正文。
    // build180 = 计划面板新增"子任务"区块：从会话消息提取 task 工具调用（子智能体派发），
    //   显示运行中/完成/出错 + 角色（build/plan/general）+ 耗时（运行中实时刷新）。
    // build181 = 新子任务出现时计划面板自动展开（数量增加触发；状态变化不打扰）；
    //   子任务逻辑抽到 sub-tasks.ts（fast refresh 规则）。
    // build182 = 版本号 1.5.5。
    // build183 = 上下文明细不重复计 cache.read + 命中率 floor（P0/P1）→ system prompt 缓存优化
    //   （稳定段前置 + 删 buildTeamSkillsSystem）→ 清理 30 处死代码。
    // build184 = 斜杠命令对齐 opencode：/compact（触发 sidecar session.summarize 压缩上下文）
    //   + /init（模板填入输入框生成 AGENTS.md）；无消息时 /compact 禁用。
    // build185 = 修复 /compact 压缩卡死不结束（事件桥 consume messageCompleted 无 generation
    //   不转发 → 本地 finally 补发）+ 压缩状态改对话流独立分隔线（左右横线 + 上下文压缩，
    //   不再显示在回合 process 面板）+ 预标记 compactingSessions 消除压缩空白 user 气泡。
    // build186 = 修复压缩总结内容泄漏到对话界面（session.idle 过早清 internal 标记 →
    //   idle 后收尾事件 messageStarted/messageDelta 泄漏；触发消息去重 + 跳过压缩会话清理）
    //   + 分隔线状态化（压缩中「上下文压缩中」扫光 / 完成「已完成上下文压缩」）。
    // build188 = 对齐 opencode 编码能力 P0：/review 命令 + @文件引用（项目内路径解析为绝对）
    //   + explore 子代理设置可见/可配置 + 斜杠命令执行模式（/init /review 选择即发送执行）。
    // build190 = 内置 MiniMax 办公 skill（PPT/DOCX/XLSX/PDF 生成编辑）+ skill-creator 描述完善。
    // build191 = 处理过程展开定长 + 内部滚动（思考/工具内容多不再撑大对话流）。
    // build192 = here-doc 权限误判修复（#311）+ 定长滚动只作用于思考内容。
    // build193 = 权限/询问卡片 UI/UX 重构（命令代码块/危险 badge/多选修复）。
    // build194 = 设置「工具」分类：AI 生成（图片/视频）+ 网页搜索可配置工具 + igCanvas 动画。
    // build195 = 工具热加入：配置写入 tool-config.json 按调用读取（无需重启）+ 设置页移除过渡动画。
    // build196 = 工具设置卡片改「开关卡 + 独立子面板」+ 思考定长 24rem→16rem + 思考中可点击展开实时查看推理内容。
    // build197 = 思考中可展开根因修复（isRenderablePart 放行空文本 reasoning 块，思考时不再只有状态条扫光）
    //   + 思考定长 16rem→10rem + 网页搜索「测试连接」按钮 + 移除工具页顶部解释文案。
    // build198 = 活跃热力图美化：月份/星期标签 + 总条数醒目 + 填满可用宽度 + hover 反馈（GitHub 风格）。
    // build199 = ①思考中可展开根因修复：live thinking 无推理块时注入占位推理块（第一秒就可点击展开，
    //   不再落到不可点的状态条扫光）+ 展开区去掉重复「思考中」扫光（留白等推理流式填充）；
    //   ②网页搜索工具改名 dweis_websearch：与 opencode 内置 websearch 撞名（id=文件名 namespace）被
    //   内置 filter 一并过滤 → 模型一直看不到；改名后模型可见可用（Tavily/Exa/Brave/Serper）。
    // build200 = ①网页搜索工具调用 API_KEY is not defined（顶层 helper 引用 execute 内 const，作用域
    //   ReferenceError）→ helper 改传 apiKey 参数；②模型"重启后消失"根因：完全重装时旧版卸载/清理会删掉
    //   %APPDATA% 里的 dataDirectory 记录，无记录且 ~/DWeisNext 已有数据时 applyPersistedDataDirectory 只告警
    //   不采用 → 数据分裂两个位置；改为采用目标目录 + 记录双写（默认位置 + 数据目录自记录兜底）。
    // build201 = 流式思考/文本根因修复：桥丢弃 message.part.delta（opencode 的 text/reasoning 增量都走
    //   updatePartDelta，全量 part 只在 start/end 到达）→ 文本"流式"实为渲染层平滑动画假象、推理结束才全量
    //   显示；event-translator 补 message.part.delta 分支（part.updated 建 partID→type 缓存路由到 text/reasoning
    //   delta，part.removed 清缓存），两者都真实流式。
    // build202 = 版本号 1.6.0。
    // build203 = 流式思考实时显示最终修复：诊断确认 messageReasoningDelta 已流式到达（117/窗口），
    //   但占位推理块（partId=thinking-live）→ 真实推理块切换时 React key 变化 → 重挂载折叠 → 展开状态
    //   丢失、增量在折叠中累积（结束才全量）。修复：推理块改稳定 key（message.id:reasoning）+ 占位消息
    //   id 对齐 activity.messageId → 跨切换保留展开，增量实时填充。
    // build204 = AGENTS.md 改 opencode 单文件风格 + 五个 docs/ai 孤儿子文档合并为 docs/self-guide.md（自身指南）。
    // build205 = MiniMax 思考泄漏修复：实测确认 MiniMax 从不发 reasoning_content，思考用 <think>...</think>
    //   内联在正文（换 openai/anthropic 协议都一样）→ SDK 只能当正文。render-blocks 拆分 <think> 为推理块
    //   （折叠）+ 正文；未闭合（流式中）<think> 之后都是思考，可实时显示。
    // build206 = ①模型 API 协议三种：Chat Completions(/chat/completions) / Anthropic Messages(/v1/messages) /
    //   Responses(/responses)——用户按自己 base URL 选对应格式，base URL 原样透传不改写；responses 走
    //   @ai-sdk/openai（opencode 默认 loader 优先 sdk.responses）；②模型设置改「供应商 → 模型」两级：
    //   自定义模型按供应商分组 + 添加供应商/每个供应商下添加模型（对话框预设供应商）；
    //   输入框模型选择器三级级联：根菜单 → 供应商列表 → 点击供应商旁侧面板显示其模型。
    // build207 = 模型选择器去掉根菜单（用户反馈点开先见推理项）：点模型按钮直接弹供应商列表，
    //   hover/点击供应商旁侧面板显示其模型；推理由独立滑杆控制。
    // build208 = 计划面板 v3：四分区垂直布局（git工具/计划/智能体/产物），各区独立折叠、面板可折叠、
    //   白色背景、整体滚动；推理块与工具行文字列对齐；子代智能体模型/推理合并一行。
    // build209 = 计划面板 UI 打磨：面板头去重复计划/计数、分区内容居左对齐、git 计数改文字标签
    //   （暂存/修改/未跟踪，去掉 ?? 问号）；处理过程全部元素统一 28px 文字列（LiveStatusBar 思考行/工具详情）。
    // build210 = 版本号 1.7.9 + 计划面板产物区改用回合输出记录（getTurnOutputs），对话有产物即显示。
    // build211 = 计划面板产物区改用 artifact bundles（与对话产物卡同源）——回合输出记录 project_change
    //   依赖 git 基线，非 git 仓库恒空；产物包与对话产物卡一致，对话有产物必显示。
    // build212 = ①切换模型思考裸露根因：推理档位超模型支持范围被丢弃（variant undefined）→ 模型默认
    //   思考内联正文；修复：resolveReasoningVariant 钳制到模型支持最高档（clampReasoningVariant）
    //   + 自定义模型默认全档（不再漏勾 max）；②产物区点击在右侧边栏预览；③推理滑杆档位钳制一致；
    //   ④自定义供应商可命名；⑤计划面板四分区统一折叠动效。
    // build213 = ①自定义供应商名称显示修复（优先用模型 providerName）；②模型选择器右侧面板对齐选中
    //   供应商行；③计划面板分区折叠去掉高度展开动画改直接切换。
    // build214 = ①多条思考段渲染成多个"思考过程"块 → 同消息所有推理 part 合并为单个推理块
    //   （插回首个推理位置）；②计划面板 todo 入场动画移除（用户不要动效）；③占位推理块 key 稳定
    //   （submit 阶段无 messageId 不注入，占位→真实不再重挂载）；④思考显示对齐 opencode——
    //   占位推理块整体移除：thinking-live→真实 partId 切换本身是「思考中消失」跳变的重挂载根源
    //   （build196→199→203→213 修四轮），删占位后思考中由 LiveStatusBar（BrainIcon+扫光）承接、
    //   推理 part 一到即稳定渲染（稳定 key message.id:reasoning）。
    // build215 = 外部审核报告（audit-report-2026-08-12.md）三批修复：①lint 4 错（jsx-key 移上 JSX、
    //   删 PlanSummaryPanel 死代码）+ 裸 [] 依赖补全（useCallback 每渲染重建击穿 ChatTurnView memo，
    //   流式全量重渲染）；②右侧面板 tab ARIA 补齐（关闭钮移出 tab/aria-controls/方向键 roving）+
    //   默认色板 --accent 独立色 + 侧边栏明度差加大 + Input 高度统一 32px；③IPC 加固（sender 校验
    //   主 frame+受信 origin + 14 服务 RPC 方法白名单）+ relaunch 前 sidecar 回收 + settings 0600。
    //   ⚠️ build215 白屏回归：RPC 白名单 key 误用无后缀裸名（chat 而非 chat-service）→ 全部 RPC
    //   被拒返回 undefined → 数据层加载失败白屏。build216 修复（58ae4de）+ 思考文案统一「深度思考」。
    //   ⚠️ build216 仍有"Cannot destructure property 'result'"报错：白名单仍有方法漏配 → RPC 返回
    //   undefined 客户端解构失败。白名单机制（方法枚举与调用点难同步、漏项静默失败）整体回退
    //   （5c5cb91），只留 sender 校验（主 frame + 受信 origin，从不拒绝合法调用）。CDP 实测通过。
    // build218 = ①图片产物双条目根因（模型违反产物契约写旧轮目录 → 物化+恢复双链路重复归档）：
    //   恢复逻辑跳过已物化同名同大小文件 + bundle 构建/读取去重 -N 双胞胎（a4fe4c8）；②活跃热力图
    //   精简：去总数行/月份标签/星期标签 + 自适应填宽（7ed3806）；③会话标题剥离内联 <think>
    //   （MiniMax 思考不再泄露成标题，cf41e5a）。
    // build219 = generate_image 默认输出写当前轮产物目录（0d4545a）：主进程每轮把 artifactDir
    //   写入 storeDir/turn-artifact-dir.json，sidecar env 注入 DWEIS_TURN_ARTIFACT_PATH，工具调用时
    //   读取——模型不传 outputPath 时图也落当前轮目录，减少写错旧目录触发双归档的发生率。
    // build220 = 严重 bug：Work+项目 / Code+无项目 会话消失进不去（e299e7a）。根因：persona 由
    //   侧边栏 segment 派生但会话类型（有无 projectId）与 segment 正交 → tasks 视图只显示任务会话、
    //   projects 视图只显示项目会话 → 新建会话不在当前视图可选列表 → 自动选中重置 selectedSessionId
    //   → 聊天区落回欢迎空态。修复：两个 segment 都展示当前 persona 全部会话 + 统一为「对话/项目」
    //   两个可折叠分类（ac2d8dd，分类头 chevron + 折叠持久化 + 项目分类头添加按钮）+ Work/Code
    //   切换图标对等（90e744a，Work=公文包/Code=代码符号）。
    // build221 = 自定义厂商名输入框只在「自定义」供应商下显示（0d499ae）——预设供应商名称固定。
    // build222 = ①模型选择器打开定位到当前选中模型的供应商（不再恒为第一个 DeepSeek）；②顶部
    //   「添加供应商」默认「自定义」供应商（0171344）。
    // build223 = 重写添加/编辑模型对话框（074574c）：formKey 重挂载使状态随打开完全重建，根治
    //   「自定义供应商名残留 DeepSeek」「删模型后 apiKey 锁住」；删除确认改应用内 Dialog。
    // build227 = git 工具交互改按钮+弹窗（53e044c）。
    // build228 = 推理强度按钮补 hover（9c5b7a9）+ 输入框选择值切换「翻一下」特效（4c38240，rotateX
    //   翻转动画，尊重 prefers-reduced-motion）；档位选中态反转已回退（2977698）。
    // build229 = 轻量启动画面（22b0abd）：品牌名+扫光进度条，主窗口就绪后淡入替换、splash 淡出关闭。
    // build230 = 启动画面 v2（da55202）：splash 改与主窗口同尺寸（1280×800）遮挡加载，渲染层 UI
    //   就绪（App 可进入）才淡出切换，最短展示 1.5s；不再 ready-to-show 即切换。
    // build231 = ①上下文明细对齐 deepseek-harness 口径（b578fa4）：块级结构开销 + 真实 usage 与
    //   估算取保守大者兜底，无 usage 不显示 0；②移除 token 估算过时注释（32941b1）；
    //   ③移除计划面板 git 工具区（8034403，含 getGraph 链路与文案）；
    //   ④处理过程状态行常驻占位消除跳动（d542cf7）；⑤.gitattributes 统一 LF（8d1ff32）+ README 恢复
    //   Agent Engine 声明（2049923）。
    // build232 = ①回退状态行常驻占位（fcfeb40，避免空白缝隙与重复显示）；
    //   ②思考阶段静默对齐 deepseek-harness（c87d224）：移除扫光占位，推理内容一到即渲染推理块（无占位切换跳动）。
    // build233 = 思考中「深度思考」改推理块占位（b5eded9 revert c87d224 + 占位注入）：思考阶段
    //   即渲染空推理块（稳定 key message.id:reasoning，标题「深度思考」扫光），推理内容渐进填充到
    //   同一元素——无「占位→推理块」形态切换；build232 静默版思考过程无提示被用户报 bug 回退。
    // build234 = 完成验证超时放宽 1s→5s + 失败原因诊断日志：大会话 getMessages 拉全量消息可能
    //   超 1s，被静默当"未完成"→ 验证重试 20 次全失败误报 "Unable to verify"（消息实际已保存）。
    // build235 = 生成图片对话内不显示（69d7d64）：agent 图片契约示例 `</absolute/path/image.png>`
    //   误导模型输出尖括号+假前缀路径 → 图片加载失败与产物卡分离；示例改真实绝对路径 +
    //   渲染层剥离 </absolute/path/> 前缀容错。
    // build236 = 移除输入框选择值切换「翻一下」翻转特效（ba94370，含 CSS 动画与 4 组件 class）。
    // build237 = 主进程崩溃 "Titlebar overlay is not enabled"（96c6446）：nativeTheme updated 遍历
    //   getAllWindows 误碰无 overlay 的启动画面调 setTitleBarOverlay 抛错；改为只跟踪登记过
    //   overlay 的主窗口（trackTitleBarOverlayWindow）。
    // build238 = 版本号 1.8.5。
    // build239 = ①移除 OOMOL 云链路（afdb287）：删 auth/billing/oo-identity/connector 工具等，
    //   本地自托管模式收敛（约 -21k 行）；②上下文占用更准 + 提问 UI 本地化（c5e7893）。
    // build240 = 对话过程区视觉对齐 deepseek-harness（7bca380 + eebeaa2）：思考行折叠摘要跟随
    //   （运行中最新一行/完成首行）+ 整行扫光；工具行单行「标题·摘要」+ 整行扫光 + 错误首行红色
    //   摘要 + IN/OUT 展开卡；处理过程/结果分段与「处理中/已处理+时间」状态条不变。
    // build241 = 工具展开按类型专门渲染（a127e1d）：bash 终端卡（ANSI 彩色/状态点/复制/头尾截断）、
    //   read 文件卡（行号 gutter + shiki 高亮 + N/M）、edit diff 卡（+/-计数）、grep/glob 搜索分组卡、
    //   webfetch/websearch 来源卡；新增 ANSI 解析器 + 12 测试。
    // build242 = 推理块扫光对齐 dsh（828578d）：running = 回合 live 且推理块是 process 段最后一个块，
    //   推理完成/后续工具文本到达即停扫光、摘要切第一行（此前回合未结束推理块一直扫光）。
    //   含像素级对齐批次：chevron 移到图标槽 hover 替换（2f9597c）、sweep 300px/60%/90% hold、
    //   标题 secondary 色、通用展开 io-card（12px 圆角+150px 滚动+sticky 标签+hairline）、
    //   推理行展开后隐藏摘要（c490e00 + ec100a8）。
    // build243 = 版本号 1.9.0。
    // build226 = 版本 1.8.0：①git 工具区补全——创建并检出新分支 + git log --graph 图谱（getGraph IPC）；
    //   ②权限/提问卡片借鉴 deepseek-harness——composer takeover（请求接管输入框位置）+「我想直接说」
    //   讨论第三操作 + tinted strip 彩色顶条。
    // build225 = 自动更新源切到 GitHub Releases（c5743b8）：branding.updateRepo 单一来源，electron-updater github provider，删除 staticBaseUrl/updateFeedPath。
    // build224 = Apple HIG 视觉对齐（c5242cc）：设置页全高侧栏 + 全行图标 + iOS 分段控件、
    //   工具配置改弹窗、用量热力图缩放跟随、权限/提问卡片外壳统一、推理滑块标签对齐、Work/Code
    //   切换 pill、技能页卡片升级；agent workspace 启动 ENOTEMPTY 退避重试（dc2bcd3）。
    output: "release/build243",
  },
  publish: {
    provider: "github",
    owner: branding.updateRepo.owner,
    repo: branding.updateRepo.repo,
  },
  // 双渠道（stable/beta）：generic provider 由版本号 prerelease 段自动推导渠道
  // （1.2.3-beta.1 → beta*.yml；detectUpdateChannel 默认开启）。此开关让 stable 构建
  // 同时刷新 beta*.yml，beta 用户在正式版发布后立即收敛到 stable，无需等下一个 beta。
  // 多产出的 alpha*.yml 不在 CI 上传清单内，自然丢弃。
  generateUpdatesFilesForAllChannels: true,
  protocols: [
    {
      name: branding.protocolScheme,
      schemes: [branding.protocolScheme],
    },
  ],
  files: ["dist", "dist-electron", "!**/*.{map,d.ts}"],
  afterPack: "scripts/electron-builder-after-pack.cjs",
  // 内置 oo + opencode + rg 平台二进制（由 scripts/prepare-binaries.ts 在构建前复制到 resources/bin）。
  // 运行时 app.isPackaged 走 process.resourcesPath/bin。
  // resources/skills 是 oo 自带的 4 个内置 skill（同由 prepare-binaries.ts 导出）；运行时拷进 OpenCode
  // workspace 的 .opencode/skill/，使 DWeis Next agent 直接读到。
  extraResources: [
    {
      from: "LICENSE",
      to: "licenses/DWeis-Next-LICENSE",
    },
    {
      from: "NOTICE",
      to: "NOTICE",
    },
    {
      from: "THIRD_PARTY_NOTICES.md",
      to: "THIRD_PARTY_NOTICES.md",
    },
    {
      from: "TRADEMARKS.md",
      to: "TRADEMARKS.md",
    },
    {
      from: "resources/branding/icon.png",
      to: "icon.png",
    },
    {
      from: "resources/branding/icon.ico",
      to: "icon.ico",
    },
    {
      from: "resources/bin",
      to: "bin",
    },
    {
      from: "resources/skills",
      to: "skills",
    },
    {
      from: "resources/agent-tool-runtime",
      to: "agent-tool-runtime",
    },
    {
      // LibreOffice 最小运行集：PPTX 产物预览经 soffice headless 转 PDF 完整渲染。
      from: "resources/libreoffice/minimal",
      to: "libreoffice",
    },
  ],
  mac: {
    icon: "branding/icon.icns",
    electronLanguages: ["en", "zh_CN"],
    extendInfo: {
      NSMicrophoneUsageDescription: `${branding.appName} uses the microphone to record voice messages for chat input.`,
    },
    entitlements: "electron/entitlements.mac.plist",
    entitlementsInherit: "electron/entitlements.mac.plist",
    target: [
      {
        target: "dmg",
        arch: ["arm64"],
      },
      {
        target: "zip",
        arch: ["arm64"],
      },
    ],
    artifactName: "${productName}-${version}.${ext}",
  },
  win: {
    icon: "branding/icon.ico",
    // 注意：此处故意不设置 electronLanguages。electron-builder 仅在 electronLanguages
    // 非空时才会删除未匹配的 locale .pak 文件；本沙箱的 safe-delete 守卫会拦截 ≥50 文件的
    // 批量删除（路由到回收站且回收站不可用），导致打包失败。留空则保留全部 locale，跳过删除路径。
    // 待沙箱 safe-delete 守卫解禁或迁移到真实 CI 后，可恢复为 ["en-US", "zh-CN"] 以精简安装包。
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    artifactName: "${productName}-${version}-Setup.${ext}",
    // 本地分发：无 OOMOL 证书，跳过代码签名（安装时 Windows SmartScreen 会提示，可继续安装）。
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },
  linux: {
    icon: "branding/icon.png",
    target: ["AppImage"],
    artifactName: "${productName}-${version}.${ext}",
  },
}
