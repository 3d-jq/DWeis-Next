// 轻量启动画面：冷启动时主窗口还在后台加载（agent 初始化、渲染进程就绪），
// 先弹一个与主窗口同尺寸的品牌画面遮挡加载；渲染层 UI 就绪后由调用方触发淡出销毁。
//
// 设计：
//   - 始终深蓝（与 logo 同款品牌色，让圆形猫头鹰图标自然融入背景）。
//   - 径向渐变背景 + 中心品牌蓝辉光，logo 浮在光晕中央。
//   - logo 缓慢呼吸 + 外环周期扩散，3 点错位弹跳替代单调进度条。
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
  /** 背景：外圈深色，作为径向渐变的终点。 */
  background: string
  /** 背景：中心亮色，作为径向渐变的起点。 */
  backgroundCenter: string
  /** logo 周围的品牌色辉光。 */
  glow: string
  /** 主文字色。 */
  foreground: string
  /** 副标 / 暗文字色。 */
  muted: string
  /** 加载点默认色。 */
  dot: string
  /** 加载点弹起时的强调色。 */
  dotActive: string
  /** 外环颜色。 */
  ring: string
}

function splashPalette(): SplashPalette {
  // 始终走深色：logo 是深蓝底白角色，splash 调成同款深蓝让 logo 自然融入，
  // 中心亮蓝径向渐变给"光源"，外圈更深一档增强纵深。这里保留 nativeTheme 入参便于未来扩展。
  void nativeTheme.shouldUseDarkColors
  return {
    background: "#0a1530",
    backgroundCenter: "rgba(28, 48, 90, 1)",
    glow: "rgba(80, 140, 255, 0.28)",
    foreground: "#f5f5f7",
    muted: "rgba(245, 245, 247, 0.55)",
    dot: "rgba(245, 245, 247, 0.28)",
    dotActive: "#5a8cff",
    ring: "rgba(90, 140, 255, 0.45)",
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
    background:
      radial-gradient(ellipse 65% 55% at 50% 46%, ${palette.backgroundCenter} 0%, ${palette.background} 72%),
      ${palette.background};
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
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .logo-wrap {
    position: relative;
    width: 128px; height: 128px;
    margin-bottom: 32px;
    display: flex; align-items: center; justify-content: center;
  }
  /* 中心品牌色辉光：给 logo 锚定"光源"，是整张图最强的视觉支点。 */
  .logo-wrap::before {
    content: ""; position: absolute; inset: -24px;
    background: radial-gradient(circle, ${palette.glow} 0%, transparent 65%);
    z-index: 0;
    animation: glow-pulse 4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes glow-pulse {
    0%, 100% { opacity: 0.7; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.06); }
  }
  /* 周期扩散的环：让静态画面"活"起来，又不喧宾夺主。 */
  .logo-wrap::after {
    content: ""; position: absolute; inset: 0;
    border-radius: 30px;
    border: 1.5px solid ${palette.ring};
    opacity: 0;
    animation: ring-expand 2.6s cubic-bezier(0.2, 0.6, 0.2, 1) infinite;
    pointer-events: none;
  }
  @keyframes ring-expand {
    0% { transform: scale(0.94); opacity: 0.75; }
    100% { transform: scale(1.4); opacity: 0; }
  }
  .logo {
    position: relative; z-index: 1;
    width: 128px; height: 128px;
    border-radius: 28px;
    object-fit: cover;
    filter: drop-shadow(0 14px 32px rgba(0, 0, 0, 0.45));
    animation: logo-breathe 3.6s ease-in-out infinite;
  }
  .logo-fallback {
    background: linear-gradient(135deg, ${palette.dotActive}, ${palette.ring});
    color: #ffffff;
    font-size: 56px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    border-radius: 28px;
  }
  @keyframes logo-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.025); }
  }
  .brand {
    font-size: 30px; font-weight: 600; letter-spacing: 0.005em;
    margin-bottom: 8px;
  }
  .tagline {
    font-size: 13px; font-weight: 500; letter-spacing: 0.04em;
    color: ${palette.muted};
    margin-bottom: 44px;
    font-variant-numeric: tabular-nums;
  }
  .dots {
    display: flex; gap: 9px;
  }
  .dots span {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: ${palette.dot};
    animation: dot-bounce 1.4s ease-in-out infinite;
  }
  .dots span:nth-child(2) { animation-delay: 0.18s; }
  .dots span:nth-child(3) { animation-delay: 0.36s; }
  @keyframes dot-bounce {
    0%, 80%, 100% { transform: translateY(0); background: ${palette.dot}; }
    40% { transform: translateY(-8px); background: ${palette.dotActive}; }
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="logo-wrap">${logoNode}</div>
    <div class="brand">${brand}</div>
    <div class="tagline">v${version}</div>
    <div class="dots"><span></span><span></span><span></span></div>
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
