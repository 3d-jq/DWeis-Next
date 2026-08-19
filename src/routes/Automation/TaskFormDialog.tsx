import type { AutomationTask } from "../../../electron/automation/common.ts"
import type { TaskFormValue } from "./automation-view.ts"
import type { MessageKey } from "@/i18n/i18n"

import { Loader2Icon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import {
  describeAutomationSchedule,
  cronToSchedule,
  nextRunAtInTimezone,
  normalizeCron,
} from "../../../electron/automation/schedule.ts"
import {
  CRON_QUICK_PICKS,
  buildTaskInput,
  cronBuilderToExpr,
  exprToCronBuilder,
  formatMonthDayTime,
  formatRelativeNextRun,
  parseOnceAt,
  validateTaskForm,
} from "./automation-view.ts"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { cn } from "@/lib/utils"

const PLAN_TYPES: { type: TaskFormValue["planType"]; labelKey: MessageKey }[] = [
  { type: "once", labelKey: "automation.form.typeOnce" },
  { type: "hourly", labelKey: "automation.form.typeHourly" },
  { type: "daily", labelKey: "automation.form.typeDaily" },
  { type: "weekly", labelKey: "automation.form.typeWeekly" },
  { type: "monthly", labelKey: "automation.form.typeMonthly" },
  { type: "cron", labelKey: "automation.form.typeCron" },
]

/** 星期短标签（约定 0=周一…6=周日）。 */
const WEEKDAY_KEYS: { day: number; key: MessageKey }[] = [
  { day: 0, key: "automation.form.weekMon" },
  { day: 1, key: "automation.form.weekTue" },
  { day: 2, key: "automation.form.weekWed" },
  { day: 3, key: "automation.form.weekThu" },
  { day: 4, key: "automation.form.weekFri" },
  { day: 5, key: "automation.form.weekSat" },
  { day: 6, key: "automation.form.weekSun" },
]

/** 结构化任务表单：创建与编辑共用（对齐 LobsterAI TaskForm 交互）。 */
export function TaskFormDialog({
  task,
  initialValue,
  onClose,
  onSubmit,
}: {
  /** 编辑模式传入原任务（保留启用状态）；创建模式传 null。 */
  task: AutomationTask | null
  initialValue: TaskFormValue
  onClose: () => void
  onSubmit: (input: ReturnType<typeof buildTaskInput>) => Promise<void>
}) {
  const t = useT()
  const [value, setValue] = React.useState<TaskFormValue>(initialValue)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<string[]>([])

  const patch = (next: Partial<TaskFormValue>) => setValue((current) => ({ ...current, ...next }))

  const submit = async () => {
    if (saving) return
    const validation = validateTaskForm(value)
    setErrors(validation)
    if (validation.length > 0) return
    setSaving(true)
    try {
      const input = buildTaskInput(value)
      await onSubmit(input)
    } catch (error: unknown) {
      reportRendererHandledError("automation", "save automation task form failed", error)
      toast.error(t("automation.updateFailed"))
    } finally {
      setSaving(false)
    }
  }

  const errorText = (key: MessageKey): React.ReactNode =>
    errors.includes(key) ? <p className="oo-text-micro text-rose-500">{t(key)}</p> : null

  const schedulePreview = React.useMemo(() => {
    if (value.planType === "once") {
      const onceAt = parseOnceAt(value)
      return onceAt !== null && onceAt > Date.now() ? formatMonthDayTime(new Date(onceAt)) : null
    }
    const expr =
      value.planType === "cron"
        ? (normalizeCron(value.cronMode === "builder" ? cronBuilderToExpr(value.cronBuilder) : value.cronExpr.trim()) ??
          "")
        : cronBuilderFromPlan(value)
    if (!expr || !normalizeCron(expr)) return null
    const next = nextRunAtInTimezone(expr, new Date())
    return `${formatRelativeNextRun(next)} · ${formatMonthDayTime(next)}`
  }, [value])

  const planSelect = (
    <div className="flex flex-wrap gap-1">
      {PLAN_TYPES.map(({ type, labelKey }) => (
        <button
          key={type}
          type="button"
          className={cn(
            "oo-text-caption-compact rounded-full border px-2.5 py-1 transition-colors",
            value.planType === type
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-[var(--oo-divider)] text-muted-foreground hover:text-foreground",
          )}
          onClick={() => patch({ planType: type })}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  )

  const timeInput = (
    <input
      type="time"
      value={value.time}
      onChange={(event) => patch({ time: event.target.value })}
      className="h-8 w-28 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  )

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(task ? "automation.form.titleEdit" : "automation.form.titleCreate")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !value.name.trim() || !value.prompt.trim()}
          >
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t(task ? "common.save" : "automation.form.submitCreate")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-1">
        <label className="grid gap-1.5">
          <span className="oo-text-label">{t("automation.form.name")}</span>
          <Input
            value={value.name}
            onChange={(event) => patch({ name: event.target.value })}
            className="h-8"
            placeholder={t("automation.form.namePlaceholder")}
          />
          {errorText("automation.form.nameRequired")}
        </label>

        <div className="grid gap-1.5">
          <span className="oo-text-label">{t("automation.form.scheduleType")}</span>
          {planSelect}
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            {value.planType === "once" ? (
              <>
                <input
                  type="date"
                  value={value.date}
                  onChange={(event) => patch({ date: event.target.value })}
                  className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                {timeInput}
              </>
            ) : null}
            {value.planType === "hourly" ? (
              <>
                <select
                  value={value.hourMinute}
                  onChange={(event) => patch({ hourMinute: Number(event.target.value) })}
                  className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                >
                  {Array.from({ length: 60 }, (_, index) => (
                    <option key={index} value={index}>
                      {String(index).padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <span className="oo-text-micro text-muted-foreground">{t("automation.form.minuteSuffix")}</span>
              </>
            ) : null}
            {value.planType === "daily" ? timeInput : null}
            {value.planType === "weekly" ? timeInput : null}
            {value.planType === "monthly" ? (
              <>
                <select
                  value={value.monthDay}
                  onChange={(event) => patch({ monthDay: Number(event.target.value) })}
                  className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                >
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      {t("automation.form.monthDayOption", { day })}
                    </option>
                  ))}
                </select>
                {timeInput}
              </>
            ) : null}
          </div>
          {value.planType === "weekly" ? (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_KEYS.map(({ day, key }) => {
                const selected = value.weekdays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    className={cn(
                      "size-7 rounded-full text-xs font-medium transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "border border-[var(--oo-divider)] text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() =>
                      patch({
                        weekdays: selected ? value.weekdays.filter((entry) => entry !== day) : [...value.weekdays, day],
                      })
                    }
                  >
                    {t(key)}
                  </button>
                )
              })}
            </div>
          ) : null}
          {value.planType === "cron" ? <CronSection value={value} patch={patch} /> : null}
          {errorText("automation.form.onceFuture")}
          {errorText("automation.form.weekdayRequired")}
          {errorText("automation.form.cronInvalid")}
          {schedulePreview ? (
            <p className="oo-text-micro text-muted-foreground">
              {t("automation.form.nextRun", { time: schedulePreview })}
            </p>
          ) : null}
        </div>

        <label className="grid gap-1.5">
          <span className="oo-text-label">{t("automation.form.prompt")}</span>
          <textarea
            value={value.prompt}
            rows={3}
            onChange={(event) => patch({ prompt: event.target.value })}
            placeholder={t("automation.form.promptPlaceholder")}
            className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {errorText("automation.form.promptRequired")}
        </label>
        <p className="oo-text-micro text-muted-foreground">
          {t("automation.form.timezoneHint", { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
        </p>
      </div>
    </Dialog>
  )
}

/** cron 高级区：构建器/表达式双模式 + 快捷预设 + 实时预览。 */
function CronSection({ value, patch }: { value: TaskFormValue; patch: (next: Partial<TaskFormValue>) => void }) {
  const t = useT()
  const expr = value.cronMode === "builder" ? cronBuilderToExpr(value.cronBuilder) : value.cronExpr
  const valid = Boolean(normalizeCron(expr))
  const preview = valid ? describeAutomationSchedule(cronToSchedule(expr)) : null

  const fieldLabels: { key: MessageKey; field: keyof TaskFormValue["cronBuilder"] }[] = [
    { key: "automation.form.fieldMinute", field: "minute" },
    { key: "automation.form.fieldHour", field: "hour" },
    { key: "automation.form.fieldDom", field: "dom" },
    { key: "automation.form.fieldMonth", field: "month" },
    { key: "automation.form.fieldDow", field: "dow" },
  ]

  const optionsFor = (field: keyof TaskFormValue["cronBuilder"]): string[] => {
    if (field === "minute")
      return ["*", ...Array.from({ length: 60 }, (_, i) => String(i)), "*/5", "*/10", "*/15", "*/30"]
    if (field === "hour") return ["*", ...Array.from({ length: 24 }, (_, i) => String(i)), "*/2", "*/4", "*/6", "*/12"]
    if (field === "dom") return ["*", ...Array.from({ length: 31 }, (_, i) => String(i + 1))]
    if (field === "month") return ["*", ...Array.from({ length: 12 }, (_, i) => String(i + 1))]
    return ["*", "0", "1", "2", "3", "4", "5", "6", "1-5", "0,6"]
  }

  return (
    <div className="grid gap-2 rounded-lg border border-[var(--oo-divider)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {(["builder", "raw"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "oo-text-caption-compact rounded-md px-2 py-0.5 font-medium transition-colors",
                value.cronMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() =>
                patch(
                  mode === "raw"
                    ? { cronMode: "raw", cronExpr: cronBuilderToExpr(value.cronBuilder) }
                    : { cronMode: "builder", cronBuilder: exprToCronBuilder(value.cronExpr) ?? value.cronBuilder },
                )
              }
            >
              {t(mode === "builder" ? "automation.form.cronModeBuilder" : "automation.form.cronModeRaw")}
            </button>
          ))}
        </div>
        <span className={cn("oo-text-micro truncate font-mono", valid ? "text-muted-foreground" : "text-rose-500")}>
          {expr || "—"}
          {preview ? ` · ${preview}` : ""}
        </span>
      </div>
      {value.cronMode === "builder" ? (
        <div className="grid grid-cols-5 gap-1.5">
          {fieldLabels.map(({ key, field }) => (
            <label key={field} className="grid gap-1">
              <span className="oo-text-micro text-center text-muted-foreground">{t(key)}</span>
              <select
                value={value.cronBuilder[field]}
                onChange={(event) => patch({ cronBuilder: { ...value.cronBuilder, [field]: event.target.value } })}
                className="h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-1 text-xs outline-none focus-visible:border-ring"
              >
                {optionsFor(field).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <input
          value={value.cronExpr}
          onChange={(event) => patch({ cronExpr: event.target.value })}
          spellCheck={false}
          placeholder={t("automation.form.cronPlaceholder")}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      )}
      <div className="flex flex-wrap gap-1">
        {CRON_QUICK_PICKS.map(({ labelKey, expr: quickExpr }) => (
          <button
            key={quickExpr}
            type="button"
            className={cn(
              "oo-text-caption-compact rounded-full border px-2 py-0.5 transition-colors",
              expr === quickExpr
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-dashed border-[var(--oo-divider)] text-muted-foreground hover:text-foreground",
            )}
            onClick={() =>
              patch({
                cronExpr: quickExpr,
                cronBuilder: exprToCronBuilder(quickExpr) ?? value.cronBuilder,
              })
            }
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 非 cron 计划的展示用 cron（预览下次执行时间用）。 */
function cronBuilderFromPlan(value: TaskFormValue): string {
  const input = buildTaskInput(value)
  return input.cron
}
