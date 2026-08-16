export type RuntimeMode = "local"

/** 可跨 preload / Renderer 边界共享的无凭证能力摘要。 */
export interface RuntimeCapabilities {
  mode: RuntimeMode
  localAgent: boolean
  localTools: boolean
  customModels: boolean
}

export interface RuntimeCapabilityOptions {
  mode: RuntimeMode
  /** 当前构建与运行状态是否已经具备本地 Agent。 */
  localAgentAvailable: boolean
}

/** 纯本地 self-managed 能力推导：无云模型/团队/账单/语音/云技能/连接器。 */
export function resolveRuntimeCapabilities({ localAgentAvailable }: RuntimeCapabilityOptions): RuntimeCapabilities {
  return {
    mode: "local",
    localAgent: localAgentAvailable,
    localTools: localAgentAvailable,
    customModels: true,
  }
}
