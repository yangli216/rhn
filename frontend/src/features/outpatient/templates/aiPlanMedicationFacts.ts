import type { ClinicalMedicationStandards } from '../../../shared/api/masterDataApi'
import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { TemplateMedicationCandidate } from './templateCatalogSearch'

export const planDurationUnits = [
  { value: 'd', label: '天' }, { value: 'w', label: '周' }, { value: 'm', label: '月' },
  { value: '天', label: '天' }, { value: '日', label: '日' }, { value: '周', label: '周' }, { value: '月', label: '月' },
]

export function medicationCandidateDraft(candidate: TemplateMedicationCandidate): CompiledPlanMedicationItem {
  return {
    medicationId: candidate.medicationId,
    catalogItemId: candidate.isGenericOnly ? undefined : candidate.id,
    medicationName: candidate.name, preparationSpec: candidate.preparationSpec ?? undefined,
    quantity: Number.NaN, quantityUnit: candidate.quantityUnit ?? undefined,
    substitutionAllowed: true, selfProvided: false,
  }
}

export function aiMedicationValidation(item: CompiledPlanMedicationItem, standards?: ClinicalMedicationStandards, requireDirections = false): string {
  if (!standards) return '用法字典尚未确认，请加载后核对。'
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return '请填写大于 0 的数量。'
  if (!item.quantityUnit?.trim()) return '目录缺少数量单位，请重新选择或维护药品目录。'
  if (item.doseValue != null && (!Number.isFinite(item.doseValue) || item.doseValue <= 0)) return '单次剂量必须大于 0。'
  if (item.doseValue != null && !item.doseUnit) return '请确认单次剂量单位。'
  if (item.durationValue != null && (!Number.isFinite(item.durationValue) || item.durationValue <= 0
    || !planDurationUnits.some(unit => unit.value === item.durationUnit))) return '请填写有效疗程并选择单位。'
  if (item.durationUnit && !planDurationUnits.some(unit => unit.value === item.durationUnit)) return '疗程单位尚未确认，请重新选择。'
  const choices = [[item.doseUnit, standards.doseUnits], [item.routeCode, standards.routes], [item.frequencyCode, standards.frequencies]] as const
  if (choices.some(([code, options]) => code && !options.some(option => option.code === code))) return '剂量单位、途径或频次未在当前字典确认，请重新选择。'
  if (requireDirections && (item.doseValue == null || !item.doseUnit || !item.routeCode || !item.frequencyCode)) {
    return '请明确单次剂量、途径和频次后确认原建议。'
  }
  return ''
}
