import type { AutomationTask } from "../../../electron/automation/common.ts"

import { Clock3Icon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { describeAutomationSchedule } from "../../../electron/automation/schedule.ts"
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

/** 自动化：用户用一句话描述定时任务，AI 解析触发规则与指令，到点自动新建会话执行。 */
export function AutomationRoute() {
  const t = useT()
  const { createTask, deleteTask, loading, tasks, updateTask } = useAutomation()
  const [draft, setDraft] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<AutomationTask | null>(null)

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
        {loading ? null : tasks.length === 0 ? (
          <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center">
            <Clock3Icon className="size-8 text-muted-foreground" />
            <p className="oo-text-caption text-muted-foreground">{t("automation.empty")}</p>
            <p className="oo-text-micro text-muted-foreground">{t("automation.emptyHint")}</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-md border border-[var(--oo-divider)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="oo-text-caption-compact truncate font-medium text-foreground">{task.name}</div>
                  <div className="oo-text-micro truncate text-muted-foreground">
                    {task.scheduleText} · {describeAutomationSchedule(task.schedule)}
                    {task.lastRunAt
                      ? ` · ${task.lastRunStatus === "running" ? t("automation.lastRunRunning") : task.lastRunStatus === "success" ? t("automation.lastRunSuccess") : t("automation.lastRunError")}`
                      : ""}
                  </div>
                </div>
                <Switch checked={task.enabled} onCheckedChange={(next) => void toggleEnabled(task, next)} />
                <button
                  type="button"
                  aria-label={t("automation.delete")}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                  onClick={() => setDeleting(task)}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
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
