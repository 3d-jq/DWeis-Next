import type { AutomationTask, AutomationTaskInput } from "../../../electron/automation/common.ts"
import type { TaskFormValue } from "./automation-view.ts"

import { Clock3Icon, ExternalLinkIcon, PencilIcon, PlayIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import {
  AUTOMATION_TEMPLATES,
  automationDisplayStatus,
  automationNextRunAt,
  automationRunHistory,
  automationStatusLabel,
  describeAutomationTask,
  emptyTaskFormValue,
  filterAutomationTasks,
  formatLastRun,
  formatRelativeNextRun,
  sortAutomationTasks,
  taskToFormValue,
  templateToFormValue,
} from "./automation-view.ts"
import { TaskFormDialog } from "./TaskFormDialog.tsx"
import { Button } from "@/components/ui/button"
import {
  ConfirmDialog,
  ConfirmDialogAction,
  ConfirmDialogCancel,
  ConfirmDialogContent,
  ConfirmDialogDescription,
  ConfirmDialogFooter,
  ConfirmDialogHeader,
  ConfirmDialogTitle,
} from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useAutomation } from "@/hooks/useAutomation"
import { useT } from "@/i18n/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { cn } from "@/lib/utils"

/** 自动化：结构化表单创建定时任务（单次/每小时/每天/每周/每月/自定义 cron），到点自动新建会话执行。 */
export function AutomationRoute({ onOpenSession }: { onOpenSession?: (sessionId: string) => void }) {
  const t = useT()
  const { createTask, deleteTask, loading, runTaskNow, tasks, updateTask } = useAutomation()
  const [createValue, setCreateValue] = React.useState<TaskFormValue | null>(null)
  const [deleting, setDeleting] = React.useState<AutomationTask | null>(null)
  const [editing, setEditing] = React.useState<AutomationTask | null>(null)
  const [tab, setTab] = React.useState<"tasks" | "history">("tasks")
  const [search, setSearch] = React.useState("")
  // 30s 心跳：让"X 分钟后"相对时间保持新鲜（列表开着时）。
  const [nowTick, setNowTick] = React.useState(() => new Date())
  React.useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const submitCreate = async (input: AutomationTaskInput) => {
    await createTask(input)
    setCreateValue(null)
    toast.success(t("automation.created"))
  }

  const submitEdit = async (input: AutomationTaskInput) => {
    if (!editing) return
    await updateTask(editing.id, { ...input, enabled: editing.enabled })
    setEditing(null)
  }

  const toggleEnabled = async (task: AutomationTask, enabled: boolean) => {
    try {
      await updateTask(task.id, {
        cron: task.cron,
        enabled,
        name: task.name,
        prompt: task.prompt,
        schedule: task.schedule,
        scheduleText: task.scheduleText,
        timezone: task.timezone,
        ...(task.onceAt !== undefined ? { onceAt: task.onceAt } : {}),
      })
    } catch (error: unknown) {
      reportRendererHandledError("automation", "update automation task failed", error)
      toast.error(t("automation.updateFailed"))
    }
  }

  const runNow = async (task: AutomationTask) => {
    try {
      await runTaskNow(task.id)
      toast.success(t("automation.runStarted", { name: task.name }))
    } catch (error: unknown) {
      reportRendererHandledError("automation", "run automation task now failed", error)
      toast.error(t("automation.actionFailed"))
    }
  }

  const visibleTasks = React.useMemo(
    () => sortAutomationTasks(filterAutomationTasks(tasks, search), nowTick),
    [tasks, search, nowTick],
  )
  const history = React.useMemo(() => {
    const entries = automationRunHistory(tasks)
    const keyword = search.trim().toLowerCase()
    return keyword ? entries.filter((entry) => entry.taskName.toLowerCase().includes(keyword)) : entries
  }, [tasks, search])

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="oo-border-divider grid content-start gap-2 border-b px-3 py-2">
        <div className="flex min-h-8 items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
            {(["tasks", "history"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "oo-text-caption-compact rounded-md px-2.5 py-1 font-medium transition-colors",
                  tab === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setTab(value)}
              >
                {t(value === "tasks" ? "automation.tabTasks" : "automation.tabHistory")}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("automation.searchPlaceholder")}
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Button type="button" size="sm" onClick={() => setCreateValue(emptyTaskFormValue())}>
            <PlusIcon className="size-4" />
            {t("automation.newTask")}
          </Button>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto p-3">
        {loading ? null : tab === "tasks" ? (
          visibleTasks.length === 0 ? (
            tasks.length === 0 ? (
              <AutomationEmptyState onPickTemplate={(template) => setCreateValue(templateToFormValue(template))} />
            ) : (
              <p className="oo-text-caption px-2 py-6 text-center text-muted-foreground">
                {t("automation.searchNoMatch")}
              </p>
            )
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
              {visibleTasks.map((task) => (
                <AutomationTaskCard
                  key={task.id}
                  now={nowTick}
                  task={task}
                  onDelete={() => setDeleting(task)}
                  onEdit={() => setEditing(task)}
                  onRunNow={() => void runNow(task)}
                  onToggle={(enabled) => void toggleEnabled(task, enabled)}
                />
              ))}
            </div>
          )
        ) : history.length === 0 ? (
          <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center">
            <Clock3Icon className="size-8 text-muted-foreground" />
            <p className="oo-text-caption text-muted-foreground">{t("automation.historyEmpty")}</p>
          </div>
        ) : (
          <div className="grid gap-1">
            {history.map((entry) => (
              <AutomationHistoryRow key={`${entry.at}-${entry.taskName}`} entry={entry} onOpenSession={onOpenSession} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <ConfirmDialogContent>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>{t("automation.deleteConfirmTitle")}</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              {t("automation.deleteConfirm", { name: deleting?.name ?? "" })}
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <ConfirmDialogCancel>{t("common.cancel")}</ConfirmDialogCancel>
            <ConfirmDialogAction
              onClick={async () => {
                if (deleting) {
                  await deleteTask(deleting.id)
                  setDeleting(null)
                }
              }}
            >
              {t("automation.delete")}
            </ConfirmDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </ConfirmDialog>

      {/* 创建/编辑共用结构化表单；creating 用函数态存模板预填值。 */}
      {createValue !== null ? (
        <TaskFormDialog
          task={null}
          initialValue={createValue}
          onClose={() => setCreateValue(null)}
          onSubmit={submitCreate}
        />
      ) : null}
      {editing ? (
        <TaskFormDialog
          task={editing}
          initialValue={taskToFormValue(editing)}
          onClose={() => setEditing(null)}
          onSubmit={submitEdit}
        />
      ) : null}
    </section>
  )
}

function AutomationEmptyState({
  onPickTemplate,
}: {
  onPickTemplate: (template: (typeof AUTOMATION_TEMPLATES)[number]) => void
}) {
  const t = useT()
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
      <Clock3Icon className="size-8 text-muted-foreground" />
      <div className="grid gap-1">
        <p className="oo-text-caption text-muted-foreground">{t("automation.empty")}</p>
        <p className="oo-text-micro text-muted-foreground">{t("automation.emptyHint")}</p>
      </div>
      <div className="mt-1 flex max-w-lg flex-wrap items-center justify-center gap-1.5">
        {AUTOMATION_TEMPLATES.map((template) => (
          <button
            key={template.title}
            type="button"
            title={template.prompt}
            className="oo-text-caption-compact rounded-full border border-dashed border-[var(--oo-divider)] px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            onClick={() => onPickTemplate(template)}
          >
            {template.title}
          </button>
        ))}
      </div>
    </div>
  )
}

const statusDotClass: Record<ReturnType<typeof automationDisplayStatus>, string> = {
  running: "bg-info animate-pulse",
  success: "bg-emerald-500",
  error: "bg-rose-500",
  idle: "bg-muted-foreground/40",
}

function AutomationTaskCard({
  now,
  task,
  onDelete,
  onEdit,
  onRunNow,
  onToggle,
}: {
  now: Date
  task: AutomationTask
  onDelete: () => void
  onEdit: () => void
  onRunNow: () => void
  onToggle: (enabled: boolean) => void
}) {
  const t = useT()
  const status = automationDisplayStatus(task)
  const nextRun = automationNextRunAt(task, now)
  const running = status === "running"
  const iconButtonClass =
    "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--oo-divider)] px-3 py-2.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span
          className={cn(
            "oo-text-caption-compact min-w-0 flex-1 truncate font-medium",
            task.enabled ? "text-foreground" : "text-muted-foreground",
          )}
          title={task.name}
        >
          {task.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={iconButtonClass}
            title={t("automation.runNow")}
            aria-label={t("automation.runNow")}
            disabled={running}
            onClick={onRunNow}
          >
            <PlayIcon className="size-3.5" />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            title={t("automation.edit")}
            aria-label={t("automation.edit")}
            onClick={onEdit}
          >
            <PencilIcon className="size-3.5" />
          </button>
          <button
            type="button"
            className={iconButtonClass}
            title={t("automation.delete")}
            aria-label={t("automation.delete")}
            onClick={onDelete}
          >
            <Trash2Icon className="size-3.5" />
          </button>
          <Switch checked={task.enabled} onCheckedChange={onToggle} />
        </div>
      </div>
      <p className="oo-text-micro line-clamp-2 min-h-8 text-muted-foreground" title={task.prompt}>
        {task.prompt}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="oo-text-micro min-w-0 truncate text-muted-foreground">
          {describeAutomationTask(task)}
          {nextRun ? ` · ${formatRelativeNextRun(nextRun, now)}` : ""}
        </span>
        <span
          className="oo-text-micro flex shrink-0 items-center gap-1 text-muted-foreground"
          title={formatLastRun(task.lastRunAt, t)}
        >
          <span className={cn("size-1.5 rounded-full", statusDotClass[status])} />
          {automationStatusLabel(status, t)}
        </span>
      </div>
    </div>
  )
}

function AutomationHistoryRow({
  entry,
  onOpenSession,
}: {
  entry: ReturnType<typeof automationRunHistory>[number]
  onOpenSession?: (sessionId: string) => void
}) {
  const t = useT()
  const date = new Date(entry.at)
  const time = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[var(--oo-divider)] px-3 py-2">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", entry.status === "success" ? "bg-emerald-500" : "bg-rose-500")}
      />
      <span className="oo-text-caption-compact min-w-0 flex-1 truncate font-medium" title={entry.taskName}>
        {entry.taskName}
      </span>
      <span className="oo-text-micro shrink-0 text-muted-foreground tabular-nums">{time}</span>
      {entry.sessionId && onOpenSession ? (
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t("automation.openSession")}
          aria-label={t("automation.openSession")}
          onClick={() => onOpenSession(entry.sessionId!)}
        >
          <ExternalLinkIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
