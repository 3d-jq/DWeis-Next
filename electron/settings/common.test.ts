import { describe, expect, it } from "vitest"
import { DEFAULT_APP_SETTINGS } from "./common.ts"

describe("DEFAULT_APP_SETTINGS", () => {
  it("matches the Codex task completion notification defaults", () => {
    expect(DEFAULT_APP_SETTINGS).toMatchObject({
      browserEnabled: true,
      completionNotificationCondition: "background",
      notificationSoundEnabled: true,
      operatingMode: "self-managed",
      selfManagedSetupDismissed: false,
      unreadBadgeEnabled: true,
    })
  })

  // v1.0.0 起默认直按 self-managed 模式运行（f222644），无需首次运行选择。
  it("defaults to self-managed, distinct from an explicit unselected profile", () => {
    expect(DEFAULT_APP_SETTINGS.operatingMode).toBe("self-managed")
  })
})
