import type { DWeisReasoningLevel, DWeisReasoningVariant } from "../../../electron/agent/reasoning.ts"
import type { CustomModelSummary } from "../../../electron/models/common.ts"
import type { ModelCatalog } from "../../../electron/models/common.ts"
import type { OperatingMode, SubagentModelChoice } from "../../../electron/settings/common.ts"
import type { TranslateFn } from "@/i18n/i18n"
import type { UseModelCatalog } from "@/routes/Chat/useModelCatalog"
import type { LucideIcon } from "lucide-react"

import { BotIcon, BrainCircuitIcon, PencilIcon, PlusIcon, SearchIcon, ServerIcon, Trash2Icon } from "lucide-react"
import * as React from "react"
import { DWEIS_REASONING_VARIANT_LEVELS, opencodeReasoningVariant } from "../../../electron/agent/reasoning.ts"
import { SettingsItem } from "./settings-section.tsx"
import { ErrorNotice } from "@/components/ErrorNotice"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useI18n } from "@/i18n/i18n"
import { cn } from "@/lib/utils"
import { AddCustomModelDialog } from "@/routes/Chat/AddCustomModelDialog"
import { useModelCatalog } from "@/routes/Chat/useModelCatalog"

/** 运行方案概览（本地模式下的模型设置分类页顶部）。 */
export function RuntimeProfileSummary({ mode }: { mode: OperatingMode | null }) {
  const { t } = useI18n()
  const description =
    mode === "self-managed"
      ? t("settings.runtimeProfileSelfDescription")
      : t("settings.runtimeProfileUnselectedDescription")
  const label =
    mode === "self-managed" ? t("settings.runtimeProfileSelfManaged") : t("settings.runtimeProfileUnselected")
  return (
    <SettingsItem title={t("settings.runtimeProfile")} description={description} icon={ServerIcon}>
      <span className="oo-text-caption rounded-full border bg-background px-2.5 py-1 font-medium text-foreground">
        {label}
      </span>
    </SettingsItem>
  )
}

