import type { ChatQuestionRequest } from "../../../electron/chat/common.ts"
import type { QuestionDraftStore, QuestionField, QuestionFieldDraft, QuestionFieldOption } from "./question-fields.ts"

import { Check } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import {
  answersFromFieldDrafts,
  canSubmitFieldAnswers,
  deriveQuestionFields,
  questionStepLabel,
} from "./question-fields.ts"
import { useQuestionPromptDrafts } from "./question-prompt-drafts.ts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/i18n"
import { reportRendererHandledError } from "@/lib/renderer-diagnostics"
import { cn } from "@/lib/utils"

interface QuestionPromptCardProps {
  request: ChatQuestionRequest
  busy?: boolean
  onAnswer: (requestId: string, answers: string[][]) => Promise<void>
  questionDrafts: QuestionDraftStore
  onReject: (requestId: string) => Promise<void>
}

const customOptionValue = "__custom__"

function placeholderForField(t: ReturnType<typeof useT>, field: QuestionField): string {
  if (field.kind === "email") {
    return t("chat.questionEmailPlaceholder")
  }
  if (field.kind === "textarea") {
    return t("chat.questionTextareaPlaceholder")
  }
  return t("chat.questionTextPlaceholder", { label: field.label })
}

function chooseOption(
  draft: QuestionFieldDraft,
  option: QuestionFieldOption,
  multiple: boolean | undefined,
): QuestionFieldDraft {
  if (multiple) {
    const selected = draft.selected.includes(option.label)
      ? draft.selected.filter((label) => label !== option.label)
      : [...draft.selected, option.label]
    return { selected, value: selected.length > 0 && !option.manual ? option.value : "" }
  }
  const selected = draft.selected[0] === option.label ? [] : [option.label]
  return { selected, value: selected.length > 0 && !option.manual ? option.value : "" }
}

function chooseCustomOption(draft: QuestionFieldDraft, multiple: boolean | undefined): QuestionFieldDraft {
  if (multiple) {
    const selected = draft.selected.includes(customOptionValue)
      ? draft.selected.filter((label) => label !== customOptionValue)
      : [...draft.selected, customOptionValue]
    return { selected, value: selected.length > 0 ? draft.value : "" }
  }
  const selected = draft.selected[0] === customOptionValue ? [] : [customOptionValue]
  return { selected, value: selected.length > 0 ? draft.value : "" }
}

function optionInlineDescription(label: string, description: string | undefined): string | null {
  const text = description?.trim()
  if (!text) {
    return null
  }
  const normalizedLabel = label.replace(/[「」“”"'`\s]/g, "")
  const normalizedDescription = text.replace(/[「」“”"'`\s]/g, "")
  if (normalizedDescription === normalizedLabel || normalizedDescription.includes(`设为${normalizedLabel}`)) {
    return null
  }
  if (
    normalizedDescription.includes(`使用${normalizedLabel}`) ||
    normalizedDescription.includes(`${normalizedLabel}作为`)
  ) {
    return null
  }
  return text
}

function QuestionChoiceRow({
  description,
  disabled,
  label,
  multiple,
  selected,
  onSelect,
}: {
  description?: string
  disabled: boolean
  label: string
  /** 多选显示复选框（方框），单选显示圆点。 */
  multiple?: boolean
  selected: boolean
  onSelect: () => void
}) {
  const inlineDescription = optionInlineDescription(label, description)
  return (
    <button
      type="button"
      title={description || label}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex min-h-9 w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-ring bg-primary/5 text-foreground"
          : "border-border/80 bg-background text-foreground hover:border-border hover:bg-muted/60",
      )}
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center border transition-colors",
          multiple ? "rounded" : "rounded-full",
          selected ? "border-foreground bg-foreground text-background" : "border-muted-foreground/50 bg-transparent",
        )}
        aria-hidden="true"
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="oo-text-label min-w-0 truncate font-medium">{label}</span>
        {inlineDescription ? (
          <>
            <span className="shrink-0 text-muted-foreground/60">·</span>
            <span className="oo-text-caption-compact min-w-0 truncate text-muted-foreground">{inlineDescription}</span>
          </>
        ) : null}
      </span>
    </button>
  )
}

