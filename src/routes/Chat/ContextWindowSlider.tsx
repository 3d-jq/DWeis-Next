import * as React from "react"
import {
  CONTEXT_WINDOW_MARKERS,
  contextWindowToSlider,
  formatContextWindow,
  parseContextWindowInput,
  sliderToContextWindow,
  snapSliderValue,
} from "./context-window-slider.ts"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

const THUMB_SIZE = 14
const THUMB_RADIUS = THUMB_SIZE / 2

/** 刻度点/thumb 中心位置：补偿 thumb 半宽，使刻度点与 thumb 中心对齐。 */
function trackPosition(pos: number): string {
  return `calc(${pos * 100}% + ${(0.5 - pos) * THUMB_SIZE}px)`
}

export interface ContextWindowSliderProps {
  /** 受控 token 值（null = 未设置，滑块停在默认档）。 */
  value: number | null
  onChange: (value: number | null) => void
  id?: string
  disabled?: boolean
}

/**
 * Context window 选择器：数字输入框 + 对数刻度滑块双向联动。
 * 输入框失焦/回车时解析（支持 200k / 1m / 1,000,000 写法），清空表示"不设置"。
 */
export function ContextWindowSlider({ value, onChange, id, disabled }: ContextWindowSliderProps) {
  const t = useT()
  const [draft, setDraft] = React.useState<string | null>(null)
  const sliderValue = contextWindowToSlider(value ?? 200_000)
  const displayText = draft ?? (value !== null ? formatContextWindow(value) : "")

  const commitDraft = (): void => {
    if (draft === null) {
      return
    }
    const trimmed = draft.trim()
    if (!trimmed) {
      onChange(null)
    } else {
      const parsed = parseContextWindowInput(trimmed)
      if (parsed !== null) {
        onChange(parsed)
      }
    }
    setDraft(null)
  }

  return (
    <div className="grid gap-1.5">
      <input
        id={id}
        type="text"
        value={displayText}
        disabled={disabled}
        inputMode="text"
        aria-label={t("chat.modelContextWindow")}
        className="h-8 w-24 rounded-md border border-input bg-transparent px-2.5 text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        onFocus={(event) => setDraft(event.currentTarget.value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
      />
      <div className="relative h-3">
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border"
          style={{ left: THUMB_RADIUS, right: THUMB_RADIUS }}
        />
        {CONTEXT_WINDOW_MARKERS.map((marker) => (
          <div
            key={marker.label}
            className="pointer-events-none absolute top-1/2 z-[1] flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: trackPosition(marker.pos) }}
          >
            <div className="size-1.5 rounded-full border border-border bg-background" />
          </div>
        ))}
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={sliderValue}
          disabled={disabled}
          aria-label={t("chat.modelContextWindow")}
          className={cn(
            "absolute inset-0 z-[2] h-full w-full cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary",
            "[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onChange={(event) => onChange(sliderToContextWindow(snapSliderValue(Number(event.currentTarget.value))))}
        />
      </div>
      <div className="relative h-4">
        {CONTEXT_WINDOW_MARKERS.map((marker) => (
          <span
            key={marker.label}
            className="oo-text-micro absolute -translate-x-1/2 text-muted-foreground select-none"
            style={{ left: trackPosition(marker.pos) }}
          >
            {marker.label}
          </span>
        ))}
      </div>
    </div>
  )
}
