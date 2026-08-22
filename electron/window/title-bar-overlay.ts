import type { BrowserWindowConstructorOptions, TitleBarOverlayOptions } from "electron"

export type WindowsTitleBarTheme = "light" | "dark"
export type NativeWindowMaterial = "macos-vibrancy" | "none"
export type NativeWindowFrame = Pick<BrowserWindowConstructorOptions, "frame" | "thickFrame">

export const windowsTitleBarOverlayHeight = 47
export const transparentWindowBackgroundColor = "#00000000"

const windowsTitleBarOverlayColors: Record<WindowsTitleBarTheme, { color: string; symbolColor: string }> = {
  // 背景色需与 src/index.css 的 --background 保持一致；高度少 1px 以露出顶栏底部分隔线。
  light: {
    color: "#ffffff",
    symbolColor: "#252a2e",
  },
  dark: {
    color: "#111113",
    symbolColor: "#f0f6fc",
  },
}

export function resolveWindowsTitleBarTheme(shouldUseDarkColors: boolean): WindowsTitleBarTheme {
  return shouldUseDarkColors ? "dark" : "light"
}

export function buildWindowsTitleBarOverlay(theme: WindowsTitleBarTheme): TitleBarOverlayOptions {
  return {
    ...windowsTitleBarOverlayColors[theme],
    height: windowsTitleBarOverlayHeight,
  }
}

export function windowBackgroundColorForTheme(theme: WindowsTitleBarTheme): string {
  return windowsTitleBarOverlayColors[theme].color
}

export function nativeWindowMaterialForPlatform(platform: NodeJS.Platform): NativeWindowMaterial {
  if (platform === "darwin") {
    return "macos-vibrancy"
  }
  return "none"
}

export function nativeWindowFrameForPlatform(platform: NodeJS.Platform): NativeWindowFrame {
  if (platform === "darwin") {
    // macOS 保留原生 frame：红黄绿按钮 + 系统动效（vibrancy）
    return {}
  }
  if (platform === "win32") {
    // Windows 走自定义标题栏（react 层），frame: false 去掉 OS 三个按钮 + 标题栏；
    // thickFrame: true 保留 DWM 渲染的 Windows 11 圆角、阴影和 resize 边框。
    // Aero Snap（拖到边缘自动半屏）会丢失——这是 custom title bar 固有的代价。
    return { frame: false, thickFrame: true }
  }
  return { frame: false }
}

export function windowBackgroundColorForMaterial(theme: WindowsTitleBarTheme, material: NativeWindowMaterial): string {
  return material === "none" ? windowBackgroundColorForTheme(theme) : transparentWindowBackgroundColor
}

export function shouldApplyWindowsTitleBarTheme(
  lastAppliedTheme: WindowsTitleBarTheme | null,
  nextTheme: WindowsTitleBarTheme,
): boolean {
  return lastAppliedTheme !== nextTheme
}
