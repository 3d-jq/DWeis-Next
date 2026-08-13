import assert from "node:assert/strict"
import { test } from "vitest"
import { ooEndpoint } from "../domain.ts"
import {
  browserLoginUrl,
  extractOomolTokenFromCookies,
  normalizeLoginProfile,
  parseSigninCallback,
} from "./browser-login.ts"

test("browserLoginUrl carries the deep-link protocol back to the console launcher", () => {
  assert.equal(browserLoginUrl("dweis"), `https://console.${ooEndpoint}/launcher?protocol=dweis`)
  assert.equal(browserLoginUrl("dweis-local"), `https://console.${ooEndpoint}/launcher?protocol=dweis-local`)
})

test("parseSigninCallback accepts <scheme>://signin?authID=", () => {
  assert.equal(parseSigninCallback("dweis://signin?authID=auth-1", "dweis"), "auth-1")
  assert.equal(parseSigninCallback("dweis://signin/?authID=auth-1", "dweis"), "auth-1")
  assert.equal(parseSigninCallback("dweis-local://signin?authID=a", "dweis-local"), "a")
})

test("parseSigninCallback rejects foreign/malformed URLs", () => {
  assert.equal(parseSigninCallback("dweis://other?authID=a", "dweis"), undefined)
  assert.equal(parseSigninCallback("dweis://signin/extra?authID=a", "dweis"), undefined)
  assert.equal(parseSigninCallback("oomol-desktop://signin?authID=a", "dweis"), undefined)
  assert.equal(parseSigninCallback("dweis://signin", "dweis"), undefined)
  assert.equal(parseSigninCallback("not a url", "dweis"), undefined)
})

test("extractOomolTokenFromCookies finds the session token", () => {
  assert.equal(extractOomolTokenFromCookies(["foo=bar; Path=/", "oomol-token=tok-123; HttpOnly; Secure"]), "tok-123")
  assert.equal(extractOomolTokenFromCookies(["foo=bar"]), undefined)
  assert.equal(extractOomolTokenFromCookies([]), undefined)
})

test("normalizeLoginProfile prefers nickname and requires uid", () => {
  assert.deepEqual(
    normalizeLoginProfile({
      uid: "u1",
      nickname: "Nick",
      username: "user",
      avatar_url: "https://example.com/avatar.png",
    }),
    {
      id: "u1",
      name: "Nick",
      avatarUrl: "https://example.com/avatar.png",
      username: "user",
    },
  )
  assert.deepEqual(normalizeLoginProfile({ uid: "u1", username: "user" }), {
    id: "u1",
    name: "user",
    username: "user",
  })
  assert.deepEqual(normalizeLoginProfile({ uid: "u1", username: "user", avatar_url: "javascript:bad" }), {
    id: "u1",
    name: "user",
    username: "user",
  })
  assert.deepEqual(normalizeLoginProfile({ uid: "u1", username: "user", url: "https://avatars.example.com/u1" }), {
    id: "u1",
    name: "user",
    avatarUrl: "https://avatars.example.com/u1",
    username: "user",
  })
  assert.deepEqual(normalizeLoginProfile({ uid: "u1", email: "user@example.com" }), {
    id: "u1",
    name: "user@example.com",
    email: "user@example.com",
  })
  assert.deepEqual(normalizeLoginProfile({ uid: "u1" }), { id: "u1", name: "u1" })
  assert.equal(normalizeLoginProfile({ nickname: "no-uid" }), undefined)
})
