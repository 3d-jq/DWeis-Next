import type { ModelCatalog, ModelChoice } from "../../../electron/models/common.ts"
import type { ModelMenuItem, ModelTier } from "./model-control-options.ts"

import { ChevronDown, ChevronRight, Cpu, Settings2 } from "lucide-react"
import * as React from "react"
import { createPortal } from "react-dom"
import { buildModelMenuItems, selectedModelSummary } from "./model-control-options.ts"
import { ModelRow } from "./model-control-rows.tsx"
import { clampNumber, modelMenuItemElementId, nextModelMenuIndex } from "./model-control-utils.ts"
import { useComposerMenu } from "./useComposerMenu.ts"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/i18n"
import { cn } from "@/lib/utils"

/** 供应商分组：providerId 或 "builtin"；items 为该分组下的模型（不含"添加"动作）。 */
interface ProviderModelGroup {
  id: string
  title: string
  items: ModelMenuItem[]
}

function providerMenuItemElementId(providerId: string): string {
  return `model-provider-item-${providerId}`
}

function modelTierCopy(tier: ModelTier, t: ReturnType<typeof useT>): { description: string; label: string } {
  switch (tier) {
    case "high":
      return { description: t("chat.modelTierHighDescription"), label: t("chat.modelTierHigh") }
    case "medium":
      return { description: t("chat.modelTierMediumDescription"), label: t("chat.modelTierMedium") }
    case "low":
      return { description: t("chat.modelTierLowDescription"), label: t("chat.modelTierLow") }
  }
}

/** 把模型按供应商分组：内置一组，自定义按 providerId 分组。 */
function buildProviderGroups(catalog: ModelCatalog | null, addTitle: string): ProviderModelGroup[] {
  const groups: ProviderModelGroup[] = []
  if (!catalog) {
    return groups
  }
  const builtins = buildModelMenuItems(catalog, addTitle).filter((item) => item.kind === "builtin")
  if (builtins.length > 0) {
    groups.push({ id: "builtin", title: "DWeis Next", items: builtins })
  }
  const customItems = buildModelMenuItems(catalog, addTitle).filter(
    (item): item is Extract<ModelMenuItem, { kind: "custom" }> => item.kind === "custom",
  )
  const byProvider = new Map<string, ProviderModelGroup>()
  for (const item of customItems) {
    const model = catalog.customModels.find((candidate) => candidate.id === item.modelId)
    const providerId = model?.providerId ?? "custom"
    let group = byProvider.get(providerId)
    if (!group) {
      const provider = catalog.providers.find((candidate) => candidate.id === providerId)
      group = {
        id: providerId,
        // 优先用模型记录的 providerName（用户可自定义），空时退回 catalog 预设。
        title: model?.providerName?.trim() || provider?.displayName || model?.providerName || "Custom",
        items: [],
      }
      byProvider.set(providerId, group)
    }
    group.items.push(item)
  }
  groups.push(...byProvider.values())
  return groups
}

/**
 * 模型选择器（输入框）：点模型按钮 → 供应商列表；hover/点击供应商 → 旁侧面板显示该供应商模型。
 * 推理强度由独立的 ReasoningStrengthSlider 控制，这里只负责模型选择。
 */
