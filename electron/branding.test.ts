import assert from "node:assert"
import { describe, it } from "vitest"

import { branding, serviceName, storageKey } from "./branding.ts"

describe("branding storage-key contract", () => {
  it("keeps the legacy 'dweis' localStorage prefix for user-data continuity", () => {
    // 与硬编码的 dweis.* key 及老用户本地配置保持一致；改 "dweisnext" 会造成双前缀并存。
    assert.equal(branding.storageKeyPrefix, "dweis")
    assert.equal(storageKey("theme"), "dweis.theme")
    assert.equal(storageKey("locale"), "dweis.locale")
  })

  it("exposes the dweisnext window bridge name", () => {
    assert.equal(branding.windowBridge, "dweisnext")
  })

  it("builds service names under the dweisnext service prefix", () => {
    assert.equal(serviceName("ping-service"), "dweisnext/ping-service")
  })
})
