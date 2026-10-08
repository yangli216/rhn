import { z } from 'zod'
import type { ClinicalMedicationStandards, DiseaseConcept, MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import { clinicalBusinessDate } from '../../../shared/ui/clinicalResourceFacts'

const text = z.string().trim().min(1)
const active = z.object({ id: text, code: text, name: text, sdStatus: z.literal('ACTIVE') })
const diagnosis = z.object({ id: text, systemCode: text, code: text, display: text, sdStatus: z.literal('ACTIVE'),
  sdDiagnosisDomain: z.enum(['WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME']) })
const medication = active.extend({ preparationUnit: text.nullish(),
  defaultDose: z.number().finite().positive().nullish(), defaultDoseUnit: text.nullish(),
  defaultRoute: text.nullish(), defaultFrequency: text.nullish() })
const service = active.extend({ unitCode: text, sdServiceType: z.enum(['LABORATORY', 'EXAMINATION', 'TREATMENT', 'OTHER']) })

export function requireEditorDiagnosis(value: DiseaseConcept): DiseaseConcept {
  if (!diagnosis.safeParse(value).success) throw new Error('诊断身份、编码体系或类型尚未确认，不能加入方案。')
  return value
}
export function requireEditorMedication(value: MedicationKnowledge): MedicationKnowledge {
  if (!medication.safeParse(value).success) throw new Error('药品身份、状态或默认用法异常，请核实主数据。')
  return value
}
export function requireEditorService(value: ServiceCatalogItem): ServiceCatalogItem {
  if (!service.safeParse(value).success) throw new Error('诊疗项目身份、类型或数量单位缺失，请核实主数据。')
  return value
}
export function requireEditorPage<T>(value: { content: T[]; totalElements: number; totalPages: number; page: number; size: number }, check: (item: T) => T): T[] {
  if (!value || !Array.isArray(value.content) || value.page !== 0 || value.size !== 30
    || !Number.isSafeInteger(value.totalElements) || value.totalElements < 0
    || value.totalPages !== Math.ceil(value.totalElements / 30) || value.content.length !== Math.min(value.totalElements, 30)) {
    throw new Error('目录未返回完整查询结果，请重新检索。')
  }
  const rows = value.content.map(check)
  if (new Set(rows.map(item => (item as { id: string }).id)).size !== rows.length) throw new Error('目录身份重复，请重新核实。')
  return rows
}
export function requireEditorStandards(value: ClinicalMedicationStandards): ClinicalMedicationStandards {
  const option = z.object({ code: text, name: text })
  if (!z.object({ version: text, doseUnits: z.array(z.object({ code: text, display: text })),
    routes: z.array(option), frequencies: z.array(option) }).safeParse(value).success
    || [value.doseUnits, value.routes, value.frequencies].some(items => new Set(items.map(item => item.code)).size !== items.length)) {
    throw new Error('用法字典返回不完整或编码重复，请重新加载。')
  }
  return value
}
export function editorServiceAdopted(value: ServiceCatalogItem, organizationId?: string): boolean {
  const adoption = value.organizationAdoption
  if (adoption == null) return false
  if (!organizationId || adoption.organizationId !== organizationId || !text.safeParse(adoption.catalogItemId).success
    || !['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'REPLACED'].includes(adoption.sdStatus)
    || typeof adoption.orderable !== 'boolean' || !z.iso.date().safeParse(adoption.validFrom).success
    || adoption.validTo != null && (!z.iso.date().safeParse(adoption.validTo).success || adoption.validTo < adoption.validFrom)) {
    throw new Error('项目机构采用信息不完整或机构不符，请重新核对。')
  }
  const today = clinicalBusinessDate()
  return adoption.sdStatus === 'ACTIVE' && adoption.orderable && adoption.validFrom <= today && (!adoption.validTo || adoption.validTo >= today)
}

export function editorMedicationValidation(items: CompiledPlanMedicationItem[], standards?: ClinicalMedicationStandards): string {
  if (!items.length) return ''
  if (!standards) return '用法字典尚未确认，含药品的方案暂不能保存。'
  for (const item of items) {
    const choices = [[item.doseUnit, standards.doseUnits], [item.routeCode, standards.routes], [item.frequencyCode, standards.frequencies]] as const
    if (choices.some(([code, options]) => code && !options.some(option => option.code === code))) {
      return '方案中存在未在当前字典确认的剂量单位、途径或频次，请重新选择或明确清除。'
    }
    if (item.doseValue != null && !item.doseUnit || item.durationValue != null && !['d', 'w', 'm'].includes(item.durationUnit ?? '')) {
      return '药品剂量或疗程缺少明确单位，请补充后保存。'
    }
  }
  return ''
}
