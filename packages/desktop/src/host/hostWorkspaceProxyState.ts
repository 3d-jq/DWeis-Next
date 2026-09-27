import type { IDisposable } from "@zcode/rpc";
import { resolveWorkspaceKey } from "@zcode/shared";

interface HostWorkspaceTaskMeta {
  taskId: string;
  traceId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

interface HostWorkspaceContext {
  workspacePath: string;
  workspaceIdentity?: string;
}

/**
 * 保存窗口 Host 代理层持有的 workspace 资源（task meta、workspace 订阅、task ready 监听）。
 *
 * DWeis Next 无云绑定：原 hostRemoteWorkspaceProxyState.ts 仅服务于远程 Host Pool；
 * 远程工作区摘除后本地装配仍需要同一套按 workspace 的引用清理逻辑，故更名保留。
 */
export function createHostWorkspaceProxyState(): {
  rememberTaskMeta: (meta: HostWorkspaceTaskMeta) => void;
  getTaskMeta: (taskId: string) => HostWorkspaceTaskMeta | undefined;
  ensureWorkspaceSubscription: (
    context: HostWorkspaceContext,
    subscribe: () => IDisposable,
  ) => boolean;
  trackTaskReady: (
    taskId: string,
    context: HostWorkspaceContext,
    subscribe: (listener: () => void) => IDisposable,
    onReady: () => void,
  ) => void;
  disposeTaskReadySubscription: (taskId: string) => void;
  clearWorkspace: (context: HostWorkspaceContext) => void;
} {
  const taskMetaById = new Map<string, HostWorkspaceTaskMeta>();
  const workspaceSubscriptions = new Map<string, IDisposable>();
  const taskReadySubscriptions = new Map<
    string,
    { workspaceKey: string; disposable: IDisposable }
  >();

  function disposeTaskReadySubscription(taskId: string): void {
    const entry = taskReadySubscriptions.get(taskId);
    if (!entry) {
      return;
    }
    taskReadySubscriptions.delete(taskId);
    entry.disposable.dispose();
  }

  return {
    rememberTaskMeta(meta) {
      taskMetaById.set(meta.taskId, meta);
    },

    getTaskMeta(taskId) {
      return taskMetaById.get(taskId);
    },

    ensureWorkspaceSubscription(context, subscribe) {
      const workspaceKey = resolveWorkspaceKey(context);
      if (workspaceSubscriptions.has(workspaceKey)) {
        return false;
      }
      workspaceSubscriptions.set(workspaceKey, subscribe());
      return true;
    },

    trackTaskReady(taskId, context, subscribe, onReady) {
      let readyBeforeRegistration = false;
      const disposable = subscribe(() => {
        readyBeforeRegistration = true;
        disposeTaskReadySubscription(taskId);
        onReady();
      });
      if (readyBeforeRegistration) {
        // 动态 RPC 事件通常不会同步 replay，但这里处理同步实现，避免 ready 已结束后又留下 listener。
        disposable.dispose();
        return;
      }
      disposeTaskReadySubscription(taskId);
      taskReadySubscriptions.set(taskId, {
        workspaceKey: resolveWorkspaceKey(context),
        disposable,
      });
    },

    disposeTaskReadySubscription,

    clearWorkspace(context) {
      const workspaceKey = resolveWorkspaceKey(context);
      workspaceSubscriptions.get(workspaceKey)?.dispose();
      workspaceSubscriptions.delete(workspaceKey);

      for (const [taskId, meta] of taskMetaById) {
        if (resolveWorkspaceKey(meta) === workspaceKey) {
          taskMetaById.delete(taskId);
        }
      }
      for (const [taskId, entry] of taskReadySubscriptions) {
        if (entry.workspaceKey === workspaceKey) {
          disposeTaskReadySubscription(taskId);
        }
      }
    },
  };
}
