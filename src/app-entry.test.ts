import { describe, expect, test } from "vitest"
import { resolveAppEntryState } from "./app-entry.ts"

describe("app entry", () => {
  test("enters the app once runtime facts are initialized", () => {
    expect(resolveAppEntryState({ runtimeFailed: false, runtimeReady: true })).toBe("app")
  })

  test("waits while runtime facts are still loading", () => {
    expect(resolveAppEntryState({ runtimeFailed: false, runtimeReady: false })).toBe("loading")
  })

  test("shows recovery UI when runtime capability loading fails", () => {
    expect(resolveAppEntryState({ runtimeFailed: true, runtimeReady: false })).toBe("fallback")
  })
})
