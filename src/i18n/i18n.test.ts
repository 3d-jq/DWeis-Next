import assert from "node:assert/strict"
import { test } from "vitest"
import { isLocale, translate } from "./i18n.ts"
import { skillsMessages } from "./skills-messages.ts"

test("translate returns locale-specific strings", () => {
  assert.equal(translate("zh-CN", "settings.title"), "设置")
  assert.equal(translate("en", "settings.title"), "Settings")
  assert.equal(translate("zh-CN", "chat.defaultTitle"), "对话")
  assert.equal(translate("en", "chat.defaultTitle"), "Chat")
})

test("translate interpolates {var}", () => {
  assert.equal(translate("en", "chat.contextRemove", { name: "Slack" }), "Remove context: Slack")
  assert.equal(translate("zh-CN", "chat.contextRemove", { name: "Slack" }), "移除上下文：Slack")
  assert.equal(translate("en", "chat.queueTitle", { count: 577 }), "577 queued message(s)")
})

test("translate interpolates OO-style {{var}}", () => {
  assert.equal(translate("zh-CN", "skills.removeDone", { name: "Slack" }), "已从本机移除 Slack。")
  assert.equal(translate("en", "skills.removeDone", { name: "Slack" }), "Slack removed from this Mac.")
  assert.equal(translate("zh-CN", "skills.installed"), "已安装")
})

test("local skill management copy is localized", () => {
  assert.equal(translate("zh-CN", "skills.installedEmpty"), "还没有找到已安装的技能。")
  assert.equal(translate("en", "skills.installedEmpty"), "No installed Skills found.")
  assert.equal(translate("zh-CN", "skills.installedFilter.local"), "本地")
  assert.equal(translate("en", "skills.installedFilter.local"), "Local")
})

test("full access permission mode is localized without implementation labels", () => {
  assert.equal(translate("zh-CN", "chat.permissionModeFullAccess"), "完全访问")
  assert.equal(translate("en", "chat.permissionModeFullAccess"), "Full access")
  assert.match(translate("zh-CN", "chat.permissionModeDefaultDescription"), /普通操作自动执行/)
  assert.match(translate("en", "chat.permissionModeFullAccessDescription"), /high-risk commands/)
  assert.doesNotMatch(translate("zh-CN", "chat.fullAccessDialogTitle"), /YOLO/)
  assert.doesNotMatch(translate("en", "chat.fullAccessDialogTitle"), /YOLO/)
  assert.doesNotMatch(translate("zh-CN", "chat.fullAccessDialogBody"), /YOLO/)
  assert.doesNotMatch(translate("en", "chat.fullAccessDialogBody"), /YOLO/)
})

test("isLocale guards the supported locales", () => {
  assert.equal(isLocale("zh-CN"), true)
  assert.equal(isLocale("en"), true)
  assert.equal(isLocale("fr"), false)
  assert.equal(isLocale(null), false)
})

test("skills i18n locale keysets stay in parity", () => {
  assert.deepEqual(flattenKeys(skillsMessages["zh-CN"]), flattenKeys(skillsMessages.en))
})

function flattenKeys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([key, entry]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return flattenKeys(entry as Record<string, unknown>, nextKey)
      }
      return [nextKey]
    })
    .sort()
}
