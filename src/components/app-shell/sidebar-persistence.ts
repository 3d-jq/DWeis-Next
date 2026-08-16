import type { SessionScope } from "../../../electron/session/common.ts"

import { storageKey } from "../../../electron/branding.ts"
import { sessionScopeKey } from "../../../electron/session/common.ts"

export type SidebarSegment = "projects" | "tasks"
export type SidebarTaskSortMode = "createdAt" | "title" | "updatedAt"

type LocalStorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">

const sidebarCollapsedStorageKey = storageKey("sidebarCollapsed")
const projectCollapsedStoragePrefix = storageKey("projectSidebarCollapsed")
const taskSortModeStorageKey = storageKey("taskSortMode")
const sidebarCategoriesStorageKey = storageKey("sidebarCategoriesCollapsed")

function readItem(storage: LocalStorageLike | null | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeItem(storage: LocalStorageLike | null | undefined, key: string, value: string): boolean {
  if (!storage) {
    return false
  }
  try {
    storage.setItem(key, value)
    return true
  } catch {
    // 本地存储不可用时仅保留本次会话状态。
    return false
  }
}

function removeItem(storage: LocalStorageLike | null | undefined, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // 本地存储不可用时无需清理。
  }
}

export function readStoredTaskSortMode(storage: LocalStorageLike | null | undefined): SidebarTaskSortMode {
  const stored = readItem(storage, taskSortModeStorageKey)
  return stored === "createdAt" || stored === "title" ? stored : "updatedAt"
}

export function writeStoredTaskSortMode(
  storage: LocalStorageLike | null | undefined,
  sortMode: SidebarTaskSortMode,
): void {
  writeItem(storage, taskSortModeStorageKey, sortMode)
}

export function readStoredSidebarCollapsed(storage: LocalStorageLike | null | undefined): boolean {
  return readItem(storage, sidebarCollapsedStorageKey) === "1"
}

export function writeStoredSidebarCollapsed(storage: LocalStorageLike | null | undefined, collapsed: boolean): void {
  writeItem(storage, sidebarCollapsedStorageKey, collapsed ? "1" : "0")
}

export interface SidebarCategoryCollapsed {
  conversations: boolean
  projects: boolean
}

const defaultSidebarCategoryCollapsed: SidebarCategoryCollapsed = { conversations: false, projects: false }

/** 侧边栏「对话 / 项目」分类折叠状态（两个视图共用）。 */
export function readStoredSidebarCategoriesCollapsed(
  storage: LocalStorageLike | null | undefined,
): SidebarCategoryCollapsed {
  const raw = readItem(storage, sidebarCategoriesStorageKey)
  if (!raw) {
    return defaultSidebarCategoryCollapsed
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SidebarCategoryCollapsed>
    return {
      conversations: parsed.conversations === true,
      projects: parsed.projects === true,
    }
  } catch {
    return defaultSidebarCategoryCollapsed
  }
}

export function writeStoredSidebarCategoriesCollapsed(
  storage: LocalStorageLike | null | undefined,
  collapsed: SidebarCategoryCollapsed,
): void {
  const hasCollapse = collapsed.conversations || collapsed.projects
  if (!hasCollapse) {
    removeItem(storage, sidebarCategoriesStorageKey)
    return
  }
  writeItem(storage, sidebarCategoriesStorageKey, JSON.stringify(collapsed))
}

export function projectSidebarCollapsedStorageKey(scope: SessionScope | null): string | null {
  if (!scope) {
    return null
  }
  return `${projectCollapsedStoragePrefix}:local:${sessionScopeKey(scope)}`
}

export function readStoredCollapsedProjectIds(
  storage: LocalStorageLike | null | undefined,
  key: string | null,
): Set<string> {
  if (!key) {
    return new Set()
  }
  const legacyKey = key.replace(":team:", ":organization:")
  const currentRaw = readItem(storage, key)
  const parseIds = (raw: string | null): Set<string> | null => {
    if (!raw) {
      return null
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    if (!Array.isArray(parsed)) {
      return null
    }
    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0))
  }
  const currentIds = parseIds(currentRaw)
  if (currentIds) {
    return currentIds
  }
  const legacyRaw = legacyKey !== key ? readItem(storage, legacyKey) : null
  const legacyIds = parseIds(legacyRaw)
  if (!legacyIds) {
    return new Set()
  }
  if (writeItem(storage, key, JSON.stringify([...legacyIds].sort()))) {
    removeItem(storage, legacyKey)
  }
  return legacyIds
}

export function writeStoredCollapsedProjectIds(
  storage: LocalStorageLike | null | undefined,
  key: string | null,
  collapsedIds: Set<string>,
): void {
  if (!key) {
    return
  }
  if (collapsedIds.size === 0) {
    removeItem(storage, key)
    return
  }
  writeItem(storage, key, JSON.stringify([...collapsedIds].sort()))
}

export function pruneCollapsedProjectIds(collapsedIds: Set<string>, projectIds: Set<string>): Set<string> {
  const next = new Set([...collapsedIds].filter((id) => projectIds.has(id)))
  return setsEqual(collapsedIds, next) ? collapsedIds : next
}

export function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false
    }
  }
  return true
}
