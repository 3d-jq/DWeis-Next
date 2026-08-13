export const DWEIS_DEFAULT_REASONING_LEVEL = "default"
export const DWEIS_REASONING_VARIANT_LEVELS = ["low", "medium", "high", "max"] as const
export const DWEIS_REASONING_LEVELS = [DWEIS_DEFAULT_REASONING_LEVEL, ...DWEIS_REASONING_VARIANT_LEVELS] as const

export type DWeisReasoningLevel = (typeof DWEIS_REASONING_LEVELS)[number]
export type DWeisReasoningVariant = (typeof DWEIS_REASONING_VARIANT_LEVELS)[number]

export function opencodeReasoningVariant(level: DWeisReasoningLevel | undefined): DWeisReasoningVariant | undefined {
  return level && level !== DWEIS_DEFAULT_REASONING_LEVEL ? level : undefined
}
