import type { ChatMessagePart } from "../../../electron/chat/common.ts"

import { BrainIcon, ChevronDownIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import * as React from "react"
import { useT } from "@/i18n/i18n"
import { LoadingShimmerText } from "./LoadingShimmerText.tsx"
import { cn } from "@/lib/utils"

/**
 * 深度思考行内折叠块（无卡片）：图标 + 文案一行，点击展开查看推理内容。
 * 生成中（文本为空）显示"深度思考"文字扫光占位；思考中也可点击展开，
 * 实时查看已流出的推理内容（没内容时展开区留白，内容到了即填充）。
 * 完成仍显示"深度思考"（不切换成其他文案，减少跳变）。有内容时默认收起。
 */
export function ReasoningBlock({ part }: { part: ChatMessagePart }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const text = part.text?.trim() ?? ""
  const thinking = text.length === 0

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          // min-h-6 与 LiveStatusBar 行高一致（24px）：推理 part 到达时两者同帧替换，
          // 无固定行高会被 20px 图标盒撑成 ~20px，替换瞬间内容收缩 4px 导致界面跳变。
          "inline-flex min-h-6 max-w-full items-center gap-2 rounded text-left text-xs text-muted-foreground transition-colors",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {/* 与工具步骤行对齐：图标放 size-5 盒 + gap-2，文字列一致（否则过程区文字左右错开显得歪） */}
        <span className="flex size-5 shrink-0 items-center justify-center">
          <BrainIcon className="size-3.5 shrink-0" aria-hidden="true" />
        </span>
        {thinking ? (
          <LoadingShimmerText className="min-w-0 truncate font-medium">{t("chat.reasoningToggle")}</LoadingShimmerText>
        ) : (
          <span className="font-medium">{t("chat.reasoningToggle")}</span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
          <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
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
            {/* 思考内容定长 + 内部滚动：推理很长时不再把对话流撑得很大（10rem）。空内容时留白，
                等推理文本流式到达后自动填充——不再重复显示「思考中」扫光。pl-7 与工具行文字列对齐。 */}
            <div className="mt-1 max-h-40 overflow-y-auto pl-7 text-[13px] leading-6 whitespace-pre-wrap text-muted-foreground/90">
              {text}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
