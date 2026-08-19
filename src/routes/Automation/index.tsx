import type { AutomationTask, ParsedTaskDraft } from "../../../electron/automation/common.ts"

import {
  Clock3Icon,
  ExternalLinkIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { describeAutomationSchedule } from "../../../electron/automation/schedule.ts"
import {
  AUTOMATION_TEMPLATES,
  automationDisplayStatus,
  automationNextRunAt,
  automationRunHistory,
  automationStatusLabel,
  filterAutomationTasks,
  formatLastRun,
  formatRelativeNextRun,
  sortAutomationTasks,
} from "./automation-view.ts"
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
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useAutomation } from "@/hooks/useAutomation"
import { useT } from "@/i18n/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { cn } from "@/lib/utils"

/** 自动化：用户用一句话描述定时任务，AI 解析触发规则与指令，到点自动新建会话执行。 */
export function AutomationRoute({ onOpenSession }: { onOpenSession?: (sessionId: string) => void }) {
  const t = useT()
  const { createTask, deleteTask, loading, parseTaskDraft, runTaskNow, tasks, updateTask } = useAutomation()
  const [draft, setDraft] = React.useState("")
  const [creating, setCreating] = React.useState(false)
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

  const submit = async () => {
    const text = draft.trim()
    if (!text || creating) {
      return
    }
    setCreating(true)
    try {
      await createTask(text)
      setDraft("")
      toast.success(t("automation.created"))
    } catch (error: unknown) {
      reportRendererHandledError("automation", "create automation task failed", error)
      toast.error(error instanceof Error ? error.message : t("automation.createFailed"))
    } finally {
      setCreating(false)
    }
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

  const saveEdit = async (input: {
    cron: string
    name: string
    prompt: string
    schedule: AutomationTask["schedule"]
    scheduleText: string
    timezone: string
  }) => {
    if (!editing) return
    try {
      await updateTask(editing.id, { ...input, enabled: editing.enabled })
      setEditing(null)
    } catch (error: unknown) {
      reportRendererHandledError("automation", "update automation task failed", error)
      toast.error(t("automation.updateFailed"))
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
        </div>
        {tab === "tasks" ? (
          <div className="flex w-full min-w-0 items-center gap-2">
            <Input
              className="flex-1"
              placeholder={t("automation.createPlaceholder")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submit()
                }
              }}
            />
            <Button type="button" size="sm" onClick={submit} disabled={creating || !draft.trim()}>
              {creating ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
              {creating ? t("automation.parsing") : t("automation.create")}
            </Button>
          </div>
        ) : null}
      </header>
      <div className="min-h-0 overflow-y-auto p-3">
        {loading ? null : tab === "tasks" ? (
          visibleTasks.length === 0 ? (
            tasks.length === 0 ? (
              <AutomationEmptyState onPickTemplate={setDraft} />
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

      {editing ? (
        <EditTaskDialog
          key={editing.id}
          parsing={parseTaskDraft}
          task={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      ) : null}
    </section>
  )
}

function AutomationEmptyState({ onPickTemplate }: { onPickTemplate: (text: string) => void }) {
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
            title={template.text}
            className="oo-text-caption-compact rounded-full border border-dashed border-[var(--oo-divider)] px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            onClick={() => onPickTemplate(template.text)}
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
          {describeAutomationSchedule(task.schedule)}
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

/** 编辑任务：名称/指令直接改；调度描述变化时保存前重新走一句话解析。 */
function EditTaskDialog({
  parsing,
  task,
  onClose,
  onSave,
}: {
  parsing: (text: string) => Promise<ParsedTaskDraft | null>
  task: AutomationTask
  onClose: () => void
  onSave: (input: {
    cron: string
    name: string
    prompt: string
    schedule: AutomationTask["schedule"]
    scheduleText: string
    timezone: string
  }) => Promise<void>
}) {
  const t = useT()
  const [name, setName] = React.useState(task.name)
  const [prompt, setPrompt] = React.useState(task.prompt)
  const [scheduleText, setScheduleText] = React.useState(task.scheduleText)
  const [saving, setSaving] = React.useState(false)
  const scheduleChanged = scheduleText.trim() !== task.scheduleText

  const save = async () => {
    if (!name.trim() || !prompt.trim() || saving) return
    setSaving(true)
    try {
      if (scheduleChanged) {
        // 调度描述变了：重新解析（AI + 本地兜底），失败则提示并停留在对话框。
        const draft = await parsing(scheduleText.trim())
        if (!draft) {
          toast.error(t("automation.scheduleParseFailed"))
          return
        }
        await onSave({
          cron: draft.cron,
          name: name.trim(),
          prompt: prompt.trim(),
          schedule: draft.schedule,
          scheduleText: scheduleText.trim(),
          timezone: draft.timezone,
        })
        return
      }
      await onSave({
        cron: task.cron,
        name: name.trim(),
        prompt: prompt.trim(),
        schedule: task.schedule,
        scheduleText: task.scheduleText,
        timezone: task.timezone,
      })
    } catch (error: unknown) {
      reportRendererHandledError("automation", "save automation task edit failed", error)
      toast.error(t("automation.updateFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("automation.editTitle")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !name.trim() || !prompt.trim()}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 py-1">
        <label className="grid gap-1.5">
          <span className="oo-text-label">{t("automation.editName")}</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8" />
        </label>
        <label className="grid gap-1.5">
          <span className="oo-text-label">{t("automation.editPrompt")}</span>
          <textarea
            value={prompt}
            rows={3}
            onChange={(event) => setPrompt(event.target.value)}
            className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="oo-text-label">{t("automation.editSchedule")}</span>
          <Input
            value={scheduleText}
            onChange={(event) => setScheduleText(event.target.value)}
            className="h-8"
            placeholder={t("automation.createPlaceholder")}
          />
          <span className="oo-text-micro text-muted-foreground">
            {scheduleChanged
              ? t("automation.editScheduleChangedHint")
              : `${describeAutomationSchedule(task.schedule)} · ${task.cron}`}
          </span>
        </label>
      </div>
    </Dialog>
  )
}
