/** 设备模拟预设与视口换算纯函数（渲染层）。 */

export interface BrowserDevicePreset {
  /** 竖屏 CSS 逻辑像素。 */
  height: number
  id: string
  label: string
  userAgent: string
  width: number
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"

export const BROWSER_DEVICE_PRESETS: BrowserDevicePreset[] = [
  { height: 667, id: "iphone-se", label: "iPhone SE", userAgent: IPHONE_UA, width: 375 },
  { height: 852, id: "iphone-15-pro", label: "iPhone 15 Pro", userAgent: IPHONE_UA, width: 393 },
  { height: 932, id: "iphone-15-pro-max", label: "iPhone 15 Pro Max", userAgent: IPHONE_UA, width: 430 },
  { height: 780, id: "galaxy-s23", label: "Galaxy S23", userAgent: ANDROID_UA, width: 360 },
  { height: 915, id: "pixel-8", label: "Pixel 8", userAgent: ANDROID_UA, width: 412 },
  { height: 1024, id: "ipad-mini", label: "iPad mini", userAgent: IPAD_UA, width: 768 },
  { height: 1194, id: "ipad-pro-11", label: "iPad Pro 11", userAgent: IPAD_UA, width: 834 },
]

export const DEVICE_DIMENSION_MIN = 200
export const DEVICE_DIMENSION_MAX = 4096

/** 自定义尺寸的兜底 UA（保持移动端视角）。 */
export const DEVICE_CUSTOM_USER_AGENT = ANDROID_UA

/** 模拟视口：横屏交换宽高。 */
export function deviceViewport(view: { height: number; landscape: boolean; width: number }): {
  height: number
  width: number
} {
  return view.landscape ? { height: view.width, width: view.height } : { height: view.height, width: view.width }
}

/** 设备框缩放：只缩小不放大（可用空间富余时保持 1:1 居中留白）。 */
export function deviceFitScale(
  available: { height: number; width: number },
  viewport: { height: number; width: number },
): number {
  if (viewport.width < 1 || viewport.height < 1) return 1
  return Math.min(1, available.width / viewport.width, available.height / viewport.height)
}

/** 宽高输入清洗：无效或越界返回 null。 */
export function parseDeviceDimension(input: string): number | null {
  const value = Number.parseInt(input, 10)
  if (!Number.isFinite(value)) return null
  return value >= DEVICE_DIMENSION_MIN && value <= DEVICE_DIMENSION_MAX ? value : null
}

/** 由主进程回传的模拟状态反推预设 id（尺寸完全匹配才算预设，否则自定义）。 */
export function matchDevicePreset(viewport: { height: number; width: number }): string {
  return (
    BROWSER_DEVICE_PRESETS.find((preset) => preset.width === viewport.width && preset.height === viewport.height)?.id ??
    "custom"
  )
}
