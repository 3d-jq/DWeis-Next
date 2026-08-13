import assert from "node:assert/strict"
import { test, vi } from "vitest"
import type { AgentManager } from "../agent/manager.ts"
import { MemoryReviewer } from "./reviewer.ts"

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface Harness {
  agent: {
    createSession: ReturnType<typeof vi.fn>
    deleteSession: ReturnType<typeof vi.fn>
    getMessages: ReturnType<typeof vi.fn>
    client: { session: { promptAsync: ReturnType<typeof vi.fn> } }
  }
  calls: { createSession: number; deleteSession: number; promptAsync: number }
  reviewer: MemoryReviewer
  state: { enabled: boolean; interval: number; busy: boolean; messages: unknown[] }
}

function createHarness(overrides: Partial<{ interval: number; enabled: boolean; busy: boolean }> = {}): Harness {
  const state = {
    enabled: overrides.enabled ?? true,
    interval: overrides.interval ?? 3,
    busy: overrides.busy ?? false,
    messages: [
      { id: "m1", role: "user", parts: [{ kind: "text", text: "我是做嵌入式开发的，喜欢用中文交流" }], createdAt: 1 },
      { id: "m2", role: "assistant", parts: [{ kind: "text", text: "好的，了解了" }], createdAt: 2, completedAt: 3 },
      { id: "m3", role: "user", parts: [{ kind: "text", text: "回答要简洁一些" }], createdAt: 4 },
    ],
  }
  const calls = { createSession: 0, deleteSession: 0, promptAsync: 0 }
  const promptAsync = vi.fn(async () => {
    calls.promptAsync += 1
    return {}
  })
  const agent = {
    createSession: vi.fn(async () => {
      calls.createSession += 1
      return { id: "review-session-1" }
    }),
    deleteSession: vi.fn(async () => {
      calls.deleteSession += 1
    }),
    getMessages: vi.fn(async () => state.messages),
    client: { session: { promptAsync } },
  }
  const reviewer = new MemoryReviewer({
    getAgent: () => agent as unknown as AgentManager,
    hasActiveGeneration: () => state.busy,
    getMemory: async () => ({ agent: "已有记忆：用户偏好简洁", user: "姓名：测试用户" }),
    getConfig: () => ({ enabled: state.enabled, interval: state.interval }),
  })
  return { agent, calls, reviewer, state }
}

test("onTurnCompleted triggers review only at the interval threshold", async () => {
  const { calls, reviewer } = createHarness({ interval: 3 })
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 0)
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 0)
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 1)
})

test("disabled config never triggers review", async () => {
  const { calls, reviewer } = createHarness({ enabled: false, interval: 1 })
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 0)
})

test("busy generation skips review without queuing", async () => {
  const { calls, reviewer, state } = createHarness({ interval: 1 })
  state.busy = true
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 0)
  state.busy = false
  // 忙时跳过不补触发：下一轮重新计数（interval 1 时下一轮即触发）。
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 1)
})

test("review session is deleted after completion", async () => {
  const { calls, reviewer } = createHarness({ interval: 1 })
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.createSession, 1)
  assert.equal(calls.deleteSession, 1)
})

test("review prompt carries both memory files and instructs per-scope writes", async () => {
  const { agent, reviewer } = createHarness({ interval: 1 })
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  const call = agent.client.session.promptAsync.mock.calls[0][0] as {
    system?: string
    parts: Array<{ type: string; text?: string }>
  }
  const text = call.parts[0].text ?? ""
  assert.ok(text.includes("Current memory (MEMORY.md)"))
  assert.ok(text.includes("已有记忆：用户偏好简洁"))
  assert.ok(text.includes("Current user profile (USER.md)"))
  assert.ok(text.includes("姓名：测试用户"))
  const system = call.system ?? ""
  assert.ok(system.includes("scope=user"))
  assert.ok(system.includes("1375"))
  assert.ok(system.includes("scope=agent"))
  assert.ok(system.includes("2200"))
})

test("short transcript skips review entirely", async () => {
  const { calls, reviewer, state } = createHarness({ interval: 1 })
  state.messages = [{ id: "m1", role: "user", parts: [{ kind: "text", text: "你好" }], createdAt: 1 }]
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.createSession, 0)
  assert.equal(calls.promptAsync, 0)
})

test("in-flight review is not re-entered", async () => {
  const { calls, reviewer, agent } = createHarness({ interval: 1 })
  // 第一次审查挂起（promptAsync 不 resolve）。
  let release: (() => void) | undefined
  agent.client.session.promptAsync.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        calls.promptAsync += 1
        release = () => resolve({})
      }),
  )
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 1)
  // 第二次触发被 in-flight 拦截。
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 1)
  release?.()
  await flush()
  assert.equal(calls.deleteSession, 1)
})

test("review failure is silent and still cleans up the session", async () => {
  const { calls, reviewer, agent } = createHarness({ interval: 1 })
  agent.client.session.promptAsync.mockImplementationOnce(async () => {
    calls.promptAsync += 1
    throw new Error("sidecar down")
  })
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 1)
  assert.equal(calls.deleteSession, 1)
})

test("interval is clamped to the valid range", async () => {
  const { calls, reviewer, state } = createHarness({ interval: 0 })
  reviewer.onTurnCompleted({ sessionId: "s1" })
  await flush()
  assert.equal(calls.promptAsync, 1) // interval 0 → clamp 到 1，每轮触发
  calls.promptAsync = 0
  state.interval = 999
  for (let i = 0; i < 49; i += 1) {
    reviewer.onTurnCompleted({ sessionId: "s2" })
  }
  await flush()
  assert.equal(calls.promptAsync, 0) // 999 → clamp 50，49 轮未达
  reviewer.onTurnCompleted({ sessionId: "s2" })
  await flush()
  assert.equal(calls.promptAsync, 1)
})
