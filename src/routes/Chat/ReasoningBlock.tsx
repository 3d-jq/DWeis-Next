import type { ChatMessagePart } from "../../../electron/chat/common.ts"

import { BrainIcon, ChevronRight } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

function firstLine(text: string): string {
  const newline = text.indexOf("\n")
  return newline === -1 ? text : text.slice(0, newline)
}

function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf("\n")
  return newline === -1 ? visible : visible.slice(newline + 1)
}

/**
 * 深度思考折叠行（对齐 deepseek-harness ReasoningRow + DisclosureRow）：
 * [16px 图标槽(hover 显 chevron 预览)] 标题 · 摘要 —— 运行中摘要跟随推理最新一行
 * （横向截断窗口滚到最右、clip 不省略号），完成后显示推理第一行。
 * 运行中整行光带扫过（与工具行同一 sweep），文字保持实色。
 * 点击整行展开完整推理（定长内部滚动）。行高 24px 与工具行/状态行对齐。
 */
export function ReasoningBlock({ part, live = false }: { part: ChatMessagePart; live?: boolean }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const text = part.text?.trim() ?? ""
  const streaming = live && part.text !== undefined
  const running = streaming
  const summaryRef = React.useRef<HTMLSpanElement>(null)
  const summary = streaming ? latestLine(text) : firstLine(text)

  // 运行中摘要跟随最新一行：内容增长时把横向截断窗口滚到最右（完成态回到行首）。
  React.useLayoutEffect(() => {
    const element = summaryRef.current
    if (element === null) {
      return
    }
    element.scrollLeft = streaming ? element.scrollWidth - element.clientWidth : 0
  }, [streaming, summary])

  return (
    <div className="flex min-w-0 flex-col">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setOpen((value) => !value)
          }
        }}
        className={cn(
          "group/reasoning relative flex h-6 min-w-0 cursor-pointer items-center overflow-hidden rounded text-left",
          running && "oo-row-sweep",
        )}
      >
        {/* 16px 图标槽：平时显脑图标，hover 时图标淡出、chevron 预览淡入（dsh leading 样式）。 */}
        <span className="relative mr-1.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          <BrainIcon className="absolute size-3.5 transition-opacity duration-100 group-hover/reasoning:opacity-0" aria-hidden="true" />
          <ChevronRight
            className={cn(
              "absolute size-3.5 transition-opacity duration-100 group-hover/reasoning:opacity-100",
              open ? "rotate-90 opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          />
        </span>
        <span className="shrink-0 text-sm leading-6 font-normal text-muted-foreground">
          {t("chat.reasoningToggle")}
        </span>
        {/* dsh keepContentWhenOpen=false：展开后行内摘要隐藏，只留标题；收起时恢复摘要。 */}
        {!open && summary ? (
          <>
            <span aria-hidden="true" className="mx-2 size-0.5 shrink-0 rounded-full bg-muted-foreground/60" />
            {/* 跟随中 clip（不省略号）+ 手动滚动到最右；完成态省略号截断（dsh summary 样式）。 */}
            <span
              ref={summaryRef}
              className={cn(
                "min-w-0 flex-1 overflow-hidden text-sm leading-6 whitespace-nowrap text-muted-foreground/70",
                streaming ? "[text-overflow:clip]" : "text-ellipsis",
              )}
            >
              {summary}
            </span>
          </>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="reasoning-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* 思考内容：pl 匹配图标槽宽度（22px = 16px + 6px margin），定长 + 内部滚动。 */}
            <div className="mt-1 max-h-40 overflow-y-auto pl-[22px] text-sm leading-6 whitespace-pre-wrap break-words text-muted-foreground/90">
              {text}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
