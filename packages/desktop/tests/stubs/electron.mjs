// 桌面主进程模块在 import 期就 `import { ... } from "electron"`，而单测跑在纯
// Node 下。这里只提供被测代码真正读取的字段/可调用占位，避免把 Electron 运行时
// 拖进测试；测试如果断言到具体交互，应显式扩展本文件而不是 mock 业务逻辑。
export const app = {
  isPackaged: false,
  getAppPath: () => process.cwd(),
  getPath: () => process.cwd(),
  setName: () => {},
  setPath: () => {},
  on: () => {},
  once: () => {},
  quit: () => {},
};
export const BrowserWindow = class {
  constructor() {}
  static getAllWindows() {
    return [];
  }
  webContents = { on: () => {}, once: () => {}, send: () => {} };
  on = () => {};
  once = () => {};
  isDestroyed = () => false;
  isVisible = () => false;
  show = () => {};
  hide = () => {};
};
export const Menu = { buildFromTemplate: () => ({}), setApplicationMenu: () => {} };
export const nativeImage = {
  createFromPath: () => ({ resize: () => ({ toPNG: () => Buffer.alloc(0) }) }),
};
export const nativeTheme = { shouldUseDarkColors: false, on: () => {} };
export const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 }, bounds: {} }),
  on: () => {},
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
};
export const shell = { openExternal: async () => {}, openPath: async () => "" };
export const ipcMain = { on: () => {}, once: () => {}, handle: () => {}, removeHandler: () => {} };
export const dialog = { showMessageBox: async () => ({ response: 0 }) };
export const session = { fromPartition: () => ({ clearStorageData: async () => {} }) };
export const Tray = class {
  constructor() {}
  setToolTip = () => {};
  setContextMenu = () => {};
  on = () => {};
  destroy = () => {};
};
export const Notification = class {
  constructor() {}
  show = () => {};
  on = () => {};
};
export const powerMonitor = { on: () => {} };
export const powerSaveBlocker = { start: () => 0, stop: () => {} };
export const webContents = { getAllWebContents: () => [] };
export const MessageChannelMain = class {};
export const utilityProcess = {
  fork: () => ({ on: () => {}, postMessage: () => {}, kill: () => {} }),
};
export const crashReporter = { start: () => {} };
