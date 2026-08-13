import type { AttachmentPickerKind } from "../../../electron/attachment-picker.ts"
import type { ChatContextMention } from "../../../electron/chat/common.ts"
import type {
  ArtifactPaletteItem,
  AttachmentPaletteAction,
  AttachmentPaletteItem,
  ChatComposerPaletteItem,
  KnowledgeLibraryPaletteItem,
  KnowledgePaletteItem,
  SkillPaletteItem,
  SlashCommandPaletteItem,
} from "./composer-palette-items.ts"
import type { PaletteMode } from "./composer-palette-state.ts"
import type { ComposerAction } from "./composer-state.ts"
import type { ComposerTrigger } from "./composer-triggers.ts"

import * as React from "react"
import {
  buildSlashRootPaletteItems,
  filterComposerPaletteItems,
  skillPaletteContextMention,
} from "./composer-palette-items.ts"
import { resolveComposerPaletteKeyAction } from "./composer-palette-logic.ts"
import {
  initialComposerPaletteNavigation,
  resolveComposerPaletteNavigation,
  updateComposerPaletteNavigation,
} from "./composer-palette-state.ts"
import { detectComposerTrigger } from "./composer-triggers.ts"

interface UseComposerPaletteOptions {
  contextItems: Array<
    | ArtifactPaletteItem
    | AttachmentPaletteItem
    | KnowledgeLibraryPaletteItem
    | KnowledgePaletteItem
  >
  disabled: boolean
  dismissedTriggerKey: string | null
  dispatch: React.Dispatch<ComposerAction>
  draft: string
  draftSelection: { end: number; start: number }
  focusDraftAt: (index: number) => void
  onAddArtifactAttachment: (item: ArtifactPaletteItem) => void
  onAddContextMention: (mention: ChatContextMention) => void
  /** 撤销/恢复/压缩动作由提交路径（handleSubmit 识别 /undo /redo /compact）执行。 */
  onOpenKnowledgeLibrary?: () => void
  onSelectAttachments: (kind: AttachmentPickerKind) => void
  onSelectKnowledgeBase: (id: string) => void
  onViewBilling?: () => void
  skillItems: SkillPaletteItem[]
  slashItems: SlashCommandPaletteItem[]
}

function attachmentPickerKind(action: AttachmentPaletteAction): AttachmentPickerKind {
  if (action === "attach-folder") {
    return "directory"
  }
  return action === "attach-file-or-folder" ? "file-or-directory" : "file"
}

export interface UseComposerPaletteResult {
  activeItem: ChatComposerPaletteItem | undefined
  activeTrigger: ComposerTrigger | null
  handleBack: (() => void) | undefined
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  items: ChatComposerPaletteItem[]
  mode: PaletteMode
  onSelect: (item: ChatComposerPaletteItem | undefined) => void
  open: boolean
}

