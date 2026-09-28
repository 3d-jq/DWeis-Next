// 桌面主进程模块在 import 期就 `import { app } from "electron"`，而单测跑在纯
// Node 下。这里只提供被测代码真正读取的字段，避免把 Electron 运行时拖进测试。
export const app = {
  isPackaged: false,
  getAppPath: () => process.cwd(),
};
