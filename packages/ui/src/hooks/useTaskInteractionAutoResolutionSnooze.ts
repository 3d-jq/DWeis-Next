import { useCallback, useRef } from "react";
import { ensureAgentV4ConnectionHandshake } from "@/v4/agentV4ConnectionHandshake.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";
import { sendInteractionAutoResolutionSnooze } from "@/v4/interactionAutoResolutionCommand.js";

interface TaskInteractionAutoResolutionTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  sessionId: string;
}

/**
 * 侧栏 task 可能来自本地、远端、timeline 或 pinned 列表；暂停命令必须按 workspace identity
 * 找到原 host，不能因为当前激活 tab 不同而发到当前窗口的 service。
 */
export function useTaskInteractionAutoResolutionSnooze(
  target: TaskInteractionAutoResolutionTarget,
) {
  const loggedInteractionIdsRef = useRef(new Set<string>());
  const workspaceIdentity = target.workspaceIdentity?.trim() || undefined;
  // DWeis Next 无云绑定：远程 session 路由已随远程工作区摘除，
  // 暂停命令始终发往当前窗口 Local Host 的 agent service。
  const targetServices = useOptionalServices();

  return useCallback(
    async (interactionId: string): Promise<boolean> => {
      const agentService = targetServices?.zcodeAgentService;
      if (!agentService) {
        logger.warn("[task-interaction] 暂停自动结束时目标 workspace 未连接", {
          interactionId,
          sessionId: target.sessionId,
          workspaceKey: workspaceIdentity ?? target.workspacePath,
        });
        return false;
      }
      if (!loggedInteractionIdsRef.current.has(interactionId)) {
        loggedInteractionIdsRef.current.add(interactionId);
        logger.debug("[task-interaction] 用户从侧栏请求暂停自动结束", {
          interactionId,
          sessionId: target.sessionId,
          source: "taskBadge",
        });
      }

      return sendInteractionAutoResolutionSnooze({
        sessionId: target.sessionId,
        interactionId,
        source: "taskBadge",
        sendCommand: async (envelope) => {
          await ensureAgentV4ConnectionHandshake(agentService);
          return agentService.sendConversationCommandV4({
            workspacePath: target.workspacePath,
            ...(workspaceIdentity ? { workspaceIdentity } : {}),
            envelope,
          });
        },
      });
    },
    [target.sessionId, target.workspacePath, targetServices, workspaceIdentity],
  );
}
