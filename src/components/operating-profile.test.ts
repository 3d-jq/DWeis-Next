import { describe, expect, it } from "vitest"
import {
  initialSetupRequired,
  legacyOperatingMode,
  operatingModeAfterSignOut,
  operatingModeGateLoading,
} from "./operating-profile.ts"

describe("operatingModeGateLoading", () => {
  const readyState = {
    authenticated: false,
    linkRuntimeLoading: false,
    modelCatalogAvailable: true,
    modelCatalogFailed: false,
    operatingMode: "self-managed" as const,
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
  it("returns signed-out DWeis users and explicit unselected users to setup", () => {
    expect(initialSetupRequired(false, "oomol")).toBe(true)
    expect(initialSetupRequired(false, "unselected")).toBe(true)
    expect(initialSetupRequired(false, null)).toBe(true)
  })

  it("keeps an explicitly self-managed user in the application", () => {
    expect(initialSetupRequired(false, "self-managed")).toBe(false)
  })

  it("does not interrupt an authenticated session while its profile synchronizes", () => {
    expect(initialSetupRequired(true, null)).toBe(false)
    expect(initialSetupRequired(true, "unselected")).toBe(false)
  })
})

describe("operatingModeAfterSignOut", () => {
  it("returns DWeis users to an explicit unselected state", () => {
    expect(operatingModeAfterSignOut("oomol")).toBe("unselected")
  })

  it("preserves an explicitly selected self-managed profile", () => {
    expect(operatingModeAfterSignOut("self-managed")).toBe("self-managed")
  })

  it("does not turn legacy first-run state into self-managed mode", () => {
    expect(operatingModeAfterSignOut(null)).toBeNull()
    expect(operatingModeAfterSignOut("unselected")).toBe("unselected")
  })
})

describe("legacyOperatingMode", () => {
  it("migrates only a complete signed-out self-managed configuration", () => {
    expect(legacyOperatingMode({ authenticated: false, hasCustomModel: true })).toBe("self-managed")
    expect(legacyOperatingMode({ authenticated: false, hasCustomModel: false })).toBeNull()
    expect(legacyOperatingMode({ authenticated: true, hasCustomModel: true })).toBeNull()
  })
})
