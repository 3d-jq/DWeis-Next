import assert from "node:assert/strict"
import { test } from "vitest"
import { externalModelProviderBaseUrls, ooEndpoint } from "./domain.ts"

test("ooEndpoint is a bare host injected at build time", () => {
  // 由 vite/vitest define 注入（缺省 oomol.com，可由 .env.local 覆盖）；这里只校验形态。
  assert.match(ooEndpoint, /^[a-z0-9.-]+$/)
})

test("custom model provider base URLs are absolute https endpoints", () => {
  for (const url of Object.values(externalModelProviderBaseUrls)) {
    assert.match(url, /^https:\/\/.+/)
  }
})
