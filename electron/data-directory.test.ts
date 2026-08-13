import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const { mockGetPath, mockSetPath } = vi.hoisted(() => ({
  mockGetPath: vi.fn(),
  mockSetPath: vi.fn(),
}))

vi.mock("electron", () => ({
  app: {
    getPath: mockGetPath,
    setPath: mockSetPath,
  },
}))

import { SettingsServiceImpl } from "./settings/node.ts"
import type { SettingsStore } from "./settings/store.ts"
import {
  applyPersistedDataDirectory,
  defaultDataDirectory,
  readPersistedDataDirectory,
  validateDataDirectoryTarget,
  writeDataDirectoryRecord,
} from "./data-directory.ts"

const temporaryDirectories: string[] = []

function temporaryDirectory(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  temporaryDirectories.push(dir)
  return dir
}

/** 把 home 与默认 userData 指向真实临时目录，避免在系统根目录创建文件。 */
function mockPaths(home: string, userData: string): void {
  mockGetPath.mockImplementation((key: string) => {
    if (key === "home") {
      return home
    }
    return userData
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("data directory defaults", () => {
  it("defaults to a DWeisNext folder under the user home directory", () => {
    const home = temporaryDirectory("dweis-home-")
    mockPaths(home, temporaryDirectory("dweis-userdata-"))
    expect(defaultDataDirectory()).toBe(path.join(home, "DWeisNext"))
  })
})

describe("validateDataDirectoryTarget", () => {
  it("rejects relative paths", () => {
    mockPaths(temporaryDirectory("dweis-home-"), temporaryDirectory("dweis-userdata-"))
    expect(() => validateDataDirectoryTarget("relative/path")).toThrow(/absolute path/)
    expect(() => validateDataDirectoryTarget("")).toThrow(/absolute path/)
  })

  it("rejects the current data directory", () => {
    const userData = temporaryDirectory("dweis-userdata-")
    mockPaths(temporaryDirectory("dweis-home-"), userData)
    expect(() => validateDataDirectoryTarget(userData)).toThrow(/same as the current/)
  })

  it("rejects a target inside the current data directory", () => {
    const userData = temporaryDirectory("dweis-userdata-")
    mockPaths(temporaryDirectory("dweis-home-"), userData)
    expect(() => validateDataDirectoryTarget(path.join(userData, "sub"))).toThrow(/inside the current/)
  })

  it("rejects an existing non-empty target directory", () => {
    mockPaths(temporaryDirectory("dweis-home-"), temporaryDirectory("dweis-userdata-"))
    const target = temporaryDirectory("dweis-data-nonempty-")
    writeFileSync(path.join(target, "existing.txt"), "keep")
    expect(() => validateDataDirectoryTarget(target)).toThrow(/not empty/)
  })

  it("accepts a missing absolute target", () => {
    mockPaths(temporaryDirectory("dweis-home-"), temporaryDirectory("dweis-userdata-"))
    const target = path.join(temporaryDirectory("dweis-data-"), "new-location")
    expect(validateDataDirectoryTarget(target)).toBe(path.normalize(target))
  })
})

describe("applyPersistedDataDirectory", () => {
  it("applies a recorded data directory", () => {
    const userData = temporaryDirectory("dweis-userdata-")
    mockPaths(temporaryDirectory("dweis-home-"), userData)
    const recorded = temporaryDirectory("dweis-recorded-")
    writeDataDirectoryRecord(recorded)

    applyPersistedDataDirectory()

    expect(mockSetPath).toHaveBeenCalledWith("userData", path.normalize(recorded))
  })

  it("migrates existing data to the default location and records it on first run", () => {
    const userData = temporaryDirectory("dweis-first-run-")
    const home = temporaryDirectory("dweis-home-")
    mockPaths(home, userData)
    writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ themeSource: "dark" }))

    const expectedTarget = path.join(home, "DWeisNext")
    applyPersistedDataDirectory()

    expect(mockSetPath).toHaveBeenCalledWith("userData", path.normalize(expectedTarget))
    expect(readPersistedDataDirectory()).toBe(path.normalize(expectedTarget))
  })

  it("adopts the default location when it already has content and no record exists", () => {
    // 完全重装后旧版卸载/清理可能删掉默认位置的记录，但 ~/DWeisNext 数据仍在：
    // 必须采用它，而不是留在默认 %APPDATA% 分裂成两份（模型/设置重启后"消失"）。
    const userData = temporaryDirectory("dweis-userdata-")
    const home = temporaryDirectory("dweis-home-")
    mockPaths(home, userData)
    const target = path.join(home, "DWeisNext")
    mkdirSync(target, { recursive: true })
    writeFileSync(path.join(target, "unrelated.txt"), "mine")

    applyPersistedDataDirectory()

    expect(mockSetPath).toHaveBeenCalledWith("userData", path.normalize(target))
    expect(readPersistedDataDirectory()).toBe(path.normalize(target))
  })

  it("self-records the data directory so it survives a wiped default location", () => {
    const userData = temporaryDirectory("dweis-userdata-")
    const home = temporaryDirectory("dweis-home-")
    mockPaths(home, userData)
    const recorded = path.join(home, "DWeisNext")

    writeDataDirectoryRecord(recorded)
    // 模拟完全重装：默认位置的记录被卸载清理删掉。
    writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ themeSource: "dark" }))

    expect(readPersistedDataDirectory()).toBe(path.normalize(recorded))
  })
})

describe("SettingsServiceImpl.setDataDirectory", () => {
  it("copies data to the target and records the new location", async () => {
    const userData = temporaryDirectory("dweis-setdata-")
    mockPaths(temporaryDirectory("dweis-home-"), userData)
    writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ themeSource: "dark" }))
    const target = path.join(temporaryDirectory("dweis-setdata-target-"), "new-data")

    const write = vi.fn()
    const store = { read: vi.fn(() => ({})), write } as unknown as SettingsStore
    const service = new SettingsServiceImpl({ store })

    await service.setDataDirectory(target)

    expect(readPersistedDataDirectory()).toBe(path.normalize(target))
    expect(write).toHaveBeenCalledWith({ dataDirectory: path.normalize(target) })
  })

  it("rejects an invalid target without copying", async () => {
    mockPaths(temporaryDirectory("dweis-home-"), temporaryDirectory("dweis-userdata-"))
    const store = { read: vi.fn(() => ({})), write: vi.fn() } as unknown as SettingsStore
    const service = new SettingsServiceImpl({ store })

    await expect(service.setDataDirectory("relative/path")).rejects.toThrow(/absolute path/)
    expect(store.write).not.toHaveBeenCalled()
  })
})
