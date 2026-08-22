// 轻量启动画面：冷启动时主窗口还在后台加载（agent 初始化、渲染进程就绪），
// 先弹一个与主窗口同尺寸的品牌画面遮挡加载；渲染层 UI 就绪后由调用方触发淡出销毁。
//
// 设计：静态深蓝底 + 居中 logo + 品牌名 + 版本，唯一的动效是入场淡入。
// （早期版本有光晕呼吸、外环扩散、logo 缩放、三点弹跳，被反馈"太复杂"砍掉。）
import { app, BrowserWindow, nativeTheme } from "electron"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { branding } from "../branding.ts"

/** 与主窗口默认尺寸一致（electron/main.ts 主窗口 1280×800），切换时无尺寸跳跃。 */
export const SPLASH_WIDTH = 1280
export const SPLASH_HEIGHT = 800
/** 最短可见时长：渲染层 UI 就绪过早时也至少展示这么久，避免一闪而过。 */
export const SPLASH_MIN_VISIBLE_MS = 1500
/** 外部兜底超时（main.ts 强制切换），内部再留一层保险。 */
export const SPLASH_FALLBACK_MS = 10_000
/** 内部兜底超时：即使没人触发切换，splash 也要自动关掉，避免永远占屏。 */
const SPLASH_MAX_MS = 20_000

interface SplashPalette {
  background: string
  foreground: string
  muted: string
}

function splashPalette(): SplashPalette {
  void nativeTheme.shouldUseDarkColors
  return {
    background: "#0a1530",
    foreground: "#f5f5f7",
    muted: "rgba(245, 245, 247, 0.55)",
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * 把 logo.png 内联成 data URI。
 *
 * 解析顺序：
 *   1) `process.resourcesPath/logo.png` —— 打包后，electron-builder.ts 把 logo 复制为 extraResources。
 *   2) `<appPath>/resources/branding/logo.png` —— dev，资源随仓库提交。
 * 任意一个读得到就 base64 编码；都失败就返回空串，HTML 走首字母 fallback。
 */
function loadLogoDataUri(): string {
  const candidates = [
    join(process.resourcesPath ?? "", "logo.png"),
    join(app.getAppPath(), "resources", "branding", "logo.png"),
  ]
  for (const filePath of candidates) {
    try {
      if (filePath && existsSync(filePath)) {
        const buf = readFileSync(filePath)
        return `data:image/png;base64,${buf.toString("base64")}`
      }
    } catch {
      // 路径解析或读盘失败，继续尝试下一个候选。
    }
  }
  return ""
}

function splashHtml(palette: SplashPalette, logoDataUri: string): string {
  const brand = escapeHtml(branding.appName)
  const version = escapeHtml(app.getVersion())
  const logoNode = logoDataUri
    ? `<img class="logo" src="${logoDataUri}" alt="" draggable="false" />`
    : `<div class="logo logo-fallback">${escapeHtml(brand.charAt(0))}</div>`
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: ${palette.background};
    color: ${palette.foreground};
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    user-select: none; -webkit-user-select: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .stage {
    display: flex; flex-direction: column; align-items: center;
    animation: stage-in 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes stage-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .logo {
    width: 128px; height: 128px;
    border-radius: 28px;
    object-fit: cover;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
    margin-bottom: 28px;
  }
  .logo-fallback {
    background: linear-gradient(135deg, #5a8cff, rgba(90, 140, 255, 0.45));
    color: #ffffff;
    font-size: 56px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    border-radius: 28px;
  }
  .brand {
    font-size: 30px; font-weight: 600; letter-spacing: 0.005em;
    margin-bottom: 6px;
  }
  .tagline {
    font-size: 13px; font-weight: 500; letter-spacing: 0.04em;
    color: ${palette.muted};
    font-variant-numeric: tabular-nums;
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="logo">${logoNode}</div>
    <div class="brand">${brand}</div>
    <div class="tagline">v${version}</div>
  </div>
</body>
</html>`
}

let splashWindow: BrowserWindow | null = null
let dismissTimer: NodeJS.Timeout | undefined

/** 创建并显示启动画面窗口；已存在时复用。返回 null 表示创建失败。 */
export function showSplashWindow(): BrowserWindow | null {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow
  }
  const palette = splashPalette()
  const logoDataUri = loadLogoDataUri()
  let win: BrowserWindow
  try {
    win = new BrowserWindow({
      width: SPLASH_WIDTH,
      height: SPLASH_HEIGHT,
      frame: false,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: palette.background,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
      },
    })
  } catch (error) {
    console.warn("[dweis] failed to create splash window:", error)
    return null
  }
  void win
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(palette, logoDataUri))}`)
    .catch((error: unknown) => {
      console.warn("[dweis] failed to load splash content:", error)
      if (!win.isDestroyed()) {
        win.destroy()
      }
    })
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      win.show()
    }
  })
  win.center()
  win.on("closed", () => {
    if (splashWindow === win) {
      splashWindow = null
    }
  })
  splashWindow = win
  dismissTimer = setTimeout(() => dismissSplashWindow(), SPLASH_MAX_MS)
  dismissTimer.unref?.()
  return win
}

/** 淡出并销毁启动画面（幂等）。主窗口就绪或加载失败时调用。 */
export function dismissSplashWindow(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = undefined
  }
  const win = splashWindow
  splashWindow = null
  if (!win || win.isDestroyed()) {
    return
  }
  try {
    win.setOpacity(1)
    const fade = (opacity: number): void => {
      if (win.isDestroyed()) {
        return
      }
      if (opacity <= 0) {
        win.destroy()
        return
      }
      win.setOpacity(opacity)
      setTimeout(() => fade(opacity - 0.15), 30)
    }
    fade(0.85)
  } catch {
    win.destroy()
  }
}
