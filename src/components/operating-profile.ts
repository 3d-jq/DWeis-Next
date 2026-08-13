import type { OperatingMode } from "../../electron/settings/common.ts"

export function operatingModeGateLoading({
  authenticated,
  linkRuntimeLoading,
  modelCatalogAvailable,
  modelCatalogFailed,
  operatingMode,
  settingsLoading,
}: {
  authenticated: boolean
  linkRuntimeLoading: boolean
  modelCatalogAvailable: boolean
  modelCatalogFailed: boolean
  operatingMode: OperatingMode | null
  settingsLoading: boolean
}): boolean {
  return (
    settingsLoading ||
    linkRuntimeLoading ||
    (!modelCatalogAvailable && !modelCatalogFailed) ||
    (authenticated && (operatingMode === null || operatingMode === "unselected"))
  )
}

export function initialSetupRequired(authenticated: boolean, operatingMode: OperatingMode | null): boolean {
  return !authenticated && operatingMode !== "self-managed"
}

export function operatingModeAfterSignOut(operatingMode: OperatingMode | null): OperatingMode | null {
  return operatingMode === "oomol" ? "unselected" : operatingMode
}

export function legacyOperatingMode({
  authenticated,
  hasCustomModel,
}: {
  authenticated: boolean
  hasCustomModel: boolean
}): OperatingMode | null {
  if (authenticated) return null
  return hasCustomModel ? "self-managed" : null
}
