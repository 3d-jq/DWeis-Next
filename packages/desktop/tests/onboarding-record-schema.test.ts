import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingRecordFileSchema } from "@zcode/shared";

// 线上故障（用户机器日志实锤）：记录写入时 deviceMid 是空串（DWeis Next 无遥测，
// 本来就没有设备 ID），但 schema 用 min(1) 校验，每次读取都抛 ZodError →
// 「当作文件不存在」→ shouldOnboard 每次都返回 true → 引导每次启动重现，
// 用户关闭引导写下的 dismissed 决定也永远读不回来。
// 这里用用户机器上的真实形状锁定：deviceMid="" 必须能读回。
const DISMISSED_RECORD_ON_USER_MACHINE = {
  version: 2,
  deviceMid: "",
  entries: [],
  decisions: [
    {
      userId: null,
      status: "dismissed",
      reason: "user_closed",
      decidedAt: "2026-09-29T10:50:11.817Z",
    },
  ],
};

test("deviceMid 为空串的记录可以读回（dismissed 不再丢失）", () => {
  const parsed = onboardingRecordFileSchema.parse(DISMISSED_RECORD_ON_USER_MACHINE);

  assert.equal(parsed.version, 2);
  assert.equal(parsed.decisions.length, 1);
  assert.equal(parsed.decisions[0]!.status, "dismissed");
});

test("完成的引导条目（同样 deviceMid 为空）也可以读回", () => {
  const parsed = onboardingRecordFileSchema.parse({
    version: 2,
    deviceMid: "",
    entries: [
      {
        userId: null,
        occupation: "other",
        interfaceMode: "coding",
        memoryEnabled: false,
        proactiveSuggestionsEnabled: false,
        completedAt: "2026-09-29T10:49:00.000Z",
        uploadState: "pending",
      },
    ],
    decisions: [],
  });

  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]!.occupation, "other");
});
