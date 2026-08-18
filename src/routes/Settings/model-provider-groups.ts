import type { CustomModelSummary } from "../../../electron/models/common.ts"

/** 自定义模型按供应商分组（保持出现顺序）。用户自建厂商共用 providerId="custom"，
 * 必须连同 providerName 一起作组键，否则所有自建厂商会挤进第一个厂商名下。 */
export function customModelsByProvider(
  models: CustomModelSummary[],
): Array<{ providerId: string; providerName: string; models: CustomModelSummary[] }> {
  const groups: Array<{ providerId: string; providerName: string; models: CustomModelSummary[] }> = []
  for (const model of models) {
    let group = groups.find(
      (item) => item.providerId === model.providerId && item.providerName === model.providerName,
    )
    if (!group) {
      group = { providerId: model.providerId, providerName: model.providerName, models: [] }
      groups.push(group)
    }
    group.models.push(model)
  }
  return groups
}