function QuestionStepIndicator({
  activeIndex,
  disabled,
  drafts,
  fields,
  onSelect,
}: {
  activeIndex: number
  disabled: boolean
  drafts: QuestionFieldDraft[]
  fields: QuestionField[]
  onSelect: (index: number) => void
}) {
  const t = useT()
  return (
    <ol className="flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-accent/70 p-1" role="tablist">
      {fields.map((field, index) => {
        const answered = canSubmitFieldAnswers([field], [drafts[index] ?? { value: "", selected: [] }])
        const active = index === activeIndex
        const label = questionStepLabel(field, t("chat.questionFallbackLabel", { index: index + 1 }))
        return (
          <li key={field.id} className="min-w-0 flex-1">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={field.prompt ?? field.label}
              disabled={disabled}
              className={cn(
                "flex w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : answered
                    ? "text-foreground hover:text-foreground/80"
                    : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onSelect(index)}
            >
              <span
                className={cn(
                  "oo-text-micro flex size-4 shrink-0 items-center justify-center rounded-full font-medium",
                  active
                    ? "bg-primary/10 text-primary"
                    : answered
                      ? "bg-muted-foreground/15 text-foreground"
                      : "bg-muted-foreground/10 text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="oo-text-label min-w-0 truncate">{label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function QuestionPromptCard({
  request,
  busy = false,
  onAnswer,
  questionDrafts,
  onReject,
}: QuestionPromptCardProps) {
  const t = useT()
  const fields = React.useMemo(() => deriveQuestionFields(request), [request])
  const { activeFieldIndex, drafts, removeDraft, selectActiveFieldIndex, updateDraft } = useQuestionPromptDrafts({
    fields,
    questionDrafts,
    request,
  })
  const [submitting, setSubmitting] = React.useState<"answer" | "reject" | null>(null)
  const activeControlRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const previousActiveFieldIndexRef = React.useRef(activeFieldIndex)
  const disabled = busy || Boolean(submitting)
  const canSubmit = canSubmitFieldAnswers(fields, drafts)
  const activeField = fields[activeFieldIndex]
  const activeDraft = drafts[activeFieldIndex] ?? { value: "", selected: [] }
  const canContinue = activeField ? canSubmitFieldAnswers([activeField], [activeDraft]) : false
  const isLastStep = activeFieldIndex >= fields.length - 1

  React.useEffect(() => {
    setSubmitting(null)
  }, [request, fields])

  React.useLayoutEffect(() => {
    if (previousActiveFieldIndexRef.current === activeFieldIndex) {
      return
    }
    previousActiveFieldIndexRef.current = activeFieldIndex
    activeControlRef.current?.focus()
  }, [activeFieldIndex])

  const setActiveControlRef = React.useCallback((node: HTMLInputElement | HTMLTextAreaElement | null) => {
    activeControlRef.current = node
  }, [])

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit || disabled) {
      return
    }
    setSubmitting("answer")
    try {
      const answers = answersFromFieldDrafts(request, fields, drafts)
      await onAnswer(request.id, answers)
      removeDraft()
    } catch (err) {
      setSubmitting(null)
      reportRendererHandledError("chat", "question answer failed", err)
      toast.error(t("chat.questionSubmitFailed"))
    }
  }, [canSubmit, disabled, drafts, fields, onAnswer, removeDraft, request, t])

  const handleReject = React.useCallback(async () => {
    if (disabled) {
      return
    }
    setSubmitting("reject")
    try {
      await onReject(request.id)
      removeDraft()
    } catch (err) {
      reportRendererHandledError("chat", "question reject failed", err)
      toast.error(t("chat.questionCancelFailed"))
    } finally {
      setSubmitting(null)
    }
  }, [disabled, onReject, removeDraft, request, t])

  const handleNext = React.useCallback(() => {
    if (!canContinue || disabled || isLastStep) {
      return
    }
    selectActiveFieldIndex(activeFieldIndex + 1)
  }, [activeFieldIndex, canContinue, disabled, isLastStep, selectActiveFieldIndex])

  const handlePrevious = React.useCallback(() => {
    if (disabled) {
      return
    }
    selectActiveFieldIndex(activeFieldIndex - 1)
  }, [activeFieldIndex, disabled, selectActiveFieldIndex])

  return (
    <form
      className="not-prose rounded-xl border border-border bg-background px-4 py-4 shadow-md"
      onSubmit={(event) => {
        event.preventDefault()
        if (fields.length > 1 && !isLastStep) {
          handleNext()
          return
        }
        void handleSubmit()
      }}
    >
      <div className="space-y-4">
        {fields.length > 1 ? (
          <QuestionStepIndicator
            activeIndex={activeFieldIndex}
            disabled={disabled}
            drafts={drafts}
            fields={fields}
            onSelect={selectActiveFieldIndex}
          />
        ) : null}

        {fields.map((field, index) => {
          if (fields.length > 1 && index !== activeFieldIndex) {
            return null
          }
          const draft = drafts[index] ?? { value: "", selected: [] }
          const inputId = `${request.id}-${index}-field`
          const selectedOption = field.options.find((option) => option.label === draft.selected[0])
          const hasConcreteOptions = field.options.some((option) => !option.manual)
          const shouldRenderCustomOption = hasConcreteOptions && !field.options.some((option) => option.manual)
          const showInput =
            field.options.length === 0 || draft.selected.includes(customOptionValue) || Boolean(selectedOption?.manual)
          const options = [
            ...field.options.filter((option) => !option.manual),
            ...field.options.filter((option) => option.manual),
          ]
          const spaciousField = field.options.length > 0 || field.kind === "textarea"
          return (
            <fieldset
              key={field.id}
              className={cn("space-y-2.5", spaciousField ? "max-h-64 min-h-28 overflow-y-auto pr-1" : "min-h-0")}
            >
              <Label htmlFor={inputId} className="oo-text-label block font-semibold text-foreground">
                {field.prompt ?? field.label}
                {field.multiple ? (
                  <span className="oo-text-micro ml-1.5 font-normal text-muted-foreground">
                    {t("chat.questionMultipleHint")}
                  </span>
                ) : null}
              </Label>

              {field.options.length > 0 ? (
                <div className="grid w-full grid-cols-1 gap-2">
                  {options.map((option) => (
                    <QuestionChoiceRow
                      key={option.label}
                      label={option.manual ? t("chat.questionCustomOption") : option.label}
                      description={option.manual ? undefined : option.description}
                      disabled={disabled}
                      multiple={field.multiple}
                      selected={draft.selected.includes(option.label)}
                      onSelect={() => updateDraft(index, (current) => chooseOption(current, option, field.multiple))}
                    />
                  ))}
                  {shouldRenderCustomOption ? (
                    <QuestionChoiceRow
                      label={t("chat.questionCustomOption")}
                      disabled={disabled}
                      multiple={field.multiple}
                      selected={draft.selected.includes(customOptionValue)}
                      onSelect={() => updateDraft(index, (current) => chooseCustomOption(current, field.multiple))}
                    />
                  ) : null}
                </div>
              ) : null}

              {showInput ? (
                field.kind === "textarea" ? (
                  <Textarea
                    ref={setActiveControlRef}
                    id={inputId}
                    value={draft.value}
                    disabled={disabled}
                    placeholder={placeholderForField(t, field)}
                    className="min-h-24 resize-y"
                    onChange={(event) =>
                      updateDraft(index, (current) => ({ value: event.target.value, selected: current.selected }))
                    }
                  />
                ) : (
                  <Input
                    ref={setActiveControlRef}
                    id={inputId}
                    type={field.kind === "email" ? "email" : "text"}
                    value={draft.value}
                    disabled={disabled}
                    placeholder={placeholderForField(t, field)}
                    onChange={(event) =>
                      updateDraft(index, (current) => ({ value: event.target.value, selected: current.selected }))
                    }
                  />
                )
              ) : null}
            </fieldset>
          )
        })}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2.5"
            disabled={disabled}
            onClick={handleReject}
          >
            {submitting === "reject" ? t("chat.questionCancelling") : t("chat.questionCancel")}
          </Button>
          {fields.length > 1 && activeFieldIndex > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2.5"
              disabled={disabled}
              onClick={handlePrevious}
            >
              {t("chat.questionPrevious")}
            </Button>
          ) : null}
          {fields.length > 1 && !isLastStep ? (
            <Button
              type="button"
              size="sm"
              className="h-8 px-2.5"
              disabled={!canContinue || disabled}
              onClick={handleNext}
            >
              {t("chat.questionNext")}
            </Button>
          ) : (
            <Button size="sm" type="submit" className="h-8 px-2.5" disabled={!canSubmit || disabled}>
              {submitting === "answer" ? t("chat.questionSubmitting") : t("chat.questionSubmit")}
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
