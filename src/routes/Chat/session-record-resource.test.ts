import { describe, expect, it } from "vitest"
import { isMessageReduction, keepStaleRecords } from "./session-record-resource.ts"

describe("keepStaleRecords", () => {
  it("keeps records when the key matches exactly", () => {
    expect(keepStaleRecords("s1\0m1", "s1\0m1", "s1")).toBe(true)
    expect(keepStaleRecords("s1\0m1", "s1\0m1", undefined)).toBe(true)
  })

  it("keeps previous records while the same scope reloads (no flicker on send)", () => {
    // 发送新消息：同会话 messageIdsKey 变化，旧数据保留直到新数据到达。
    expect(keepStaleRecords("s1\0m1,m2", "s1\0m1", "s1")).toBe(true)
  })

  it("clears records immediately when the scope (session) changes", () => {
    expect(keepStaleRecords("s2\0m1", "s1\0m1", "s1")).toBe(false)
  })

  it("returns false without a stale scope key (original isolation behavior)", () => {
    expect(keepStaleRecords("s1\0m1,m2", "s1\0m1", undefined)).toBe(false)
  })
})

describe("isMessageReduction", () => {
  it("returns false when messages only grow (sending a new message)", () => {
    expect(isMessageReduction("a\nb", "a\nb\nc")).toBe(false)
  })

  it("returns true when messages shrink (rollback/undo)", () => {
    expect(isMessageReduction("a\nb\nc", "a\nb")).toBe(true)
    expect(isMessageReduction("a\nb", "a")).toBe(true)
  })

  it("returns false when identical or empty", () => {
    expect(isMessageReduction("a\nb", "a\nb")).toBe(false)
    expect(isMessageReduction("", "a")).toBe(false)
  })
})
