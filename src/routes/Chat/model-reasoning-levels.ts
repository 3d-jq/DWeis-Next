import type { ReasoningLevel } from "../../../electron/chat/common.ts"
import type { ModelCatalog } from "../../../electron/models/common.ts"

import { DWEIS_REASONING_LEVELS, DWEIS_REASONING_VARIANT_LEVELS } from "../../../electron/agent/reasoning.ts"

const reasoningLevelOptions: readonly ReasoningLevel[] = DWEIS_REASONING_LEVELS

export function selectedModelReasoningLevels(catalog: ModelCatalog | null): ReasoningLevel[] {
  if (!catalog || !catalog.selected) {
    return [...reasoningLevelOptions]
  }
  const selected = catalog.selected
  const variants =
    selected.kind === "custom"
      ? catalog.customModels.find((model) => model.id === selected.id)?.reasoningVariants
      : undefined
  const supported = new Set(variants ?? [])
  return ["default", ...DWEIS_REASONING_VARIANT_LEVELS.filter((level) => supported.has(level))]
}

/**
 * 把当前推理档位钳制到模型支持范围：支持则原样；否则取"不超过用户档位的最高支持档"，
 * 全高于用户档位时用支持的最低档。避免滑杆位置与标签不一致（如档位 max 但模型只到 high）。
 */
export function clampReasoningLevel(level: ReasoningLevel, levels: readonly ReasoningLevel[]): ReasoningLevel {
  if (levels.includes(level) || levels.length === 0) {
    return level
  }
  const userIndex = DWEIS_REASONING_LEVELS.indexOf(level)
  let best = levels[0]
  for (const candidate of levels) {
    if (DWEIS_REASONING_LEVELS.indexOf(candidate) <= userIndex) {
      best = candidate
    }
  }
  return best
}
