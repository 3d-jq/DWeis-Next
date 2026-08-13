// postinstall：把当前平台的 ripgrep 二进制下载到 .oo-bin/（gitignore），供 OpenCode grep 工具使用。
//
// 全程 best-effort：任何失败只告警、不阻断 pnpm install；prepare-binaries 会在打包前再次 ensure。

import { downloadRipgrepBinary, RIPGREP_VERSION } from "./ripgrep.ts"

await main()

async function main(): Promise<void> {
  try {
    if (process.env.OO_SKIP_BINARY_DOWNLOAD === "1" || process.env.DWEIS_SKIP_RIPGREP_DOWNLOAD === "1") {
      console.log("Skip downloading ripgrep binary.")
      return
    }
    const dest = await downloadRipgrepBinary()
    console.log(`[dweis] ripgrep ${RIPGREP_VERSION} ready at ${dest}`)
  } catch (error) {
    console.warn("[dweis] download-ripgrep postinstall failed (non-fatal):", error)
  }
}
