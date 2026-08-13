import type { SettingsStore } from "./store.ts"

import { describe, expect, it, vi } from "vitest"

const { mockGetPath } = vi.hoisted(() => ({
  mockGetPath: vi.fn(() => "/tmp/dweis-user-data"),
}))

vi.mock("electron", () => ({
  app: { getPath: mockGetPath },
  BrowserWindow: {},
  nativeTheme: {},
}))

import { SettingsServiceImpl } from "./node.ts"

function settingsServiceWithPersisted(persisted: ReturnType<SettingsStore["read"]>) {
  const write = vi.fn()
  const store = {
    read: vi.fn(() => persisted),
    write,
  } as unknown as SettingsStore
  return { service: new SettingsServiceImpl({ store }), write }
}

describe("SettingsServiceImpl operating mode", () => {
  it("preserves an explicit unselected profile", () => {
    const { service } = settingsServiceWithPersisted({ operatingMode: "unselected" })
    expect(service.current().operatingMode).toBe("unselected")
  })

  it("defaults an absent legacy profile to self-managed, distinct from explicit unselected", () => {
    const { service } = settingsServiceWithPersisted({})
    expect(service.current().operatingMode).toBe("self-managed")
  })

  it("persists an explicit unselected profile", async () => {
    const persisted = { themeSource: "dark" as const }
    const { service, write } = settingsServiceWithPersisted(persisted)

    await service.setOperatingMode("unselected")

    expect(write).toHaveBeenCalledWith({ ...persisted, operatingMode: "unselected" })
  })
})

describe("SettingsServiceImpl browser setting", () => {
  it("enables the integrated browser by default", () => {
    const { service } = settingsServiceWithPersisted({})
    expect(service.current().browserEnabled).toBe(true)
  })

  it("preserves and persists an explicit disabled setting", async () => {
    const persisted = { browserEnabled: false, themeSource: "dark" as const }
    const { service, write } = settingsServiceWithPersisted(persisted)

    expect(service.current().browserEnabled).toBe(false)
    await service.setBrowserEnabled(true)

    expect(write).toHaveBeenCalledWith({ ...persisted, browserEnabled: true })
  })
})

describe("SettingsServiceImpl subagent model setting", () => {
  it("follows the main model by default", () => {
    const { service } = settingsServiceWithPersisted({})
    expect(service.current().subagentModelId).toBeNull()
  })

  it("reads a persisted custom model choice", () => {
    const { service } = settingsServiceWithPersisted({ subagentModelId: { kind: "custom", id: "deepseek-v4-flash" } })
    expect(service.current().subagentModelId).toEqual({ kind: "custom", id: "deepseek-v4-flash" })
  })

  it("falls back to null for malformed persisted values", () => {
    const { service } = settingsServiceWithPersisted({ subagentModelId: { kind: "unknown", id: "x" } as never })
    expect(service.current().subagentModelId).toBeNull()
  })

  it("persists an explicit custom model choice", async () => {
    const persisted = { themeSource: "dark" as const }
    const { service, write } = settingsServiceWithPersisted(persisted)

    await service.setSubagentModelId({ kind: "custom", id: "deepseek-v4-flash" })

    expect(write).toHaveBeenCalledWith({
      ...persisted,
      subagentModelId: { kind: "custom", id: "deepseek-v4-flash" },
    })
  })

  it("persists null to restore follow-main-model", async () => {
    const persisted = {
      themeSource: "dark" as const,
      subagentModelId: { kind: "custom" as const, id: "x" },
    }
    const { service, write } = settingsServiceWithPersisted(persisted)

    await service.setSubagentModelId(null)

    expect(write).toHaveBeenCalledWith({ ...persisted, subagentModelId: null })
  })
})

describe("SettingsServiceImpl persona setting", () => {
  it("defaults to the work persona", () => {
    const { service } = settingsServiceWithPersisted({})
    expect(service.current().persona).toBe("work")
  })

  it("reads a persisted code persona", () => {
    const { service } = settingsServiceWithPersisted({ persona: "code" })
    expect(service.current().persona).toBe("code")
  })

  it("falls back to work for malformed persisted values", () => {
    const { service } = settingsServiceWithPersisted({ persona: "desk" as never })
    expect(service.current().persona).toBe("work")
  })

  it("persists an explicit persona choice", async () => {
    const persisted = { themeSource: "dark" as const }
    const { service, write } = settingsServiceWithPersisted(persisted)

    await service.setPersona("code")

    expect(write).toHaveBeenCalledWith({ ...persisted, persona: "code" })
  })
})
