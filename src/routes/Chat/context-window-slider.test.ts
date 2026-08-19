import { describe, expect, it } from "vitest"
import {
  CONTEXT_WINDOW_MARKERS,
  CONTEXT_WINDOW_MAX,
  CONTEXT_WINDOW_MIN,
  contextWindowToSlider,
  formatContextWindow,
  parseContextWindowInput,
  sliderToContextWindow,
  snapSliderValue,
} from "./context-window-slider.ts"

describe("contextWindowToSlider", () => {
  it("maps min to 0 and max to 1", () => {
    expect(contextWindowToSlider(CONTEXT_WINDOW_MIN)).toBe(0)
    expect(contextWindowToSlider(CONTEXT_WINDOW_MAX)).toBeCloseTo(1)
  })

  it("clamps out-of-range values into the slider domain", () => {
    expect(contextWindowToSlider(1)).toBe(0)
    expect(contextWindowToSlider(99_999_999)).toBeCloseTo(1)
  })

  it("gives the high range more slider distance than a pure log scale", () => {
    // 纯对数下 200K 位于 ≈0.44；t^1.5 指数变换后 200K 更靠左，200K–2M 拿到更多滑程。
    expect(contextWindowToSlider(200_000)).toBeLessThan(0.44)
    expect(contextWindowToSlider(200_000)).toBeGreaterThan(0.25)
  })
})

describe("sliderToContextWindow", () => {
  it("round trips through the slider domain", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(contextWindowToSlider(sliderToContextWindow(t))).toBeCloseTo(t, 1)
    }
  })

  it("rounds to thousands", () => {
    expect(sliderToContextWindow(0.5) % 1_000).toBe(0)
  })

  it("clamps the slider position", () => {
    expect(sliderToContextWindow(-0.5)).toBe(CONTEXT_WINDOW_MIN)
    expect(sliderToContextWindow(1.5)).toBe(CONTEXT_WINDOW_MAX)
  })
})

describe("snapSliderValue", () => {
  it("snaps near a marker to the marker position", () => {
    const marker200k = CONTEXT_WINDOW_MARKERS.find((marker) => marker.label === "200K")!
    expect(snapSliderValue(marker200k.pos + 0.02)).toBe(marker200k.pos)
    expect(snapSliderValue(marker200k.pos - 0.02)).toBe(marker200k.pos)
  })

  it("keeps positions far from markers unchanged", () => {
    const marker200k = CONTEXT_WINDOW_MARKERS.find((marker) => marker.label === "200K")!
    const t = marker200k.pos + 0.1
    expect(snapSliderValue(t)).toBe(t)
  })
})

describe("parseContextWindowInput", () => {
  it("parses plain, comma, k and m forms", () => {
    expect(parseContextWindowInput("200000")).toBe(200_000)
    expect(parseContextWindowInput("200,000")).toBe(200_000)
    expect(parseContextWindowInput("200k")).toBe(200_000)
    expect(parseContextWindowInput("1m")).toBe(1_000_000)
    expect(parseContextWindowInput("1.5M")).toBe(1_500_000)
    expect(parseContextWindowInput(" 64K ")).toBe(64_000)
  })

  it("rejects invalid input and out-of-range values", () => {
    expect(parseContextWindowInput("")).toBeNull()
    expect(parseContextWindowInput("abc")).toBeNull()
    expect(parseContextWindowInput("16k")).toBeNull()
    expect(parseContextWindowInput("3m")).toBeNull()
    expect(parseContextWindowInput("100kb")).toBeNull()
  })
})

describe("formatContextWindow", () => {
  it("formats exact thousands and millions compactly", () => {
    expect(formatContextWindow(200_000)).toBe("200K")
    expect(formatContextWindow(1_000_000)).toBe("1M")
    expect(formatContextWindow(32_000)).toBe("32K")
  })

  it("falls back to locale digits for non-round values", () => {
    expect(formatContextWindow(123_456)).toBe("123,456")
  })
})
