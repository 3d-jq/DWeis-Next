import type { ServiceName } from "@oomol/connection"

import { serviceName } from "../branding.ts"

export interface BrowserViewBounds {
  height: number
  width: number
  x: number
  y: number
}

export interface BrowserNavigationState {
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  title: string
  url: string
}

/** 设备模拟配置：目标 CSS 视口 + 移动端 UA（null 表示恢复桌面默认）。 */
export interface BrowserDeviceEmulation {
  height: number
  userAgent: string | null
  width: number
}

export interface BrowserPageState {
  crashed: boolean
  navigation: BrowserNavigationState
  /** null = 未开启设备模拟；随 state 广播以便面板重建后恢复模拟状态。 */
  device: BrowserDeviceEmulation | null
  sessionId: string
  visible: boolean
}

export interface BrowserNavigateRequest {
  sessionId: string
  url: string
}

export interface BrowserShowRequest {
  bounds: BrowserViewBounds
  sessionId: string
  /** 显示缩放（设备模拟时 = 设备框宽 / 目标视口宽）；缺省 1。 */
  zoom?: number
}

export interface BrowserDeviceRequest {
  /** null = 关闭设备模拟并恢复默认 UA。 */
  device: BrowserDeviceEmulation | null
  sessionId: string
}

export interface BrowserDownloadResult {
  filename: string
  state: "completed" | "interrupted"
}

export type BrowserService = typeof BrowserService
export const BrowserService = serviceName("browser-service") as ServiceName<{
  ServerEvents: {
    browserRequested: { sessionId: string }
    downloadFinished: BrowserDownloadResult
    pageRemoved: { sessionId: string }
    stateChanged: BrowserPageState
  }
  ClientInvokes: {
    clearData(): Promise<void>
    capturePreview(sessionId: string): Promise<string | null>
    getState(sessionId: string): Promise<BrowserPageState | null>
    show(request: BrowserShowRequest): Promise<BrowserPageState>
    hide(sessionId: string): Promise<void>
    applyDeviceOverrides(request: BrowserDeviceRequest): Promise<BrowserPageState>
    navigate(request: BrowserNavigateRequest): Promise<BrowserPageState>
    goBack(sessionId: string): Promise<BrowserPageState>
    goForward(sessionId: string): Promise<BrowserPageState>
    reload(sessionId: string): Promise<BrowserPageState>
    openDownloadsFolder(): Promise<void>
    openInSystemBrowser(sessionId: string): Promise<void>
    /** 用户手动缩放（0.25-5）；独立于设备模拟的 fit 缩放。 */
    setZoom(sessionId: string, factor: number): Promise<void>
    /** 截图当前可视区域并存文件，成功后在系统文件管理器中定位。 */
    saveScreenshot(sessionId: string): Promise<void>
    /** 清除浏览器分区 Cookies（不重载/关闭页面）。 */
    clearCookies(): Promise<void>
    /** 清除浏览器分区缓存（不重载/关闭页面）。 */
    clearCache(): Promise<void>
    /** 加载空白页（重置地址栏视图，不销毁会话）。 */
    loadBlank(sessionId: string): Promise<BrowserPageState>
  }
}>
