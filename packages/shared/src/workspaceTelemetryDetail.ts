// DWeis Next：遥测已摘除（平台方法为空操作）。本函数仅为保留埋点载荷形状的
// 兼容层，随事件一起空转；legacy session 数据仍可能带 remote: 前缀 identity，
// 因此保留解析，使历史会话的 workspace_kind 判定不回退到错误的本地位。
import {
  parseRemoteWorkspaceIdentity,
  type RemoteWorkspaceIdentityKind,
} from "./remote-workspace-identity.js";

/** 只提取场景枚举；未知远端身份仍为 remote，禁止向业务埋点暴露地址或路径。 */
export function resolveWorkspaceTelemetryDetail(scope: {
  workspaceIdentity?: string | null;
  remoteSessionId?: string | null;
}): { workspace_kind: "local" | "remote"; remote_kind: RemoteWorkspaceIdentityKind | "" } {
  const identity = scope.workspaceIdentity?.trim();
  return {
    workspace_kind: identity || scope.remoteSessionId?.trim() ? "remote" : "local",
    remote_kind: identity ? (parseRemoteWorkspaceIdentity(identity)?.kind ?? "") : "",
  };
}
