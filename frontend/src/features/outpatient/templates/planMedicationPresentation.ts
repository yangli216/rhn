import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'

export function formatRouteName(route?: string | null, routes?: { code: string; name: string }[]): string {
  if (!route) return '途径待确认'
  return routes?.find(item => item.code === route)?.name ?? `${route}（待字典核对）`
}

/** Display confirmed dose fields only; names and free-text strength are not conversion contracts. */
export function medicationSingleDoseLabel(item: CompiledPlanMedicationItem): string {
  if (item.doseValue == null || !Number.isFinite(item.doseValue) || item.doseValue <= 0 || !item.doseUnit?.trim()) return '单次剂量待确认'
  return `每次 ${item.doseValue}${item.doseUnit}`
}
