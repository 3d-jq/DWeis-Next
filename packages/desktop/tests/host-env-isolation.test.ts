import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHostProcessEnv } from "../src/main/desktopRuntimeEnv.js";
import {
  ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV,
  ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV,
  ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV,
} from "@zcode/provider-node";

// DWeis Next 的环境契约运行在自己的 DWEIS_* 命名空间。下面这组是「本进程自己
// 已经决定过、但父进程树里可能残留」的路径输入，必须在 host/agent 边界删掉，
// 否则 agent 会拿父进程的解析结果覆盖桌面下发的随包配置。
const OWN_STALE_PATH = {
  [ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: "D:/stale-dweis/active.json",
  [ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV]: "D:/stale-dweis/bundled.json",
  [ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: "D:/stale-dweis/provider_config.json",
};

const FOREIGN_ZCODE_PATH = "D:/zcode_workspace/.zcode/v2/runtime/provider/active.json";
const FOREIGN_ZCODE_INJECTION = {
  ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: FOREIGN_ZCODE_PATH,
  ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: "D:/zcode_workspace/.zcode/v2/provider_config.json",
};

test("env 契约运行在 DWeis 自己的命名空间", () => {
  assert.equal(ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV, "DWEIS_BUILTIN_PROVIDER_CONFIG_FILE");
  assert.equal(
    ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV,
    "DWEIS_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE",
  );
  assert.equal(ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV, "DWEIS_PERSONAL_PROVIDER_CONFIG_FILE");
});

test("DWeis 命名空间里的残留路径不会进入 host env", () => {
  const env = buildHostProcessEnv({ ...OWN_STALE_PATH });

  assert.equal(env[ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV], undefined);
  assert.equal(env[ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV], undefined);
  assert.equal(env[ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV], undefined);
});

test("ZCode 注入的旧变量名在本产品里没有读取方", () => {
  // 隔离不靠过滤，靠命名空间不匹配：注入的旧名既不会变成 DWEIS_* 的值，
  // 也不会以任何形式出现在 host env 的 provider 路径值里。
  const env = buildHostProcessEnv({ ...FOREIGN_ZCODE_INJECTION });
  const dweisValues = [
    env[ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV],
    env[ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV],
    env[ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV],
  ].filter((value) => value !== undefined);

  assert.deepEqual(dweisValues, []);
  for (const value of dweisValues) {
    assert.doesNotMatch(String(value), /[\\/]\.zcode[\\/]/u);
  }
});

test("host env 不再携带 ZAI_* 域凭据与地址", () => {
  // 账号/套餐/支付链路已摘除，桌面侧不再向 host/agent 注入智谱域的
  // OAuth origin、商务 API 与 client id；zai 域在 shared 侧也没有默认值。
  const env = buildHostProcessEnv({});

  assert.equal(env.ZAI_OAUTH_ORIGIN, undefined);
  assert.equal(env.ZAI_BUSINESS_BASE_URL, undefined);
  assert.equal(env.ZAI_OAUTH_CLIENT_ID, undefined);
});