export function ModelReasoningPicker({
  catalog,
  disabled,
  modelRequired = false,
  onSelectModel,
  onDeleteModel,
  onAddModel,
}: {
  catalog: ModelCatalog | null
  disabled: boolean
  modelRequired?: boolean
  onSelectModel: (choice: ModelChoice) => void
  onDeleteModel: (id: string) => void
  onAddModel: () => void
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
  const [activeProviderIndex, setActiveProviderIndex] = React.useState(0)
  const [activeModelIndex, setActiveModelIndex] = React.useState(0)
  const [modelMenuStyle, setModelMenuStyle] = React.useState<React.CSSProperties>({})
  const providerMenuRef = React.useRef<HTMLDivElement | null>(null)
  const modelMenuRef = React.useRef<HTMLDivElement | null>(null)
  const providerItemRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const modelItemRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const selected = selectedModelSummary(catalog)
  const modelLabel = modelRequired ? t("chat.modelSelectOrConfigure") : selected.label
  const triggerTitle = !modelRequired
    ? [
        modelLabel,
        selected.kind === "custom" ? t("chat.modelByokDescription") : null,
        selected.supportsImages ? t("chat.modelVision") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : modelLabel
  const addTitle = t("chat.modelAdd")
  const providerGroups = React.useMemo<ProviderModelGroup[]>(() => buildProviderGroups(catalog, addTitle), [catalog, addTitle])
  const activeProvider = providerGroups[activeProviderIndex]
  const activeProviderElementId = activeProvider ? providerMenuItemElementId(activeProvider.id) : undefined
  const activeModelItem = activeProvider?.items[activeModelIndex]
  const activeModelItemElementId = activeModelItem ? modelMenuItemElementId(activeModelItem.id) : undefined

  // 模型面板（右侧）定位：对齐当前选中的供应商行（该行顶部与面板顶部齐平），
  // 切换供应商时面板跟随行位置，而不是固定在菜单底部。
  const updateModelMenuPosition = React.useCallback(() => {
    const menu = providerMenuRef.current
    if (!menu) {
      return
    }
    const rect = menu.getBoundingClientRect()
    const margin = 16
    const gap = 6
    const width = Math.min(232, window.innerWidth - margin * 2)
    const rightLeft = rect.right + gap
    const left =
      rightLeft + width <= window.innerWidth - margin
        ? rightLeft
        : clampNumber(rect.left - width - gap, margin, window.innerWidth - width - margin)
    // 顶部 = 供应商菜单顶部 + 选中行在菜单内的偏移（行高约 36px，含折叠后）。
    const activeRow = activeProvider ? providerItemRefs.current.get(activeProvider.id) : undefined
    const rowOffset = activeRow ? activeRow.getBoundingClientRect().top - rect.top : 0
    const top = Math.max(margin, rect.top + rowOffset)
    const maxHeight = Math.max(180, window.innerHeight - margin - top)
    setModelMenuStyle({ left, top, width, maxHeight })
  }, [activeProvider])

  const additionalOutsideRefs = React.useMemo(() => [modelMenuRef], [])
  const closeModelMenu = React.useCallback((): void => setModelMenuOpen(false), [])
  const repositionModelMenu = React.useCallback((): void => {
    if (modelMenuOpen) {
      updateModelMenuPosition()
    }
  }, [modelMenuOpen, updateModelMenuPosition])
  const { closeMenu, handleTriggerKeyDown, menuRef, menuStyle, rootRef, toggleMenu, triggerRef } = useComposerMenu({
    additionalOutsideRefs,
    align: "right",
    disabled,
    menuRef: providerMenuRef,
    minHeight: 180,
    onClose: closeModelMenu,
    onReposition: repositionModelMenu,
    open,
    setOpen,
    width: 232,
  })

  React.useLayoutEffect(() => {
    if (open && modelMenuOpen) {
      updateModelMenuPosition()
    }
  }, [menuStyle, modelMenuOpen, open, updateModelMenuPosition])

  const focusProviderItem = React.useCallback((group: ProviderModelGroup | undefined): void => {
    if (!group) {
      return
    }
    providerItemRefs.current.get(group.id)?.focus()
  }, [])

  const focusModelItem = React.useCallback((item: ModelMenuItem | undefined): void => {
    if (!item) {
      return
    }
    modelItemRefs.current.get(item.id)?.focus()
  }, [])

  const openModelMenu = React.useCallback(
    (focusSelected = false): void => {
      const group = providerGroups[activeProviderIndex]
      if (!group) {
        return
      }
      const selectedIndex = group.items.findIndex((item) => item.active)
      const nextIndex = selectedIndex >= 0 ? selectedIndex : 0
      setActiveModelIndex(nextIndex)
      setModelMenuOpen(true)
      if (focusSelected) {
        window.requestAnimationFrame(() => focusModelItem(group.items[nextIndex]))
      }
    },
    [activeProviderIndex, focusModelItem, providerGroups],
  )

  const activateModelItem = React.useCallback(
    (item: ModelMenuItem | undefined): void => {
      if (!item) {
        return
      }
      if (item.kind === "add") {
        closeMenu(false)
        onAddModel()
        return
      }
      onSelectModel(item.choice)
      closeMenu()
    },
    [closeMenu, onAddModel, onSelectModel],
  )

  React.useEffect(() => {
    if (!open) {
      return
    }
    setModelMenuOpen(false)
    // 打开时定位到含当前选中模型的供应商（而不是恒为第一个 DeepSeek）：
    // 默认选了 MiniMax 却高亮 DeepSeek 是误导。
    const selectedGroupIndex = providerGroups.findIndex((group) => group.items.some((item) => item.active))
    const nextIndex = selectedGroupIndex >= 0 ? selectedGroupIndex : 0
    setActiveProviderIndex(nextIndex)
    window.requestAnimationFrame(() => focusProviderItem(providerGroups[nextIndex]))
  }, [focusProviderItem, open, providerGroups])

  React.useEffect(() => {
    setActiveProviderIndex((index) => Math.min(index, Math.max(0, providerGroups.length - 1)))
    setActiveModelIndex(0)
  }, [providerGroups.length])

  const handleProviderMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Tab") {
      closeMenu(false)
      return
    }

    if (providerGroups.length === 0) {
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      setModelMenuOpen(false)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const nextIndex = nextModelMenuIndex(activeProviderIndex, providerGroups.length, 1)
      setActiveProviderIndex(nextIndex)
      setModelMenuOpen(false)
      focusProviderItem(providerGroups[nextIndex])
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      const nextIndex = nextModelMenuIndex(activeProviderIndex, providerGroups.length, -1)
      setActiveProviderIndex(nextIndex)
      setModelMenuOpen(false)
      focusProviderItem(providerGroups[nextIndex])
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      setActiveProviderIndex(0)
      setModelMenuOpen(false)
      focusProviderItem(providerGroups[0])
      return
    }
    if (event.key === "End") {
      event.preventDefault()
      const nextIndex = providerGroups.length - 1
      setActiveProviderIndex(nextIndex)
      setModelMenuOpen(false)
      focusProviderItem(providerGroups[nextIndex])
      return
    }
    if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openModelMenu(true)
    }
  }

  const handleModelMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Tab") {
      closeMenu(false)
      return
    }

    const items = activeProvider?.items ?? []
    if (items.length === 0) {
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      setModelMenuOpen(false)
      window.requestAnimationFrame(() => focusProviderItem(activeProvider))
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const nextIndex = nextModelMenuIndex(activeModelIndex, items.length, 1)
      setActiveModelIndex(nextIndex)
      focusModelItem(items[nextIndex])
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      const nextIndex = nextModelMenuIndex(activeModelIndex, items.length, -1)
      setActiveModelIndex(nextIndex)
      focusModelItem(items[nextIndex])
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      setActiveModelIndex(0)
      focusModelItem(items[0])
      return
    }
    if (event.key === "End") {
      event.preventDefault()
      const nextIndex = items.length - 1
      setActiveModelIndex(nextIndex)
      focusModelItem(items[nextIndex])
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      activateModelItem(items[activeModelIndex])
      return
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      const item = items[activeModelIndex]
      if (item?.kind === "custom") {
        event.preventDefault()
        onDeleteModel(item.modelId)
      }
    }
  }

  const modelMenu =
    open && modelMenuOpen && activeProvider
      ? createPortal(
          <div
            ref={modelMenuRef}
            style={modelMenuStyle}
            role="menu"
            tabIndex={-1}
            aria-activedescendant={activeModelItemElementId}
            aria-label={t("chat.modelSection")}
            className="oo-border-divider fixed z-50 overflow-y-auto rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl"
            onKeyDown={handleModelMenuKeyDown}
          >
            <div className="oo-text-caption-compact px-2 py-1.5 font-medium text-muted-foreground">{activeProvider.title}</div>
            {activeProvider.items.map((item, index) => {
              if (item.kind === "add") {
                return null
              }
              const common = {
                id: modelMenuItemElementId(item.id),
                ref: (node: HTMLButtonElement | null) => {
                  if (node) {
                    modelItemRefs.current.set(item.id, node)
                  } else {
                    modelItemRefs.current.delete(item.id)
                  }
                },
                active: item.active,
                highlighted: index === activeModelIndex,
                icon: <Cpu className="size-4 shrink-0 text-muted-foreground" />,
                role: "menuitemradio" as const,
                title: item.title,
                supportsImages: item.supportsImages,
                visionLabel: t("chat.modelSupportsImages"),
                onHighlight: () => setActiveModelIndex(index),
                onSelect: () => activateModelItem(item),
              }
              return item.kind === "builtin" ? (
                <ModelRow
                  key={item.id}
                  {...common}
                  tierDescription={item.tier ? modelTierCopy(item.tier, t).description : undefined}
                  tierLabel={item.tier ? modelTierCopy(item.tier, t).label : undefined}
                />
              ) : (
                <ModelRow
                  key={item.id}
                  {...common}
                  deleteLabel={t("chat.modelDelete")}
                  onDelete={() => onDeleteModel(item.modelId)}
                />
              )
            })}
          </div>,
          document.body,
        )
      : null

  const providerMenu = open
    ? createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          role="menu"
          tabIndex={-1}
          aria-activedescendant={activeProviderElementId}
          aria-label={t("chat.modelProviders")}
          className="oo-border-divider fixed z-50 overflow-y-auto rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl"
          onKeyDown={handleProviderMenuKeyDown}
        >
          <div className="oo-text-caption-compact px-2 py-1.5 font-medium text-muted-foreground">
            {t("chat.modelProviders")}
          </div>
          {providerGroups.map((group, index) => (
            <button
              key={group.id}
              id={providerMenuItemElementId(group.id)}
              ref={(node) => {
                if (node) {
                  providerItemRefs.current.set(group.id, node)
                } else {
                  providerItemRefs.current.delete(group.id)
                }
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen && index === activeProviderIndex}
              tabIndex={-1}
              title={`${group.title} · ${group.items.length}`}
              className={cn(
                "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-accent hover:text-accent-foreground",
                index === activeProviderIndex && "bg-accent text-accent-foreground",
              )}
              onMouseEnter={() => {
                setActiveProviderIndex(index)
                openModelMenu(false)
              }}
              onClick={() => {
                setActiveProviderIndex(index)
                openModelMenu(true)
              }}
            >
              <Cpu className="size-4 shrink-0 text-muted-foreground" />
              <span className="oo-text-label min-w-0 flex-1 truncate">{group.title}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
          <div className="oo-border-divider mt-1 border-t pt-1">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="oo-text-body flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                closeMenu(false)
                onAddModel()
              }}
            >
              <Settings2 className="size-4 text-muted-foreground" />
              <span>{addTitle}</span>
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className="max-w-full min-w-0 shrink">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        title={`${t("chat.modelReasoningPicker")} · ${triggerTitle}`}
        aria-label={t("chat.modelReasoningPicker")}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        className="oo-composer-model-button flex h-8 max-w-[15rem] min-w-0 shrink items-center gap-1 rounded-full px-2"
        onClick={toggleMenu}
        onKeyDown={handleTriggerKeyDown}
      >
        <Cpu className="size-4 shrink-0" />
        <span className="oo-composer-model-text flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="min-w-0 truncate">{modelLabel}</span>
        </span>
        <ChevronDown
          className={cn("oo-composer-control-chevron size-3.5 shrink-0 transition-transform", open && "rotate-180")}
        />
      </Button>
      {providerMenu}
      {modelMenu}
    </div>
  )
}
