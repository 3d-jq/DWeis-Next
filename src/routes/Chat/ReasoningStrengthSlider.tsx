import type { ReasoningLevel } from "../../../electron/chat/common.ts"
import type { ModelCatalog } from "../../../electron/models/common.ts"

import { Brain, ChevronDown } from "lucide-react"
import * as React from "react"
import { createPortal } from "react-dom"
import { reasoningLevelLabel } from "./model-control-utils.ts"
import { clampReasoningLevel, selectedModelReasoningLevels } from "./model-reasoning-levels.ts"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

/**
 * 推理强度调节器：圆形手柄 + 横向滑道（连续拖动，释放吸附到档位）。
 * 档位按当前模型支持动态（selectedModelReasoningLevels），不是写死。
 * 单一状态 tier 派生：手柄位置、填充宽度、刻度高亮、顶部档位名全部一致。
 */
export function ReasoningStrengthSlider({
  catalog,
  level,
  onChange,
}: {
  catalog: ModelCatalog | null
  level: ReasoningLevel
  onChange: (level: ReasoningLevel) => void
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({})
  const [dragging, setDragging] = React.useState(false)

  const levels = React.useMemo(() => selectedModelReasoningLevels(catalog), [catalog])
  // 档位超出模型支持范围时钳制（如 max 但模型只到 high）：滑杆位置、标签、高亮一致，
  // 并回写钳制后的档位，避免"标签写 max、滑杆停 0 位"的不一致。
  const effectiveLevel = React.useMemo(() => clampReasoningLevel(level, levels), [level, levels])
  const tier = Math.max(0, levels.indexOf(effectiveLevel))

  React.useEffect(() => {
    if (effectiveLevel !== level) {
      onChange(effectiveLevel)
    }
  }, [effectiveLevel, level, onChange])

  const updatePanelPosition = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    // 学模型下拉：向上弹出（bottom 定位），避免掉到输入框下面。
    setPanelStyle({ left: Math.max(8, rect.left), bottom: window.innerHeight - rect.top + 6 })
  }, [])

  React.useLayoutEffect(() => {
    if (open) {
      updatePanelPosition()
    }
  }, [open, updatePanelPosition])

  const selectFromPoint = React.useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) {
        return
      }
      const rect = track.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
      // 吸附点：i / (N-1) * 100，与下方刻度标签（justify-between）位置一致。
      const position = ratio * 100
      let nearest = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      levels.forEach((_, index) => {
        const snap = levels.length > 1 ? (index / (levels.length - 1)) * 100 : 0
        const distance = Math.abs(position - snap)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = index
        }
      })
      onChange(levels[nearest])
    },
    [levels, onChange],
  )

  React.useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && (triggerRef.current?.contains(target) || trackRef.current?.contains(target))) {
        return
      }
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    const handleReposition = (): void => updatePanelPosition()
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleReposition)
    window.addEventListener("scroll", handleReposition, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleReposition)
      window.removeEventListener("scroll", handleReposition, true)
    }
  }, [open, updatePanelPosition])

  // 手柄位置 = f(tier)（单一状态派生）：与刻度标签对齐的吸附点。
  const handlePosition = levels.length > 1 ? (tier / (levels.length - 1)) * 100 : 0
  // 拉到最顶（最后一档）→ 紫色流动填充。
  const isMaxTier = levels.length > 0 && tier === levels.length - 1

  const panel = open
    ? createPortal(
        <div
          style={panelStyle}
          className="fixed z-50 w-72 rounded-2xl border border-[var(--oo-divider)] bg-popover p-4 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <span className="oo-text-caption-compact font-medium text-foreground">{t("chat.reasoningStrength")}</span>
            <span className="oo-text-caption font-semibold text-[var(--info)]">
              {reasoningLevelLabel(effectiveLevel, t)}
            </span>
          </div>
          <div
            ref={trackRef}
            className="relative mt-4 h-6 cursor-pointer touch-none select-none"
            onPointerDown={(event) => {
              event.preventDefault()
              setDragging(true)
              event.currentTarget.setPointerCapture(event.pointerId)
              selectFromPoint(event.clientX)
            }}
            onPointerMove={(event) => {
              if (dragging) {
                selectFromPoint(event.clientX)
              }
            }}
            onPointerUp={() => setDragging(false)}
          >
            {/* 滑道：宽凹槽包裹手柄（槽高 ≈ 手柄直径） */}
            <div className="absolute inset-y-0.5 w-full rounded-full bg-muted/60" />
            {/* accent 填充（0 → 手柄中心，与手柄精确对齐） */}
            <div
              className={cn(
                "absolute inset-y-0.5 rounded-l-full",
                isMaxTier ? "oo-reasoning-max-fill" : "bg-[var(--info)]",
              )}
              // 填充延伸到手柄中心、右端直角：被实心手柄覆盖，同色同高完全融合，无形状空隙。
              style={{ width: `${handlePosition}%` }}
            />
            {/* 圆形手柄：白底 + accent 描边，中心 = 填充右端 */}
            <div
              className={cn(
                "absolute top-1/2 z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background shadow-sm transition-[box-shadow] hover:shadow-md",
                // 白色手柄盖住填充直角末端：accent 描边让白圆融入蓝轨。
                isMaxTier ? "border-[oklch(0.55 0.24 310)]" : "border-[var(--info)]",
              )}
              style={{ left: `${handlePosition}%` }}
            />
          </div>
          {/* 刻度标签：定位到对应吸附点（与手柄同源 i/(N-1)），首尾贴边不居中，中间居中 */}
          <div className="relative mt-2 h-6">
            {levels.map((itemLevel, index) => {
              const snap = levels.length > 1 ? (index / (levels.length - 1)) * 100 : 0
              return (
                <button
                  key={itemLevel}
                  type="button"
                  onClick={() => onChange(itemLevel)}
                  style={{
                    left: `${snap}%`,
                    transform:
                      index === 0 ? "none" : index === levels.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                  className={cn(
                    "oo-text-micro absolute top-0 shrink-0 rounded px-1 py-0.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                    itemLevel === effectiveLevel && "font-medium text-[var(--info)]",
                  )}
                >
                  {reasoningLevelLabel(itemLevel, t)}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("chat.reasoningStrength")}
        aria-expanded={open}
        title={`${t("chat.reasoningStrength")}: ${reasoningLevelLabel(effectiveLevel, t)}`}
        onClick={() => setOpen((value) => !value)}
        className="oo-composer-model-button flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground"
      >
        <Brain className="size-4 shrink-0" />
        <span className="oo-composer-model-reasoning shrink-0 text-muted-foreground">
          {t("chat.reasoningStrength")}: {reasoningLevelLabel(effectiveLevel, t)}
        </span>
        <ChevronDown
          className={cn("oo-composer-control-chevron size-3.5 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {panel}
    </>
  )
}
