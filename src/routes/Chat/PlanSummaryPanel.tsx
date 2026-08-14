import type { ArtifactBundle, ChatMessage, LocalArtifactGroup } from "../../../electron/chat/common.ts"
import type { ArtifactSelection } from "./GeneratedArtifacts.tsx"
import type { SubTask } from "./sub-tasks.ts"

import {
  Bot,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  FileText,
  Files,
  ListTodo,
  Loader2,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { useArtifactBundles } from "./artifact-bundle-records.ts"
import { subTasksFromMessages } from "./sub-tasks.ts"
import { useChatService } from "@/components/AppContext"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

interface TodoItem {
  content: string
  status?: string
  priority?: string
}

const planPanelDismissedSnapshotKey = "dweis:chat:plan-panel-dismissed-snapshot"
const planPanelBodyCollapsedKey = "dweis:chat:plan-panel-body-collapsed"

/** 分区折叠状态的 localStorage 前缀（按会话隔离）。 */
const planSectionCollapsedKeyPrefix = "dweis:chat:plan-section-collapsed"

type PlanSection = "plan" | "agents" | "artifacts"

/**
 * 计划面板状态按会话隔离：折叠/关闭快照都以 sessionId 为后缀存 localStorage，
 * 不同对话互不影响（旧的全局 key 只作无会话时的兜底，不复用老数据）。
 */
function planPanelStorageKeys(sessionId: string | null): {
  dismissedSnapshot: string
  bodyCollapsed: string
} {
  const scope = sessionId ?? "draft"
  return {
    dismissedSnapshot: `${planPanelDismissedSnapshotKey}.${scope}`,
    bodyCollapsed: `${planPanelBodyCollapsedKey}.${scope}`,
  }
}

function planSectionStorageKey(sessionId: string | null, section: PlanSection): string {
  return `${planSectionCollapsedKeyPrefix}.${section}.${sessionId ?? "draft"}`
}

function isTodoItem(value: unknown): value is TodoItem {
  return typeof value === "object" && value !== null && typeof (value as TodoItem).content === "string"
}

/** 取会话里最新一次 todo 工具调用的任务清单（todowrite 每次携带完整列表）。 */
function latestTodoList(messages: ChatMessage[]): TodoItem[] | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    for (let j = messages[i].parts.length - 1; j >= 0; j -= 1) {
      const part = messages[i].parts[j]
      if (part.kind === "tool" && part.tool?.startsWith("todo")) {
        const todos = (part.input as { todos?: unknown } | undefined)?.todos
        if (Array.isArray(todos) && todos.every(isTodoItem)) {
          return todos
        }
        return null
      }
    }
  }
  return null
}

/** 产物文件：名称/大小 + 打开右侧预览所需的选择信息。 */
interface ArtifactFileEntry {
  name: string
  mime: string
  size: number
  messageId: string
  group: LocalArtifactGroup
  path: string
}

