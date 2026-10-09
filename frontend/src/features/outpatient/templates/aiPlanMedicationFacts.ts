import type { ClinicalMedicationStandards } from '../../../shared/api/masterDataApi'
import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { TemplateMedicationCandidate } from './templateCatalogSearch'

export const planDurationUnits = [
  { value: 'd', label: '天' }, { value: 'w', label: '周' }, { value: 'm', label: '月' },
  { value: '天', label: '天' }, { value: '日', label: '日' }, { value: '周', label: '周' }, { value: '月', label: '月' },
]

function sourceDose(source: string): { doseValue: number; doseUnit: string } | undefined {
  const matched = /(?:单次剂量|每次|一次|常规用法)[：:]?\s*([0-9]+(?:\.[0-9]+)?|\.[0-9]+)\s*(kg|mg|ug|μg|µg|ng|g|mL|ml|uL|μL|µL|L|千克|毫克|微克|纳克|克|毫升|微升|升|片|粒|支|袋|包)/i.exec(source)
  if (!matched) return undefined
  const units: Record<string, string> = { 千克: 'kg', 克: 'g', 毫克: 'mg', 微克: 'ug', 'μg': 'ug', 'µg': 'ug', 纳克: 'ng', 升: 'L', 毫升: 'mL', ml: 'mL', 微升: 'uL', 'μL': 'uL', 'µL': 'uL' }
  return { doseValue: Number(matched[1]), doseUnit: units[matched[2]] ?? matched[2] }
}

function sourceDuration(source: string): { durationValue: number; durationUnit: string } | undefined {
  const matched = /(?:疗程|连用|用药)[：:]?\s*([0-9]+(?:\.[0-9]+)?|\.[0-9]+)\s*(天|日|周|月)/.exec(source)
  return matched ? { durationValue: Number(matched[1]), durationUnit: matched[2] } : undefined
}

function sourceFrequency(source: string): string | undefined {
  const matched = /(?<![a-zA-Z0-9])(qid|tid|bid|qd|qn|prn)(?![a-zA-Z0-9])|(?:每日|一日)(一|二|两|三|四)次|每晚一次|必要时/i.exec(source)
  if (!matched) return undefined
  const token = matched[0].toLowerCase().replaceAll('.', '')
  if (token === '必要时') return 'PRN'
  if (token === '每晚一次') return 'QN'
  if (/一次/.test(token)) return 'QD'
  if (/(?:二|两)次/.test(token)) return 'BID'
  if (/三次/.test(token)) return 'TID'
  if (/四次/.test(token)) return 'QID'
  return token.toUpperCase()
}

export function medicationCandidateDraft(candidate: TemplateMedicationCandidate, source = ''): CompiledPlanMedicationItem {
  const unsafeSource = /(?:不要|不得|禁止|避免|无需|无须)\s*(?:再|继续)?\s*(?:口服|静脉滴注|静脉注射|肌内注射|外用|服用|使用|用药|给药|每次)/.test(source)
    || /(?:单次剂量|每次|一次|疗程|连用|用药)[：:]?\s*[0-9.]+\s*(?:kg|mg|ug|μg|µg|ng|g|mL|ml|uL|μL|µL|L|天|日|周|月)?\s*(?:[-–~～至或/／]|到)\s*[0-9.]+/i.test(source)
  const dose = unsafeSource ? undefined : sourceDose(source)
  const duration = unsafeSource ? undefined : sourceDuration(source)
  const frequency = unsafeSource ? undefined : sourceFrequency(source)
  const useCatalogDefaults = !source || !unsafeSource
  const doseValue = dose?.doseValue ?? (useCatalogDefaults ? candidate.defaultDose ?? undefined : undefined)
  const doseUnit = doseValue == null ? undefined : dose?.doseUnit ?? candidate.doseUnit ?? undefined
  return {
    medicationId: candidate.medicationId,
    catalogItemId: candidate.isGenericOnly ? undefined : candidate.id,
    medicationName: candidate.name, preparationSpec: candidate.preparationSpec ?? undefined,
    doseValue,
    doseUnit,
    routeCode: useCatalogDefaults ? candidate.defaultRoute ?? undefined : undefined,
    frequencyCode: frequency ?? (useCatalogDefaults ? candidate.defaultFrequency ?? undefined : undefined),
    durationValue: duration?.durationValue,
    durationUnit: duration?.durationUnit,
    quantity: 1, quantityUnit: candidate.quantityUnit ?? undefined,
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
