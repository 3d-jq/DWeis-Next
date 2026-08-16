import { describe, expect, it } from "vitest"
import { initialSetupRequired, legacyOperatingMode, operatingModeGateLoading } from "./operating-profile.ts"

describe("operatingModeGateLoading", () => {
  const readyState = {
    modelCatalogAvailable: true,
    modelCatalogFailed: false,
    settingsLoading: false,
  }

  it("waits while the model catalog is still loading", () => {
    expect(operatingModeGateLoading({ ...readyState, modelCatalogAvailable: false })).toBe(true)
  })

  it("does not leave the app blank after model catalog loading fails", () => {
    expect(operatingModeGateLoading({ ...readyState, modelCatalogAvailable: false, modelCatalogFailed: true })).toBe(
      false,
    )
  })
})

describe("initialSetupRequired", () => {
  it("returns explicit unselected or unset users to setup", () => {
    expect(initialSetupRequired("unselected")).toBe(true)
    expect(initialSetupRequired(null)).toBe(true)
  })

  it("keeps an explicitly self-managed user in the application", () => {
    expect(initialSetupRequired("self-managed")).toBe(false)
  })
})

describe("legacyOperatingMode", () => {
  it("migrates only a complete self-managed configuration", () => {
    expect(legacyOperatingMode({ hasCustomModel: true })).toBe("self-managed")
    expect(legacyOperatingMode({ hasCustomModel: false })).toBeNull()
  })
})