/** 从 artifact bundles 取产物文件（与对话产物卡同源，按会话+路径去重）。 */
function artifactItemsFromBundles(bundles: ArtifactBundle[]): ArtifactFileEntry[] {
  const seen = new Set<string>()
  const files: ArtifactFileEntry[] = []
  for (const bundle of bundles) {
    for (const item of bundle.items) {
      const key = `${bundle.sessionId}:${item.path}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      files.push({
        name: item.name,
        mime: item.mime,
        size: item.size ?? 0,
        messageId: bundle.messageId,
        group: { items: bundle.items, totalItems: bundle.totalItems, truncated: bundle.truncated },
        path: item.path,
      })
    }
  }
  return files
}

const cls = (base: string, on?: boolean) => base + (on ? " on" : "")

const CheckIcon = ({ on }: { on?: boolean }) => (
  <svg className={cls("oo-todo-icon", on)} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ArrowIcon = ({ on }: { on?: boolean }) => (
  <svg className={cls("oo-todo-icon strong", on)} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="m12.75 15 3-3m0 0-3-3m3 3h-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const DashedIcon = ({ on }: { on?: boolean }) => (
  <svg className={cls("oo-todo-icon", on)} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeDasharray="1.8 3.6"
      strokeLinecap="round"
    />
  </svg>
)

const ChevronIcon = () => (
  <svg className="oo-todo-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="m19.5 8.25-7.5 7.5-7.5-7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** 分区头：图标 + 标题 + 右侧状态/计数 + 折叠 chevron。 */
function SectionHeader({
  icon,
  title,
  meta,
  collapsed,
  onToggle,
}: {
  icon: React.ReactNode
  title: string
  meta?: React.ReactNode
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onToggle}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="oo-text-label min-w-0 flex-1 truncate text-foreground">{title}</span>
      {meta ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{meta}</span> : null}
      <ChevronDown
        className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-180")}
      />
    </button>
  )
}

/** 分区内容容器：直接切换（无高度展开动画，用户不需要顶部往下平滑展开效果）。 */
function SectionBody({ open, children }: { open: boolean; children: React.ReactNode }) {
  return open ? <div className="min-h-0">{children}</div> : null
}

/**
 * 浮层计划面板（聊天区右上角，侧边栏计划按钮呼出）：git工具 / 计划 / 智能体 / 产物 四分区垂直布局，
 * 每区独立折叠，面板本身也可折叠成一条，内容超出整体滚动。样式随聊天背景（白）。
 * 模型通过 todo 工具维护任务清单时显示计划区；有子任务/产物/git 变更时对应区自动出现。
 * 用户关闭（open→false）后若 agent 更新了本会话的 todo 列表（快照变化）→ 自动重新呼出。
 */
export function PlanSummaryPanel({
  activeSessionId,
  className,
  messages,
  onOpenArtifact,
  onOpenChange,
  open,
}: {
  activeSessionId: string | null
  className?: string
  messages: ChatMessage[]
  /** 点击产物文件时在右侧边栏打开预览（AppShell 的 handleArtifactsOpen）。 */
  onOpenArtifact?: (selection: ArtifactSelection) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const t = useT()
  // 父组件用 key={activeSessionId} 强制切会话重挂载，这里按当前会话读取各自的折叠/关闭状态。
  const storageKeys = React.useMemo(() => planPanelStorageKeys(activeSessionId), [activeSessionId])
  const [dismissedSnapshot, setDismissedSnapshot] = React.useState<string | null>(() =>
    localStorage.getItem(storageKeys.dismissedSnapshot),
  )
  const [bodyCollapsed, setBodyCollapsed] = React.useState(
    () => localStorage.getItem(storageKeys.bodyCollapsed) === "1",
  )
  const [sectionCollapsed, setSectionCollapsed] = React.useState<Record<PlanSection, boolean>>(() => ({
    plan: localStorage.getItem(planSectionStorageKey(activeSessionId, "plan")) === "1",
    agents: localStorage.getItem(planSectionStorageKey(activeSessionId, "agents")) === "1",
    artifacts: localStorage.getItem(planSectionStorageKey(activeSessionId, "artifacts")) === "1",
  }))
  const [planText, setPlanText] = React.useState<string | null>(null)
  const todos = React.useMemo(() => latestTodoList(messages), [messages])
  const subTasks = React.useMemo(() => subTasksFromMessages(messages), [messages])
  // 产物来自 artifact bundles（getArtifactBundles，与对话产物卡同源），
  // 不是回合输出记录（project_change 依赖 git 基线，非 git 仓库为空）。
  const messageIdsKey = React.useMemo(() => messages.map((message) => message.id).join("\n"), [messages])
  const artifactBundles = useArtifactBundles(activeSessionId, messageIdsKey)
  const artifacts = React.useMemo(() => artifactItemsFromBundles(artifactBundles), [artifactBundles])
  const hasRunningSubTask = subTasks.some((task) => task.status === "running")
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!hasRunningSubTask) {
      return
    }
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasRunningSubTask])
  // 新子任务出现时自动展开面板（让用户看到子智能体运行状态）；数量不增（状态变化）不打扰。
  const subTaskCountRef = React.useRef(0)
  React.useEffect(() => {
    const count = subTasks.length
    if (count > 0 && count > subTaskCountRef.current) {
      onOpenChange(true)
    }
    subTaskCountRef.current = count
  }, [onOpenChange, subTasks.length])
  const chatService = useChatService()
  const prevOpenRef = React.useRef(open)

  const refreshPlan = React.useCallback(() => {
    void chatService
      .invoke("getPlanMarkdown")
      .then((markdown) => setPlanText(markdown))
      .catch(() => setPlanText(null))
  }, [chatService])

  // 关闭状态与 todo 快照联动：用户主动关闭（open 由 true→false）记录当前快照，
  // 之后若 agent 更新了本会话的 todo 列表（快照变化）→ 自动恢复呼出。
  // 合并成单个 effect 避免"刚关闭即被误判为快照变化"的竞态。
  React.useEffect(() => {
    if (!todos || todos.length === 0) {
      prevOpenRef.current = open
      return
    }
    if (!open) {
      const snapshot = JSON.stringify(todos)
      if (prevOpenRef.current) {
        // 本帧刚由打开变为关闭 → 记录快照，不触发 auto-reopen
        localStorage.setItem(storageKeys.dismissedSnapshot, snapshot)
        setDismissedSnapshot(snapshot)
      } else if (dismissedSnapshot === null || snapshot !== dismissedSnapshot) {
        // 保持关闭但 todo 列表有更新 → 重新呼出
        localStorage.removeItem(storageKeys.dismissedSnapshot)
        setDismissedSnapshot(null)
        onOpenChange(true)
      }
    }
    prevOpenRef.current = open
  }, [dismissedSnapshot, onOpenChange, open, todos, storageKeys])

  // 初次加载计划文件；plan_exit（Build Agent 问题）出现时刷新计划详情并自动展开，确认前可见。
  React.useEffect(() => {
    refreshPlan()
    const offAsked = chatService.serverEvents.on("questionAsked", (e) => {
      const header = e.request.questions?.[0]?.header
      if (header === "Build Agent") {
        refreshPlan()
        onOpenChange(true)
      }
    })
    return () => {
      offAsked()
    }
  }, [chatService, onOpenChange, refreshPlan])

  const toggleBodyCollapsed = React.useCallback(() => {
    setBodyCollapsed((value) => {
      localStorage.setItem(storageKeys.bodyCollapsed, value ? "0" : "1")
      return !value
    })
  }, [storageKeys])

  const toggleSection = React.useCallback(
    (section: PlanSection) => {
      setSectionCollapsed((current) => {
        const next = { ...current, [section]: !current[section] }
        localStorage.setItem(planSectionStorageKey(activeSessionId, section), next[section] ? "1" : "0")
        return next
      })
    },
    [activeSessionId],
  )

  const hasAnyContent = (todos && todos.length > 0) || subTasks.length > 0 || artifacts.length > 0

  if (!open || !hasAnyContent) {
    return null
  }

  const completedCount = todos ? todos.filter((todo) => todo.status === "completed").length : 0
  const allDone = todos !== null && completedCount === todos.length

  return (
    <AnimatePresence>
      <motion.div
        key="plan-panel"
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn("shrink-0", className)}
      >
        <div className="oo-todo">
          {/* 面板头：中性标题 + 整面板折叠/展开（不再重复计划图标与进度计数，那属于计划分区） */}
          <button
            type="button"
            className="oo-todo-head"
            aria-expanded={!bodyCollapsed}
            aria-label={t("chat.planTitle")}
            onClick={toggleBodyCollapsed}
          >
            <span className="oo-todo-head-icon">
              <ChevronIcon />
            </span>
            <span className="oo-todo-title">{t("chat.planPanelTitle")}</span>
          </button>

          {/* 面板主体：四分区垂直布局，整体可滚动，内容一律居左对齐 */}
          {!bodyCollapsed ? (
            <div className="max-h-[min(60vh,32rem)] overflow-y-auto pr-0.5">
              <div className="space-y-1 pt-1">
                {/* 计划 */}
                {todos && todos.length > 0 ? (
                  <section>
                    <SectionHeader
                      icon={<ListTodo className="size-4" aria-hidden="true" />}
                      title={t("chat.planTitle")}
                      meta={`${completedCount}/${todos.length}`}
                      collapsed={sectionCollapsed.plan}
                      onToggle={() => toggleSection("plan")}
                    />
                    <SectionBody open={!sectionCollapsed.plan}>
                      <div>
                        <ul className="oo-todo-list">
                          {todos.map((todo, index) => {
                            const done = todo.status === "completed"
                            const active = todo.status === "in_progress"
                            return (
                              <li
                                key={index}
                                className={cn("oo-todo-item", done && "done", active && !allDone && "active")}
                              >
                                <span className="oo-todo-icon-wrap">
                                  <DashedIcon on={!done && !active} />
                                  <ArrowIcon on={active && !allDone} />
                                  <CheckIcon on={done} />
                                </span>
                                <span className="oo-todo-label" data-label={todo.content}>
                                  {todo.content}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                        {planText ? (
                          <div className="border-t border-[var(--oo-divider)] px-1 pt-2">
                            <div className="oo-text-caption-compact mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
                              <FileText className="size-3.5 shrink-0 text-info" aria-hidden="true" />
                              {t("chat.planDetailTitle")}
                            </div>
                            <div className="text-[13px] leading-6 whitespace-pre-wrap text-foreground/90">
                              {planText}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </SectionBody>
                  </section>
                ) : null}

                {/* 智能体 */}
                {subTasks.length > 0 ? (
                  <section>
                    <SectionHeader
                      icon={<Bot className="size-4" aria-hidden="true" />}
                      title={t("chat.subTasksTitle")}
                      meta={`(${subTasks.length})`}
                      collapsed={sectionCollapsed.agents}
                      onToggle={() => toggleSection("agents")}
                    />
                    <SectionBody open={!sectionCollapsed.agents}>
                      <ul className="space-y-0.5">
                        {subTasks.map((task) => (
                          <SubTaskRow key={task.partId} task={task} now={now} t={t} />
                        ))}
                      </ul>
                    </SectionBody>
                  </section>
                ) : null}

                {/* 产物 */}
                {artifacts.length > 0 ? (
                  <section>
                    <SectionHeader
                      icon={<Files className="size-4" aria-hidden="true" />}
                      title={t("chat.planArtifactsTitle")}
                      meta={`(${artifacts.length})`}
                      collapsed={sectionCollapsed.artifacts}
                      onToggle={() => toggleSection("artifacts")}
                    />
                    <SectionBody open={!sectionCollapsed.artifacts}>
                      <ul className="space-y-0.5">
                        {artifacts.map((file, index) => (
                          <li key={`${file.name}:${index}`}>
                            <button
                              type="button"
                              title={t("chat.planArtifactsPreview")}
                              className="flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-[13px] transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              onClick={() =>
                                onOpenArtifact?.({
                                  messageId: file.messageId,
                                  group: file.group,
                                  selectedPath: file.path,
                                })
                              }
                            >
                              <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="w-0 max-w-full min-w-0 flex-1 truncate text-foreground/90">
                                {file.name}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground/80 tabular-nums">
                                {formatFileSize(file.size)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </SectionBody>
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function subTaskDuration(task: SubTask, now: number): string | null {
  const start = task.start
  if (typeof start !== "number") {
    return null
  }
  const end = task.status === "completed" || task.status === "error" ? task.end : now
  if (typeof end !== "number" || end < start) {
    return null
  }
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return `${seconds}s`
}

function SubTaskRow({ task, now, t }: { task: SubTask; now: number; t: ReturnType<typeof useT> }) {
  const running = task.status === "running"
  const completed = task.status === "completed"
  const error = task.status === "error"
  const statusLabel = error
    ? t("chat.subTaskError")
    : running
      ? t("chat.subTaskRunning")
      : completed
        ? t("chat.subTaskCompleted")
        : t("chat.subTaskPending")
  const duration = subTaskDuration(task, now)
  return (
    <li className="flex min-w-0 items-center gap-2 py-0.5">
      <span className="flex size-4 shrink-0 items-center justify-center">
        {running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-info" aria-hidden="true" />
        ) : error ? (
          <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
        ) : completed ? (
          <Check className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Circle className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        )}
      </span>
      <span className="w-0 max-w-full min-w-0 flex-1 truncate text-[13px] leading-5 text-foreground/90">
        {task.description}
      </span>
      {task.agentType ? (
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[11px] leading-none font-medium text-muted-foreground">
          {task.agentType}
        </span>
      ) : null}
      <span className="shrink-0 text-xs text-muted-foreground/80 tabular-nums">
        {duration ? `${statusLabel} ${duration}` : statusLabel}
      </span>
    </li>
  )
}
