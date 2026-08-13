import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"

import { isTrustedRendererUrl } from "./media-permission-policy.ts"

/**
 * IPC sender 校验（纵深防御，本地自管理模式无远程攻击面，防的是渲染端被注入/iframe 提权）：
 * RPC 调用必须来自我们主窗口的主 frame（非 iframe/webview 子 frame），且 frame URL 是我们自己的
 * origin（dev server 或打包 renderer 目录）。
 *
 * 注：曾加入过"方法白名单"（ALLOWED_RPC_METHODS），但因服务名/方法枚举与调用点难保持同步、
 * 漏项导致 RPC 静默返回 undefined（build215 白屏、build216 解构报错），已整体回退——sender 校验
 * 是真正的主防御，方法级白名单收益低、维护成本高。
 */
export interface TrustedIpcSenderOptions {
  viteDevServerUrl: string | undefined
  rendererBaseUrl: string
}

/** IPC 来源校验：必须是主 frame（iframe/webview 子 frame 拒绝）且 URL 是我们自己的 origin。 */
export function isTrustedIpcSender(
  event: Pick<IpcMainEvent | IpcMainInvokeEvent, "sender" | "senderFrame">,
  options: TrustedIpcSenderOptions,
): boolean {
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame) {
    return false
  }
  return isTrustedRendererUrl(frame.url, options.viteDevServerUrl, options.rendererBaseUrl)
}
