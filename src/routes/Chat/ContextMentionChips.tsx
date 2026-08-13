import type { ChatContextMention } from "../../../electron/chat/common.ts"

import { LibraryBig, Plug, X } from "lucide-react"
import { contextMentionKey } from "./composer-state.ts"
import { skillContextMentionLabel } from "./context-mention-label.ts"
import { normalizeSkillIconSource } from "@/components/skill-icon-source"
import { SkillIcon } from "@/components/SkillIcon"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"
import { isEmojiIcon, isImageIcon } from "@/routes/Skills/skill-route-model"

function contextMentionLabel(mention: ChatContextMention): string {
  if (mention.kind === "skill") {
    return skillContextMentionLabel(mention)
  }
  if (mention.kind === "knowledge") return mention.name
  return mention.displayName
}

function contextMentionTitle(mention: ChatContextMention): string | undefined {
  if (mention.kind === "skill") {
    return mention.description
  }
  if (mention.kind === "knowledge") return mention.name
  return contextMentionLabel(mention)
}

function SkillMentionIcon({ icon }: { icon?: string }) {
  const normalizedIcon = normalizeSkillIconSource(icon)

  if (isImageIcon(normalizedIcon)) {
    return <img alt="" src={normalizedIcon} className="size-5 rounded-sm object-contain" />
  }

  if (isEmojiIcon(normalizedIcon)) {
    return <span className="text-base leading-none">{normalizedIcon}</span>
  }

  return <SkillIcon icon={normalizedIcon} className="size-3.5" />
}

export function ContextMentionChips({
  className,
  mentions,
  onRemove,
}: {
  className?: string
  mentions: ChatContextMention[]
  onRemove?: (mention: ChatContextMention) => void
}) {
  const t = useT()
  if (mentions.length === 0) {
    return null
  }
  return (
    <div className={cn("flex w-full flex-wrap gap-2", className)}>
      {mentions.map((mention) => {
        const label = contextMentionLabel(mention)
        return (
          <span
            key={contextMentionKey(mention)}
            className={cn(
              "oo-border-divider oo-text-body flex h-8 max-w-full min-w-0 items-center gap-2 rounded-lg border bg-background/70 px-2 shadow-xs",
              mention.kind === "knowledge" && "max-w-96",
            )}
            title={contextMentionTitle(mention)}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {mention.kind === "skill" ? (
                <SkillMentionIcon icon={mention.icon} />
              ) : mention.kind === "knowledge" ? (
                <LibraryBig className="size-3.5" />
              ) : (
                <Plug className="size-3.5" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 items-center">
              <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
            </span>
            {onRemove ? (
              <button
                type="button"
                aria-label={t("chat.contextRemove", { name: label })}
                className="-mr-1 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => onRemove(mention)}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
