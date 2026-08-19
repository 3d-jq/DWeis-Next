import { describe, expect, it } from "vitest"
import {
  BROWSER_DEVICE_PRESETS,
  deviceFitScale,
  deviceViewport,
  matchDevicePreset,
  parseDeviceDimension,
} from "./browser-device.ts"

describe("deviceViewport", () => {
  it("keeps portrait dimensions in portrait mode", () => {
    expect(deviceViewport({ height: 852, landscape: false, width: 393 })).toEqual({ height: 852, width: 393 })
  })

  it("swaps width and height in landscape mode", () => {
    expect(deviceViewport({ height: 852, landscape: true, width: 393 })).toEqual({ height: 393, width: 852 })
  })
})

describe("deviceFitScale", () => {
  it("stays at 1 when the available area is larger than the viewport", () => {
    expect(deviceFitScale({ height: 900, width: 600 }, { height: 852, width: 393 })).toBe(1)
  })

  it("scales down to fit the constraining axis", () => {
    expect(deviceFitScale({ height: 900, width: 300 }, { height: 852, width: 393 })).toBeCloseTo(300 / 393)
    expect(deviceFitScale({ height: 400, width: 600 }, { height: 852, width: 393 })).toBeCloseTo(400 / 852)
  })

  it("returns 1 for a degenerate viewport", () => {
    expect(deviceFitScale({ height: 400, width: 300 }, { height: 0, width: 0 })).toBe(1)
  })
})

describe("parseDeviceDimension", () => {
  it("accepts integers within the supported range", () => {
    expect(parseDeviceDimension("393")).toBe(393)
    expect(parseDeviceDimension(" 4096 ")).toBe(4096)
  })

  it("rejects non-numeric and out-of-range input", () => {
    expect(parseDeviceDimension("abc")).toBeNull()
    expect(parseDeviceDimension("100")).toBeNull()
    expect(parseDeviceDimension("5000")).toBeNull()
    expect(parseDeviceDimension("")).toBeNull()
  })
})

describe("matchDevicePreset", () => {
  it("matches an exact preset viewport", () => {
    expect(matchDevicePreset({ height: 852, width: 393 })).toBe("iphone-15-pro")
  })

  it("falls back to custom for non-preset sizes (including landscape swaps)", () => {
    expect(matchDevicePreset({ height: 393, width: 852 })).toBe("custom")
    expect(matchDevicePreset({ height: 500, width: 400 })).toBe("custom")
  })

  it("has unique preset ids and positive dimensions", () => {
    const ids = new Set(BROWSER_DEVICE_PRESETS.map((preset) => preset.id))
    expect(ids.size).toBe(BROWSER_DEVICE_PRESETS.length)
    for (const preset of BROWSER_DEVICE_PRESETS) {
      expect(preset.width).toBeGreaterThan(0)
      expect(preset.height).toBeGreaterThan(0)
      expect(preset.userAgent.length).toBeGreaterThan(0)
    }
  })
})
