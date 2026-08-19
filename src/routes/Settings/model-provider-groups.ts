import type { CustomModelSummary } from "../../../electron/models/common.ts"

export interface CustomModelProviderGroup {
  providerId: string
  providerName: string
  models: CustomModelSummary[]
  /** 分组选择键：providerId 与 providerName 联合（自建厂商共用 providerId="custom"）。 */
  key: string
}

/** 自定义模型按供应商分组（保持出现顺序）。用户自建厂商共用 providerId="custom"，
 * 必须连同 providerName 一起作组键，否则所有自建厂商会挤进第一个厂商名下。 */
export function customModelsByProvider(models: CustomModelSummary[]): CustomModelProviderGroup[] {
  const groups: CustomModelProviderGroup[] = []
  for (const model of models) {
    const key = providerGroupKey(model.providerId, model.providerName)
    let group = groups.find((item) => item.key === key)
    if (!group) {
      group = { providerId: model.providerId, providerName: model.providerName, models: [], key }
      groups.push(group)
    }
    group.models.push(model)
  }
  return groups
}

export function providerGroupKey(providerId: string, providerName: string): string {
  return `${providerId}\0${providerName}`
}

/** 按关键词过滤分组：厂商名或组内任一模型名/displayName 命中即保留整组（模型也过滤）。 */
export function filterProviderGroups(groups: CustomModelProviderGroup[], query: string): CustomModelProviderGroup[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return groups
  }
  return groups
    .map((group) => {
      const providerHit = group.providerName.toLowerCase().includes(keyword)
      const models = providerHit
        ? group.models
        : group.models.filter(
            (model) =>
              model.displayName.toLowerCase().includes(keyword) || model.modelName.toLowerCase().includes(keyword),
          )
      return models.length > 0 ? { ...group, models } : null
    })
    .filter((group): group is CustomModelProviderGroup => group !== null)
}