/** 单个子代理的模型 + 推理强度配置块（general / explore 共用）。 */
function SubagentConfigBlock({
  title,
  description,
  icon: Icon,
  modelValue,
  onModelChange,
  reasoningValue,
  onReasoningChange,
  catalog,
  t,
}: {
  title: string
  description: string
  icon: LucideIcon
  modelValue: SubagentModelChoice | null
  onModelChange: (modelId: SubagentModelChoice | null) => void
  reasoningValue: DWeisReasoningLevel | null
  onReasoningChange: (level: DWeisReasoningLevel | null) => void
  catalog: ModelCatalog | null
  t: TranslateFn
}) {
  const choice = modelValue
  const value = choice ? `${choice.kind}:${choice.id}` : "default"
  const selectedLabel = choice
    ? choice.kind === "custom"
      ? catalog?.customModels.find((item) => item.id === choice.id)?.displayName
      : catalog?.builtins.find((item) => item.id === choice.id)?.displayName
    : undefined

  return (
    <SettingsItem title={title} description={description} icon={Icon}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="grid gap-1">
          <span className="oo-text-micro font-medium text-muted-foreground">{t("settings.subagentModelTitle")}</span>
          <Select
            value={value}
            onValueChange={(next) => onModelChange(next === "default" ? null : decodeSubagentModelChoice(next))}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={selectedLabel ?? t("settings.subagentModelFollowDefault")} />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
              <SelectItem value="default">{t("settings.subagentModelFollowDefault")}</SelectItem>
              {catalog?.customModels.map((model) => (
                <SelectItem key={model.id} value={`custom:${model.id}`}>
                  {model.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <span className="oo-text-micro font-medium text-muted-foreground">
            {t("settings.subagentReasoningTitle")}
          </span>
          <Select
            value={reasoningValue ?? "default"}
            onValueChange={(next) => onReasoningChange(next === "default" ? null : (next as DWeisReasoningLevel))}
          >
            <SelectTrigger className="w-44">
              <SelectValue
                placeholder={
                  reasoningValue
                    ? t(reasoningLevelLabelKey[opencodeReasoningVariant(reasoningValue)!])
                    : t("settings.subagentReasoningFollow")
                }
              />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
              <SelectItem value="default">{t("settings.subagentReasoningFollow")}</SelectItem>
              {DWEIS_REASONING_VARIANT_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {t(reasoningLevelLabelKey[level])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingsItem>
  )
}

/** 子代智能体（general + explore）模型 + 推理强度选择：默认跟随主会话，可独立指定。 */
export function SubagentModelSettings({ models }: { models: UseModelCatalog }) {
  const { t } = useI18n()
  const { settings, setExploreModelId, setExploreReasoningLevel, setSubagentModelId, setSubagentReasoningLevel } =
    useAppSettings()
  const catalog = models.catalog

  return (
    <>
      <SubagentConfigBlock
        title={t("settings.subagentModelTitle")}
        description={t("settings.subagentModelDescription")}
        icon={BotIcon}
        modelValue={settings.subagentModelId}
        onModelChange={setSubagentModelId}
        reasoningValue={settings.subagentReasoningLevel}
        onReasoningChange={setSubagentReasoningLevel}
        catalog={catalog}
        t={t}
      />
      <SubagentConfigBlock
        title={t("settings.exploreModelTitle")}
        description={t("settings.exploreModelDescription")}
        icon={SearchIcon}
        modelValue={settings.exploreModelId}
        onModelChange={setExploreModelId}
        reasoningValue={settings.exploreReasoningLevel}
        onReasoningChange={setExploreReasoningLevel}
        catalog={catalog}
        t={t}
      />
    </>
  )
}

/** 推理强度档位 → i18n key（与主模型推理强度选择器同文案）。 */
const reasoningLevelLabelKey = {
  low: "chat.reasoningLevelLow",
  medium: "chat.reasoningLevelMedium",
  high: "chat.reasoningLevelHigh",
  max: "chat.reasoningLevelMax",
} as const satisfies Record<DWeisReasoningVariant, string>

/** 把 Select 的 `${kind}:${id}` 值解码回模型选择；非法值回落为 null（跟随主模型）。 */
function decodeSubagentModelChoice(value: string): SubagentModelChoice | null {
  const separator = value.indexOf(":")
  if (separator <= 0) {
    return null
  }
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if ((kind === "builtin" || kind === "custom") && id) {
    return { kind, id }
  }
  return null
}

export function ModelSettings({
  connectorsEnabled,
  models,
}: {
  connectorsEnabled: boolean
  models: ReturnType<typeof useModelCatalog>
}) {
  const { t } = useI18n()
  const [editingModel, setEditingModel] = React.useState<CustomModelSummary | undefined>()
  const [deletingModel, setDeletingModel] = React.useState<CustomModelSummary | null>(null)
  const catalog = models.catalog
  const selectedCustomId = catalog?.selected.kind === "custom" ? catalog.selected.id : null
  const selectedBuiltinId = catalog?.selected.kind === "builtin" ? catalog.selected.id : null
  const selectedModel =
    catalog?.selected.kind === "custom"
      ? catalog.customModels.find((item) => item.id === catalog.selected.id)?.displayName
      : connectorsEnabled
        ? catalog?.builtins.find((item) => item.id === catalog.selected.id)?.displayName
        : undefined

  const openAdd = (presetProviderId?: string) => {
    setEditingModel(undefined)
    models.openDialog(presetProviderId)
  }
  const openEdit = (model: CustomModelSummary) => {
    setEditingModel(model)
    models.openDialog()
  }
  const closeDialog = () => {
    setEditingModel(undefined)
    models.closeDialog()
  }

  return (
    <section className="grid gap-4 border-b border-[var(--oo-divider)] px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
            <BrainCircuitIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="oo-text-label text-foreground">{t("settings.modelsTitle")}</h3>
              <span className="oo-text-caption rounded-full border px-2 py-0.5">{t("settings.required")}</span>
            </div>
            <p className="oo-text-caption mt-0.5">
              {selectedModel
                ? t("settings.modelsCurrent", { model: selectedModel })
                : t("settings.modelsNotConfigured")}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => openAdd("custom")}>
          <PlusIcon className="size-4" />
          {t("settings.modelsAddProvider")}
        </Button>
      </div>

      {catalog ? (
        <div className="grid gap-3">
          {connectorsEnabled && catalog.builtins.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="oo-text-caption-compact font-medium text-muted-foreground">{t("settings.modelsOomol")}</p>
              {catalog.builtins.map((model) => (
                <ModelRow
                  key={model.id}
                  active={selectedBuiltinId === model.id}
                  description={model.providerName}
                  name={model.displayName}
                  onSelect={() => models.selectModel({ kind: "builtin", id: model.id })}
                />
              ))}
            </div>
          ) : null}

          {/* 自定义模型按供应商分组：先供应商，供应商下再模型 */}
          {customModelsByProvider(catalog.customModels).map((group) => (
            <div key={group.providerId} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="oo-text-caption-compact font-medium text-muted-foreground">
                  {providerDisplayName(catalog.providers, group.providerId, group.providerName)}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => openAdd(group.providerId)}
                >
                  <PlusIcon className="size-3.5" />
                  {t("settings.modelsAddModel")}
                </Button>
              </div>
              {group.models.map((model) => (
                <ModelRow
                  key={model.id}
                  active={selectedCustomId === model.id}
                  description={model.modelName}
                  name={model.displayName}
                  onEdit={() => openEdit(model)}
                  onDelete={() => setDeletingModel(model)}
                  onSelect={() => models.selectModel({ kind: "custom", id: model.id })}
                />
              ))}
            </div>
          ))}
          {catalog.customModels.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-4 text-center">
              <p className="oo-text-caption">{t("settings.modelsEmpty")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {models.catalogError ? <ErrorNotice error={models.catalogError} compact /> : null}
      {models.selectionError ? <ErrorNotice error={models.selectionError} compact /> : null}
      <AddCustomModelDialog
        connectorsEnabled={connectorsEnabled}
        model={editingModel}
        open={models.dialogOpen}
        presetProviderId={models.presetProviderId}
        providers={catalog?.providers ?? []}
        error={models.dialogError}
        onClose={closeDialog}
        onSave={models.saveModel}
      />
      {/* 删除模型确认（Electron 渲染层 globalThis.confirm 不可靠，改用应用内 Dialog） */}
      <Dialog
        open={Boolean(deletingModel)}
        onClose={() => setDeletingModel(null)}
        title={t("settings.modelsDelete")}
        description={t("settings.modelsDeleteConfirm", { model: deletingModel?.displayName ?? "" })}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeletingModel(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deletingModel) {
                  models.deleteModel(deletingModel.id)
                }
                setDeletingModel(null)
              }}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </section>
  )
}

/** 自定义模型按 providerId 分组（保持出现顺序）。 */
function customModelsByProvider(
  models: CustomModelSummary[],
): Array<{ providerId: string; providerName: string; models: CustomModelSummary[] }> {
  const groups: Array<{ providerId: string; providerName: string; models: CustomModelSummary[] }> = []
  for (const model of models) {
    let group = groups.find((item) => item.providerId === model.providerId)
    if (!group) {
      group = { providerId: model.providerId, providerName: model.providerName, models: [] }
      groups.push(group)
    }
    group.models.push(model)
  }
  return groups
}

/** 供应商显示名：优先用模型记录的 providerName（用户可在编辑模型时自定义），
 * 空时才退回 catalog 里的 provider displayName。 */
function providerDisplayName(providers: ModelCatalog["providers"], providerId: string, fallback: string): string {
  return fallback.trim() || providers.find((provider) => provider.id === providerId)?.displayName || fallback
}

export function ModelRow({
  active,
  description,
  name,
  onDelete,
  onEdit,
  onSelect,
}: {
  active: boolean
  description: string
  name: string
  onDelete?: () => void
  onEdit?: () => void
  onSelect: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2",
        active && "border-primary/40 bg-primary/[0.035]",
      )}
    >
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full border", active && "border-primary bg-primary")} />
          <span className="oo-text-label truncate">{name}</span>
        </span>
        <span className="oo-text-caption ml-4 block truncate">{description}</span>
      </button>
      {onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          title={t("settings.modelsEdit")}
          onClick={onEdit}
        >
          <PencilIcon className="size-4" />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          title={t("settings.modelsDelete")}
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}