export function useComposerPalette({
  contextItems,
  disabled,
  dismissedTriggerKey,
  dispatch,
  draft,
  draftSelection,
  focusDraftAt,
  onAddArtifactAttachment,
  onAddContextMention,
  onOpenKnowledgeLibrary,
  onSelectAttachments,
  onSelectKnowledgeBase,
  onViewBilling,
  skillItems,
  slashItems,
}: UseComposerPaletteOptions): UseComposerPaletteResult {
  const [paletteNavigation, setPaletteNavigation] = React.useState(initialComposerPaletteNavigation)
  const trigger = React.useMemo(
    () => (disabled ? null : detectComposerTrigger(draft, draftSelection.start, draftSelection.end)),
    [disabled, draft, draftSelection.end, draftSelection.start],
  )
  const triggerKey = trigger ? `${trigger.kind}:${trigger.start}:${trigger.query}` : null
  const activeTrigger = triggerKey && triggerKey !== dismissedTriggerKey ? trigger : null
  const resolvedPaletteNavigation = React.useMemo(
    () => resolveComposerPaletteNavigation(paletteNavigation, activeTrigger),
    [activeTrigger, paletteNavigation],
  )
  const paletteMode = resolvedPaletteNavigation.mode
  const activePaletteIndex = resolvedPaletteNavigation.activeIndex
  const updatePaletteNavigation = React.useCallback(
    (updater: (current: typeof resolvedPaletteNavigation) => typeof resolvedPaletteNavigation) => {
      setPaletteNavigation((current) => updateComposerPaletteNavigation(current, activeTrigger, updater))
    },
    [activeTrigger],
  )
  const items = React.useMemo<ChatComposerPaletteItem[]>(() => {
    if (!activeTrigger) {
      return []
    }
    let sourceItems: ChatComposerPaletteItem[]
    if (activeTrigger.kind === "context") {
      sourceItems = contextItems
    } else if (activeTrigger.kind === "skill" || paletteMode === "skills") {
      sourceItems = skillItems
    } else {
      sourceItems = buildSlashRootPaletteItems({ skillItems, slashItems })
    }
    // 技能模式列出全部技能（默认 limit=8 会把字母序靠后的技能截断）；其余模式保持默认 8 条。
    return filterComposerPaletteItems(
      sourceItems,
      activeTrigger.query,
      activeTrigger.kind === "skill" || paletteMode === "skills" ? 64 : undefined,
    )
  }, [activeTrigger, contextItems, paletteMode, skillItems, slashItems])
  const open = Boolean(activeTrigger)
  const activeItem = items[Math.min(activePaletteIndex, Math.max(0, items.length - 1))]

  const handleBack = React.useCallback(() => {
    const parentIndex = slashItems.findIndex((item) => item.id === "skills")
    updatePaletteNavigation((current) => ({
      ...current,
      activeIndex: parentIndex >= 0 ? parentIndex : 0,
      mode: "root",
    }))
  }, [slashItems, updatePaletteNavigation])

  const applySlashCommand = React.useCallback(
    (item: SlashCommandPaletteItem, currentTrigger: ComposerTrigger) => {
      if (item.disabled) {
        return
      }
      if (item.action === "skills") {
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "/" })
        updatePaletteNavigation((current) => ({ ...current, activeIndex: 0, mode: "skills" }))
        focusDraftAt(currentTrigger.start + 1)
        return
      }
      if (item.action === "billing") {
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "" })
        onViewBilling?.()
        focusDraftAt(currentTrigger.start)
        return
      }
      if (item.action === "bug-report") {
        dispatch({ type: "select-bug-report", trigger: currentTrigger })
        focusDraftAt(currentTrigger.start)
        return
      }
      if (item.action === "compact") {
        // 动作命令：填入输入框，回车后由提交路径执行（对齐 opencode 命令行 /compact）。
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "/compact" })
        focusDraftAt(0)
        return
      }
      if (item.action === "custom" && item.template) {
        // 自定义命令（.opencode/command/*.md）：输入框只显示命令名（/名称），
        // 回车后由提交路径把模板作为消息发送（对齐 opencode 命令，不裸露模板）。
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: `/${item.title}` })
        focusDraftAt(0)
        return
      }
      if (item.action === "undo") {
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "/undo" })
        focusDraftAt(0)
        return
      }
      if (item.action === "redo") {
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "/redo" })
        focusDraftAt(0)
        return
      }
      if (item.action === "init") {
        // /init：输入框只显示 /init，回车后提交路径把 init 模板作为消息发送（不裸露模板）。
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "/init" })
        focusDraftAt(0)
        return
      }
      if (item.action === "review") {
        // /review：输入框只显示 /review，回车后提交路径把审查模板作为消息发送。
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "/review" })
        focusDraftAt(0)
        return
      }
      if (item.action === "attach-file" || item.action === "attach-folder" || item.action === "attach-file-or-folder") {
        dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "" })
        onSelectAttachments(attachmentPickerKind(item.action))
        focusDraftAt(currentTrigger.start)
        return
      }
    },
    [dispatch, focusDraftAt, onAddContextMention, onSelectAttachments, onViewBilling, updatePaletteNavigation],
  )

  const applySkillItem = React.useCallback(
    (item: SkillPaletteItem, currentTrigger: ComposerTrigger) => {
      onAddContextMention(skillPaletteContextMention(item))
      dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "" })
      focusDraftAt(currentTrigger.start)
    },
    [dispatch, focusDraftAt, onAddContextMention],
  )

  const applyAttachmentItem = React.useCallback(
    (item: AttachmentPaletteItem, currentTrigger: ComposerTrigger) => {
      dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "" })
      onSelectAttachments(attachmentPickerKind(item.action))
      focusDraftAt(currentTrigger.start)
    },
    [dispatch, focusDraftAt, onSelectAttachments],
  )

  const applyArtifactItem = React.useCallback(
    (item: ArtifactPaletteItem, currentTrigger: ComposerTrigger) => {
      dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "" })
      onAddArtifactAttachment(item)
      focusDraftAt(currentTrigger.start)
    },
    [dispatch, focusDraftAt, onAddArtifactAttachment],
  )

  const applyKnowledgeItem = React.useCallback(
    (item: KnowledgePaletteItem, currentTrigger: ComposerTrigger) => {
      if (!item.selected) {
        onSelectKnowledgeBase(item.knowledgeBase.id)
      }
      dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "" })
      focusDraftAt(currentTrigger.start)
    },
    [dispatch, focusDraftAt, onSelectKnowledgeBase],
  )

  const applyKnowledgeLibraryItem = React.useCallback(
    (currentTrigger: ComposerTrigger) => {
      dispatch({ type: "replace-trigger", trigger: currentTrigger, replacement: "" })
      onOpenKnowledgeLibrary?.()
      focusDraftAt(currentTrigger.start)
    },
    [dispatch, focusDraftAt, onOpenKnowledgeLibrary],
  )

  const onSelect = React.useCallback(
    (item: ChatComposerPaletteItem | undefined) => {
      if (!item || item.disabled || !activeTrigger) {
        return
      }
      switch (item.kind) {
        case "slash":
          if (activeTrigger.kind === "slash" && paletteMode === "root") {
            applySlashCommand(item, activeTrigger)
          }
          return
        case "attachment":
          applyAttachmentItem(item, activeTrigger)
          return
        case "artifact":
          applyArtifactItem(item, activeTrigger)
          return
        case "knowledge":
          applyKnowledgeItem(item, activeTrigger)
          return
        case "knowledge-library":
          applyKnowledgeLibraryItem(activeTrigger)
          return
        case "skill":
          applySkillItem(item, activeTrigger)
      }
    },
    [
      activeTrigger,
      applyArtifactItem,
      applyAttachmentItem,
      applyKnowledgeItem,
      applyKnowledgeLibraryItem,
      applySkillItem,
      applySlashCommand,
      paletteMode,
    ],
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) {
        return
      }
      if (!open) {
        return
      }
      const action = resolveComposerPaletteKeyAction({
        activeIndex: activePaletteIndex,
        activeRootAction:
          activeTrigger?.kind === "slash" && paletteMode === "root" && activeItem?.kind === "slash"
            ? activeItem.action
            : undefined,
        itemCount: items.length,
        key: event.key,
        paletteMode,
        triggerKind: activeTrigger?.kind,
      })
      if (action.type === "none") {
        return
      }
      event.preventDefault()
      if (action.type === "move") {
        updatePaletteNavigation((current) => ({ ...current, activeIndex: action.index }))
      } else if (action.type === "back") {
        handleBack()
      } else if (action.type === "open-root-item" && activeTrigger && activeItem?.kind === "slash") {
        applySlashCommand(activeItem, activeTrigger)
      } else if (action.type === "select") {
        onSelect(activeItem)
      } else if (action.type === "dismiss") {
        dispatch({ type: "set-dismissed-trigger-key", key: triggerKey })
      }
    },
    [
      activeItem,
      activePaletteIndex,
      activeTrigger,
      applySlashCommand,
      dispatch,
      handleBack,
      items.length,
      onSelect,
      open,
      paletteMode,
      triggerKey,
      updatePaletteNavigation,
    ],
  )

  return {
    activeItem,
    activeTrigger,
    handleBack: activeTrigger?.kind === "slash" && paletteMode !== "root" ? handleBack : undefined,
    handleKeyDown,
    items,
    mode: paletteMode,
    onSelect,
    open,
  }
}
