export type DWeisAgentMode = "build" | "plan"

export const DWEIS_BUILD_AGENT_NAME = "build"
export const DWEIS_PLAN_AGENT_NAME = "plan"
export const DWEIS_GENERAL_SUBAGENT_NAME = "general"
export const DWEIS_DEFAULT_AGENT_MODE: DWeisAgentMode = DWEIS_BUILD_AGENT_NAME
export const DWEIS_AGENT_MODES = [DWEIS_BUILD_AGENT_NAME, DWEIS_PLAN_AGENT_NAME] as const

export function normalizeDWeisAgentMode(mode: DWeisAgentMode | undefined): DWeisAgentMode {
  return mode === DWEIS_PLAN_AGENT_NAME ? DWEIS_PLAN_AGENT_NAME : DWEIS_DEFAULT_AGENT_MODE
}
