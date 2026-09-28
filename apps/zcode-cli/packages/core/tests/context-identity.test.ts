import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCliPrefixSection } from "../src/context/sections/cli-prefix.js";
import { buildDesktopContextSection } from "../src/context/sections/desktop.js";
import { buildIdentitySection } from "../src/context/sections/identity.js";
import { buildExploreAgentPrompt } from "../src/subagent/explore.js";
import { buildGeneralPurposeSystemPrompt } from "../src/subagent/general-purpose.js";

const ZCODE_SELF_REFERENCE = /\bZCode\b/u;

// DWeis Next 是独立品牌：模型在自身身份、桌面上下文和子代理人格里都不能
// 再自称 ZCode。这里逐段断言，回归时能立刻定位是哪一段漏改。
test("CLI prefix 身份段自称 DWeis Next", () => {
  const content = buildCliPrefixSection().content;
  assert.match(content, /^You are DWeis Next, an interactive coding agent$/u);
  assert.doesNotMatch(content, ZCODE_SELF_REFERENCE);
});

test("主身份段与 output style 分支都自称 DWeis Next", () => {
  const interactive = buildIdentitySection().content;
  assert.match(interactive, /You are an interactive DWeis Next agent/u);
  assert.doesNotMatch(interactive, ZCODE_SELF_REFERENCE);

  const styled = buildIdentitySection({ name: "Explanatory", prompt: "Explain first." }).content;
  assert.match(styled, /using DWeis Next's tools and instructions/u);
  assert.doesNotMatch(styled, ZCODE_SELF_REFERENCE);
});

test("桌面上下文段标题为 DWeis Next Desktop Context", () => {
  const section = buildDesktopContextSection();
  assert.equal(section.name, "DWeis Next Desktop Context");
  assert.match(section.content, /^# DWeis Next Desktop Context$/mu);
  assert.doesNotMatch(section.content, ZCODE_SELF_REFERENCE);
});

test("子代理人格不再指回 ZCode CLI", () => {
  const general = buildGeneralPurposeSystemPrompt();
  assert.match(general, /^You are an agent for DWeis Next CLI\./u);
  assert.doesNotMatch(general, ZCODE_SELF_REFERENCE);

  const explore = buildExploreAgentPrompt({ embeddedSearchEnabled: false });
  assert.match(
    explore,
    /^You are DWeis Next Explore, a file search and codebase research specialist for DWeis Next CLI\./u,
  );
  assert.doesNotMatch(explore, ZCODE_SELF_REFERENCE);
});
