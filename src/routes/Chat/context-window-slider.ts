/**
 * Context window 对数刻度滑块的纯函数层。
 *
 * 值域 32K–2M 取对数映射到 0–1 滑程（线性刻度下 32K–200K 会被压到滑程前 8% 无法
 * 操作）；再经 t^1.5 指数变换把滑程重心让给 200K–2M 的长上下文区间——32K–200K 的
 * 常见值由吸附点（32/64/128/200K）覆盖，连续拖动的精度留给非标准长上下文值。
 */

export const CONTEXT_WINDOW_MIN = 32_000
export const CONTEXT_WINDOW_MAX = 2_000_000
export const CONTEXT_WINDOW_DEFAULT = 200_000

/** 指数底：t^E 再进对数域（1 = 纯对数）。E>1 压低值段、放高值段。 */
const SCALE_EXPONENT = 1.5
const SNAP_THRESHOLD = 0.025
const LOG_MIN = Math.log(CONTEXT_WINDOW_MIN)
const LOG_MAX = Math.log(CONTEXT_WINDOW_MAX)

export interface ContextWindowMarker {
  label: string
  value: number
  /** 滑轨上的 0–1 位置（经指数变换后）。 */
  pos: number
}

export const CONTEXT_WINDOW_MARKERS: readonly ContextWindowMarker[] = [
  { label: "32K", value: 32_000 },
  { label: "64K", value: 64_000 },
  { label: "128K", value: 128_000 },
  { label: "200K", value: 200_000 },
  { label: "1M", value: 1_000_000 },
  { label: "2M", value: 2_000_000 },
].map((marker) => ({ ...marker, pos: contextWindowToSlider(marker.value) }))

/** token 值 → 0–1 滑程位置（超界值按边界处理）。 */
export function contextWindowToSlider(value: number): number {
  const clamped = Math.min(CONTEXT_WINDOW_MAX, Math.max(CONTEXT_WINDOW_MIN, value))
  const t = (Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)
  return Math.pow(t, SCALE_EXPONENT)
}

/** 0–1 滑程位置 → token 值（千位取整）。 */
export function sliderToContextWindow(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  const logT = Math.pow(clamped, 1 / SCALE_EXPONENT)
  return Math.round(Math.exp(LOG_MIN + logT * (LOG_MAX - LOG_MIN)) / 1000) * 1000
}

/** 拖近吸附点时吸附到该点。 */
export function snapSliderValue(t: number): number {
  for (const marker of CONTEXT_WINDOW_MARKERS) {
    if (Math.abs(t - marker.pos) < SNAP_THRESHOLD) {
      return marker.pos
    }
  }
  return t
}

/** 解析输入文本：支持 "200000" / "200,000" / "200k" / "1m" / "1.5m"；非法或超界返回 null。 */
export function parseContextWindowInput(input: string): number | null {
  const normalized = input.trim().toLowerCase().replace(/,/g, "")
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/)
  if (!match) {
    return null
  }
  let value = Number.parseFloat(match[1]!)
  if (match[2] === "k") {
    value *= 1_000
  } else if (match[2] === "m") {
    value *= 1_000_000
  }
  const result = Math.round(value)
  if (result < CONTEXT_WINDOW_MIN || result > CONTEXT_WINDOW_MAX) {
    return null
  }
  return result
}

/** 格式化展示：整千显示 K / 整百万显示 M，其余千分位。 */
export function formatContextWindow(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) {
    return `${value / 1_000_000}M`
  }
  if (value >= 1_000 && value % 1_000 === 0) {
    return `${value / 1_000}K`
  }
  return value.toLocaleString("en-US")
}
