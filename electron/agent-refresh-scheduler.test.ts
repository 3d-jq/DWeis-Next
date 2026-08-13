import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"
import { AgentRefreshScheduler } from "./agent-refresh-scheduler.ts"

afterEach(() => {
  vi.useRealTimers()
})

test("runtime refresh remains pending instead of interrupting a long generation", async () => {
  vi.useFakeTimers()
  let busy = true
  const refresh = vi.fn(async () => undefined)
  const scheduler = new AgentRefreshScheduler({
    canRefresh: () => true,
    isBusy: () => busy,
    isQuitting: () => false,
    refresh,
  })

  scheduler.schedule("skills changed", 0)
  await vi.advanceTimersByTimeAsync(60_000)
  assert.equal(refresh.mock.calls.length, 0)

  busy = false
  await vi.advanceTimersByTimeAsync(2_000)
  assert.equal(refresh.mock.calls.length, 1)
  scheduler.dispose()
})

test("runtime refresh remains pending until the agent is ready", async () => {
  vi.useFakeTimers()
  let ready = false
  const refresh = vi.fn(async () => undefined)
  const scheduler = new AgentRefreshScheduler({
    canRefresh: () => ready,
    isBusy: () => false,
    isQuitting: () => false,
    refresh,
  })

  scheduler.schedule("skills changed", 0)
  await vi.advanceTimersByTimeAsync(20_000)
  assert.equal(refresh.mock.calls.length, 0)

  ready = true
  await vi.advanceTimersByTimeAsync(2_000)
  assert.deepEqual(refresh.mock.calls, [["skills changed"]])
  await vi.advanceTimersByTimeAsync(20_000)
  assert.equal(refresh.mock.calls.length, 1)
  scheduler.dispose()
})

test("cooldown merges a storm of change events into a single restart", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  const refresh = vi.fn(async () => undefined)
  const scheduler = new AgentRefreshScheduler({
    canRefresh: () => true,
    isBusy: () => false,
    isQuitting: () => false,
    refresh,
  })

  scheduler.schedule("skills changed", 0)
  await vi.advanceTimersByTimeAsync(100)
  assert.equal(refresh.mock.calls.length, 1)

  // 重启刚完成：冷却窗口内（15s）的事件风暴全部合并，不再重启。
  for (let i = 0; i < 20; i += 1) {
    scheduler.schedule(`event ${i}`, 0)
    await vi.advanceTimersByTimeAsync(500)
  }
  assert.equal(refresh.mock.calls.length, 1)

  // 冷却结束（15s 后）才执行合并后的下一次重启。
  await vi.advanceTimersByTimeAsync(20_000)
  assert.equal(refresh.mock.calls.length, 2)
  scheduler.dispose()
})
