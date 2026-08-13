import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "vitest"
import { MemoryStore } from "./store.ts"

function createStore(): { dir: string; store: MemoryStore } {
  const dir = mkdtempSync(path.join(tmpdir(), "dweis-memory-"))
  return { dir, store: new MemoryStore(dir) }
}

test("MemoryStore returns empty memory on missing files", async () => {
  const { store } = createStore()
  assert.equal(await store.readAgent(), "")
  assert.equal(await store.readUser(), "")
})

test("MemoryStore persists agent and user memory to MEMORY.md / USER.md", async () => {
  const { dir, store } = createStore()
  await store.writeAgent("# 记忆\n- 用户喜欢简洁的回答")
  await store.writeUser("姓名：测试用户")
  assert.equal(await store.readAgent(), "# 记忆\n- 用户喜欢简洁的回答")
  assert.equal(await store.readUser(), "姓名：测试用户")
  assert.equal(readFileSync(path.join(dir, "MEMORY.md"), "utf-8"), "# 记忆\n- 用户喜欢简洁的回答")
  assert.equal(readFileSync(path.join(dir, "USER.md"), "utf-8"), "姓名：测试用户")
})

test("MemoryStore falls back to empty content when file cannot be read", async () => {
  const { dir, store } = createStore()
  mkdirSync(path.join(dir, "MEMORY.md")) // 同名目录 → EISDIR 读取失败
  assert.equal(await store.readAgent(), "")
})

test("MemoryStore overwrites content on rewrite", async () => {
  const { store } = createStore()
  await store.writeAgent("v1")
  await store.writeAgent("v2 合并后的内容")
  assert.equal(await store.readAgent(), "v2 合并后的内容")
})
