/**
 * 检查申请按收费方案多行落账（主项目、多部位加收、附加项目），后端要求同一申请的收费行整单结算、整单退费。
 * 勾选或取消其中一行时，返回同一申请在候选范围内的全部行，其余来源只返回自身。
 */
export interface OrderChargeLineRef {
  id: string
  sourceType?: string | null
  sourceId?: string | number | null
}

export function orderChargeLineIds<T extends OrderChargeLineRef>(candidates: readonly T[], id: string): string[] {
  const target = candidates.find((item) => item.id === id)
  if (!target || target.sourceType !== 'SERVICE_REQUEST' || target.sourceId == null) return [id]
  return candidates
    .filter((item) => item.sourceType === 'SERVICE_REQUEST' && String(item.sourceId) === String(target.sourceId))
    .map((item) => item.id)
}
