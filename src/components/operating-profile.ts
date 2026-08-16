import type { OperatingMode } from "../../electron/settings/common.ts"

// DWeis Next 只运行 local self-managed 模式：无云登录，首次启动（或未选 self-managed）
// 时进入模型配置引导，配置完成后固定为 self-managed。

export function operatingModeGateLoading({
  modelCatalogAvailable,
  modelCatalogFailed,
  settingsLoading,
}: {
  modelCatalogAvailable: boolean
  modelCatalogFailed: boolean
  settingsLoading: boolean
}): boolean {
  return settingsLoading || (!modelCatalogAvailable && !modelCatalogFailed)
}

export function initialSetupRequired(operatingMode: OperatingMode | null): boolean {
  return operatingMode !== "self-managed"
}

export function legacyOperatingMode({ hasCustomModel }: { hasCustomModel: boolean }): OperatingMode | null {
  return hasCustomModel ? "self-managed" : null
}
