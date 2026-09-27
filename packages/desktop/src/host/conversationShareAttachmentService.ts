import type { IConversationShareService } from "@zcode/services";

/**
 * 为 attachment 连接裁剪会话分享服务。
 *
 * DWeis Next 无云服务：分享服务已统一替换为 createUnsupportedConversationShareService
 * （本地宿主与 desktop-attached-remote 宿主一致），所有写操作与远端查询自身就会
 * 快速失败，连接 scope（conversationShareConnectionScopeFactory）随实现删除，
 * 这里不再需要按 clientMode 区分，直接透传服务实例。
 * 保留函数签名是为了不破坏 host/index attachment 装配的调用契约。
 */
export function scopeConversationShareServiceForAttachment(
  service: IConversationShareService,
  clientMode: "desktop-continuous" | "web-remote-replayable",
  agentService?: unknown,
): IConversationShareService {
  void clientMode;
  void agentService;
  return service;
}
