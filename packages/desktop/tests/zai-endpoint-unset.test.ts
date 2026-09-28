import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveZaiBusinessBaseUrl,
  resolveZaiOAuthClientId,
  resolveZaiOAuthOrigin,
} from "@zcode/shared";

// DWeis Next 不绑定智谱/Z.ai 云端：zai 域（OAuth 登录页、商务 API、client id）
// 不提供任何默认值。以前这里内置 chat.z.ai / api.z.ai / client_xxx，
// 账号链路一被触发就会悄悄连回人家的服务。
test("zai 域解析器不再有默认地址", () => {
  assert.throws(() => resolveZaiOAuthOrigin({}), /DWeis Next ships no Z.ai defaults/u);
  assert.throws(() => resolveZaiBusinessBaseUrl({}), /DWeis Next ships no Z.ai defaults/u);
  assert.throws(() => resolveZaiOAuthClientId({}), /DWeis Next ships no Z.ai defaults/u);
});

test("zai 域解析器仍接受显式配置", () => {
  // 没有默认值不等于不能配：需要时调用方自己传 env。
  assert.equal(
    resolveZaiOAuthOrigin({ ZAI_OAUTH_ORIGIN: "https://auth.example.com" }).toString(),
    "https://auth.example.com",
  );
  assert.equal(
    resolveZaiBusinessBaseUrl({ ZAI_BUSINESS_BASE_URL: "https://biz.example.com" }).toString(),
    "https://biz.example.com",
  );
  assert.equal(
    resolveZaiOAuthClientId({ ZAI_OAUTH_CLIENT_ID: "explicit-client" }),
    "explicit-client",
  );
});
