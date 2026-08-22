// 自定义标题栏的窗口控制 IPC：minimize / toggleMaximize / close / isMaximized。
// 配合 main.ts 的 frame: false 让渲染层完全控制窗口外观，
// 同时通过 thickFrame: true 保留 Windows 11 圆角和 resize 边框。
import { BrowserWindow, ipcMain } from "electron"

const CHANNEL_MINIMIZE = "window-control:minimize"
const CHANNEL_TOGGLE_MAXIMIZE = "window-control:toggle-maximize"
const CHANNEL_CLOSE = "window-control:close"
const CHANNEL_IS_MAXIMIZED = "window-control:is-maximized"

function getTargetWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerWindowControlIpc(): void {
  ipcMain.handle(CHANNEL_MINIMIZE, (event) => {
    const win = getTargetWindow(event)
    win?.minimize()
  })

  ipcMain.handle(CHANNEL_TOGGLE_MAXIMIZE, (event) => {
    const win = getTargetWindow(event)
    if (!win) {
      return
    }
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(CHANNEL_CLOSE, (event) => {
    const win = getTargetWindow(event)
    win?.close()
  })

  ipcMain.handle(CHANNEL_IS_MAXIMIZED, (event) => {
    const win = getTargetWindow(event)
    return win?.isMaximized() ?? false
  })
}

export const windowControlChannels = {
  minimize: CHANNEL_MINIMIZE,
  toggleMaximize: CHANNEL_TOGGLE_MAXIMIZE,
  close: CHANNEL_CLOSE,
  isMaximized: CHANNEL_IS_MAXIMIZED,
} as const
