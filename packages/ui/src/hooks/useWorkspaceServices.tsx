import type { IServiceAccessor } from "@zcode/services";
import { useMemo } from "react";
import { useOptionalServices, useServices } from "@/hooks/useServices.js";

// DWeis Next 无云绑定：远程 workspace session 解析（remoteWorkspaceSessionStore、
// 断连代理、remote-waiting 门控）已随远程工作区摘除。当前窗口只有一套 Local Host
// services；preferredRemoteSessionId / workspaceIdentity / remoteTarget 形参仅为
// 兼容既有调用链保留，不再参与解析（tab 上的同名可选字段随后续阶段一并清理）。

interface WorkspaceServicesResolution {
  services: IServiceAccessor;
  remoteSessionId: string | null;
  isRemoteTarget: boolean;
  connectionKind: "local-ready" | "remote-waiting" | "remote-ready";
  rpcReady: boolean;
}

export function useWorkspaceServicesResolution(
  _workspacePath: string | null | undefined,
  _preferredRemoteSessionId?: string | null,
  _workspaceIdentity?: string | null,
  _remoteTarget?: unknown,
): WorkspaceServicesResolution {
  const services = useServices();
  return useMemo(
    () => ({
      services,
      remoteSessionId: null,
      isRemoteTarget: false,
      connectionKind: "local-ready" as const,
      rpcReady: true,
    }),
    [services],
  );
}

export function useWorkspaceServices(
  workspacePath: string | null | undefined,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
  remoteTarget?: unknown,
): IServiceAccessor {
  return useWorkspaceServicesResolution(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
    remoteTarget,
  ).services;
}

export function useBaseWorkspaceServices(): IServiceAccessor {
  // 本地窗口只有一套 Host services；原“root services 覆盖 nested provider”的语义
  // 是为隔离远程 attachment 引入的，随远程工作区一并移除。
  return useServices();
}

export function useOptionalBaseWorkspaceServices(): IServiceAccessor | null {
  return useOptionalServices();
}
