import { z } from 'zod'
import { clinicalBusinessDate } from '../../../shared/ui/clinicalResourceFacts'
import type { RhnApi } from '../../../shared/rhnApi'

const text = z.string().trim().min(1)
const optionalText = text.nullish()
const active = z.object({ id: text, code: text, name: text, sdStatus: z.literal('ACTIVE') })
const medication = active.extend({ preparationSpec: optionalText, preparationUnit: optionalText, aliasName: optionalText,
  defaultDose: z.number().finite().positive().nullish(), defaultDoseUnit: optionalText,
  defaultRoute: optionalText, defaultFrequency: optionalText })
const product = active.extend({ medicationId: text, unitCode: optionalText, tradeName: optionalText })
const disease = z.object({ id: text, systemCode: text, code: text, display: text, sdStatus: z.literal('ACTIVE'),
  sdDiagnosisDomain: z.enum(['WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME']) })
const period = { validFrom: z.iso.date(), validTo: z.iso.date().nullish() }
const adoption = z.object({ id: text, organizationId: text, catalogItemId: text, sdStatus: text,
  localCode: optionalText, localName: optionalText, orderable: z.boolean(), executable: z.boolean(), chargeable: z.boolean(), ...period })
const service = active.extend({ unitCode: text, sdServiceType: z.enum(['LABORATORY', 'EXAMINATION', 'TREATMENT', 'OTHER']),
  orderable: z.boolean(), chargeable: z.boolean(), sdUsageType: text, ...period, organizationAdoption: adoption.nullish() })
// All three directory APIs enforce a minimum page size of 10.
const catalogPageSize = 10
const page = z.object({ content: z.array(z.unknown()), totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(), page: z.literal(0), size: z.literal(catalogPageSize) })

function rows<T>(value: unknown, schema: z.ZodType<T>, label: string): T[] {
  const parsed = page.safeParse(value)
  if (!parsed.success || parsed.data.totalPages !== Math.ceil(parsed.data.totalElements / catalogPageSize)
    || parsed.data.content.length !== Math.min(parsed.data.totalElements, catalogPageSize)) {
    throw new Error(`${label}目录未返回完整查询结果，请重新检索。`)
  }
  const result = z.array(schema).safeParse(parsed.data.content)
  if (!result.success) throw new Error(`${label}目录缺少有效身份、类别或启用状态，请核实目录资料。`)
  return result.data
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  if (new Set(items.map(key)).size !== items.length) throw new Error('目录候选身份重复，请核实后重试。')
  return items
}

export interface TemplateMedicationCandidate {
  key: string; id: string; medicationId: string; name: string; isGenericOnly: boolean
  preparationSpec?: string | null; tradeName?: string | null; quantityUnit?: string | null
  defaultDose?: number | null; doseUnit?: string | null; defaultRoute?: string | null; defaultFrequency?: string | null
}
export type TemplateDiagnosisCandidate = { id: string; codeSystem: string; code: string; display: string;
  diagnosisDomain: 'WESTERN_MEDICINE' | 'TCM_DISEASE' | 'TCM_SYNDROME' }
export type TemplateServiceCandidate = { id: string; code: string; name: string; unitCode: string;
  serviceType: 'LABORATORY' | 'EXAMINATION' | 'TREATMENT' | 'OTHER'; organizationId: string; chargeable: boolean }

export async function searchTemplateMedications(api: RhnApi, query: string): Promise<TemplateMedicationCandidate[]> {
  // Both are ordinary first-party directories. A failed branch must not masquerade as a complete search.
  const [products, generics] = await Promise.all([
    api.masterData.searchMedicationProducts(query.trim(), '', 'ACTIVE', '', 0, catalogPageSize),
    api.masterData.searchMedications(query.trim(), '', 'ACTIVE', '', 0, catalogPageSize),
  ])
  const productsFound = unique(rows(products, z.object({ product, medication }), '药品产品'), row => row.product.id)
  const genericsFound = unique(rows(generics, medication, '通用药品'), row => row.id)
  const productRows = productsFound.map(({ product: p, medication: m }): TemplateMedicationCandidate => {
    if (p.medicationId !== m.id) throw new Error('产品与通用药品身份不一致，请核实目录。')
    return { key: `product:${p.id}`, id: p.id, medicationId: m.id, name: p.name, isGenericOnly: false,
      preparationSpec: m.preparationSpec, tradeName: p.tradeName, quantityUnit: p.unitCode,
      doseUnit: m.defaultDoseUnit, defaultDose: m.defaultDose, defaultRoute: m.defaultRoute, defaultFrequency: m.defaultFrequency }
  })
  return [...productRows, ...genericsFound.filter(m => !productRows.some(p => p.medicationId === m.id))
    .map((m): TemplateMedicationCandidate => ({ key: `generic:${m.id}`, id: m.id, medicationId: m.id, name: m.name,
      isGenericOnly: true, preparationSpec: m.preparationSpec, tradeName: m.aliasName, quantityUnit: m.preparationUnit,
      doseUnit: m.defaultDoseUnit, defaultDose: m.defaultDose, defaultRoute: m.defaultRoute, defaultFrequency: m.defaultFrequency }))]
}

export async function searchTemplateDiagnoses(api: RhnApi, query: string): Promise<TemplateDiagnosisCandidate[]> {
  return unique(rows(await api.masterData.searchDiseases(query.trim(), '', 'ACTIVE', '', 0, catalogPageSize), disease, '诊断'), row => row.id)
    .map(row => ({ id: row.id, codeSystem: row.systemCode, code: row.code, display: row.display, diagnosisDomain: row.sdDiagnosisDomain }))
}
export async function searchTemplateServices(api: RhnApi, query: string, organizationId?: string): Promise<TemplateServiceCandidate[]> {
  if (!organizationId?.trim()) throw new Error('当前工作机构尚未确认，不能检索院内项目。')
  const found = unique(rows(await api.masterData.searchServices(query.trim(), '', 'ACTIVE', organizationId, 0, catalogPageSize), service, '诊疗项目'), row => row.id)
  const today = clinicalBusinessDate()
  const effective = (value: { validFrom: string; validTo?: string | null }) => {
    if (value.validTo && value.validTo < value.validFrom) throw new Error('项目目录有效期异常，请核实目录。')
    return value.validFrom <= today && (!value.validTo || value.validTo >= today)
  }
  return found.filter(row => {
    const current = row.organizationAdoption
    if (current && (current.organizationId !== organizationId || current.catalogItemId !== row.id)) {
      throw new Error('项目机构采用身份与当前机构或目录不一致，请重新核实。')
    }
    const catalogEffective = effective(row)
    const adoptionEffective = current ? effective(current) : false
    return catalogEffective && adoptionEffective && row.orderable && ['OUTPATIENT', 'COMMON'].includes(row.sdUsageType)
      && ['LABORATORY', 'EXAMINATION'].includes(row.sdServiceType) && current?.sdStatus === 'ACTIVE' && current.orderable && current.executable
  }).map(row => ({ id: row.id, code: row.organizationAdoption!.localCode || row.code,
    name: row.organizationAdoption!.localName || row.name, unitCode: row.unitCode, serviceType: row.sdServiceType,
    organizationId, chargeable: row.chargeable && row.organizationAdoption!.chargeable }))
}
