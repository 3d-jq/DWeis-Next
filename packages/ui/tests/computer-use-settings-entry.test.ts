import { test } from "node:test";
import assert from "node:assert/strict";
import { isSettingsSectionEnabled } from "../src/lib/settingsNavigation.js";
import { createSettingsPageConfig } from "../src/settings/settingsPageConfig.js";

// computerUse 分区曾被硬隐藏（上游 v3.14.3 的 HIDDEN_SETTINGS_SECTIONS），而
// 「输入框显示电脑操作按钮」开关（computerUseComposerEntryHidden，默认 true）
// 只存在于该分区里——分区看不见 → 开关永远翻不动 → 输入框按钮永远不出现。
// 这组测试锁住放开后的两个边界：桌面可见、Web 形态仍不出现。

test("computerUse 不在设置隐藏集里", () => {
  assert.equal(isSettingsSectionEnabled("computerUse"), true);
});

test("Windows/macOS 桌面配置包含 computerUse 分区", () => {
  for (const options of [{ isDesktop: true }, { isWindowsDesktop: true }, { isMacDesktop: true }]) {
    const { settingsSections } = createSettingsPageConfig(options);
    assert.ok(
      settingsSections.some((section) => section.id === "computerUse"),
      `桌面形态应包含 computerUse：${JSON.stringify(options)}`,
    );
  }
});

test("Web 形态不渲染 computerUse 分区", () => {
  // 桌面三形态（含 Linux，仅展示不可用态）都会挂上分区；只有非桌面缺省配置不挂。
  const { settingsSections } = createSettingsPageConfig({});
  assert.equal(
    settingsSections.some((section) => section.id === "computerUse"),
    false,
    "Web 形态不应包含 computerUse",
  );
});
