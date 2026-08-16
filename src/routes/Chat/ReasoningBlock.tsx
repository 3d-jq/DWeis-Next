import type { ChatMessagePart } from "../../../electron/chat/common.ts"

import { BrainIcon, ChevronRight } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { LoadingShimmerText } from "./LoadingShimmerText.tsx"
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
 * 深度思考折叠行（对齐 deepseek-harness ReasoningRow）：
 * 脑图标 + 「深度思考」+ 分隔点 + 折叠摘要——运行中摘要跟随推理最新一行（自动滚到最右），
 * 完成后显示推理第一行。思考中（内容未到）摘要位是扫光占位，内容一到即填充，元素不换。
 * 点击整行展开完整推理（定长内部滚动）。行高与工具行/状态行一致（min-h-6）。
 */
export function ReasoningBlock({ part, live = false }: { part: ChatMessagePart; live?: boolean }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const text = part.text?.trim() ?? ""
  const streaming = live && part.text !== undefined
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
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-6 max-w-full w-full items-center gap-2 rounded text-left text-xs text-muted-foreground transition-colors",
          "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        {/* 图标放 size-5 盒：与工具步骤行文字列对齐 */}
        <span className="flex size-5 shrink-0 items-center justify-center">
          <BrainIcon className="size-3.5 shrink-0" aria-hidden="true" />
        </span>
        <span className="shrink-0 font-medium">{t("chat.reasoningToggle")}</span>
        {summary ? (
          <>
            <span aria-hidden="true" className="size-0.5 shrink-0 rounded-full bg-current opacity-50" />
            <span ref={summaryRef} className="min-w-0 flex-1 truncate font-medium opacity-70">
              {summary}
            </span>
          </>
        ) : (
          <LoadingShimmerText className="min-w-0 flex-1 truncate font-medium">
            {t("chat.reasoningToggle")}
          </LoadingShimmerText>
        )}
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        </motion.span>
      </button>
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
            {/* 思考内容定长 + 内部滚动：推理很长时不撑大对话流（10rem）。pl-7 与工具行文字列对齐。 */}
            <div className="mt-1 max-h-40 overflow-y-auto pl-7 text-[13px] leading-6 whitespace-pre-wrap text-muted-foreground/90">
              {text}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
