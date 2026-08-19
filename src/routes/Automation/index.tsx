import type { AutomationTask } from "../../../electron/automation/common.ts"

import { Clock3Icon, Loader2Icon, PlayIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { describeAutomationSchedule } from "../../../electron/automation/schedule.ts"
import {
  AUTOMATION_TEMPLATES,
  automationDisplayStatus,
  automationNextRunAt,
  automationStatusLabel,
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
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useAutomation } from "@/hooks/useAutomation"
import { useT } from "@/i18n/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { cn } from "@/lib/utils"

/** 自动化：用户用一句话描述定时任务，AI 解析触发规则与指令，到点自动新建会话执行。 */
export function AutomationRoute() {
  const t = useT()
  const { createTask, deleteTask, loading, runTaskNow, tasks, updateTask } = useAutomation()
  const [draft, setDraft] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<AutomationTask | null>(null)
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

  const sortedTasks = React.useMemo(() => sortAutomationTasks(tasks, nowTick), [tasks, nowTick])

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="oo-border-divider flex min-h-12 items-center gap-2 border-b px-3 py-2">
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
      </header>
      <div className="min-h-0 overflow-y-auto p-3">
        {loading ? null : sortedTasks.length === 0 ? (
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
                  onClick={() => setDraft(template.text)}
                >
                  {template.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            {sortedTasks.map((task) => (
              <AutomationTaskCard
                key={task.id}
                now={nowTick}
                task={task}
                onDelete={() => setDeleting(task)}
                onRunNow={() => void runNow(task)}
                onToggle={(enabled) => void toggleEnabled(task, enabled)}
              />
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
    </section>
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
  onRunNow,
  onToggle,
}: {
  now: Date
  task: AutomationTask
  onDelete: () => void
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
