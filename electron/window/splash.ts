// 轻量启动画面：冷启动时主窗口还在后台加载（agent 初始化、渲染进程就绪），
// 先弹一个品牌卡片给用户即时反馈；主窗口就绪后由调用方触发淡出销毁。
import { BrowserWindow, nativeTheme } from "electron"
import { branding } from "../branding.ts"

const SPLASH_WIDTH = 360
const SPLASH_HEIGHT = 220
/** 兜底超时：即使主窗口一直没就绪，splash 也要自动关掉，避免永远占屏。 */
const SPLASH_MAX_MS = 20_000

interface SplashPalette {
  background: string
  foreground: string
  bar: string
  accent: string
}

function splashPalette(): SplashPalette {
  const dark = nativeTheme.shouldUseDarkColors
  if (dark) {
    return {
      background: "#161618",
      foreground: "#f5f5f7",
      bar: "rgba(245,245,247,0.22)",
      accent: "rgba(245,245,247,0.85)",
    }
  }
  return {
    background: "#fbfbfd",
    foreground: "#1d1d1f",
    bar: "rgba(0,0,0,0.14)",
    accent: "rgba(0,0,0,0.7)",
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function splashHtml(palette: SplashPalette): string {
  const brand = escapeHtml(branding.appName)
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
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    user-select: none; -webkit-user-select: none;
  }
  .card { text-align: center; }
  .brand { font-size: 30px; font-weight: 600; letter-spacing: 0.04em; }
  .bar {
    width: 132px; height: 3px; margin: 22px auto 0;
    border-radius: 999px; background: ${palette.bar};
    position: relative; overflow: hidden;
  }
  .bar::after {
    content: ""; position: absolute; inset: 0; border-radius: 999px;
    background: linear-gradient(90deg, transparent, ${palette.accent}, transparent);
    animation: sweep 1.5s ease-in-out infinite;
  }
  @keyframes sweep {
    from { transform: translateX(-100%); }
    to { transform: translateX(100%); }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">${brand}</div>
    <div class="bar"></div>
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
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(palette))}`).catch((error: unknown) => {
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
