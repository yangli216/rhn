import { z } from 'zod'
import type { OutpatientPlanTemplate, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { OutpatientNoteTemplate, SaveOutpatientNoteTemplateInput } from '../../../shared/api/outpatientNoteTemplatesApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { recordTextFields } from '../../../shared/api/recordAnnotations'

const text = z.string().trim().min(1)
const optionalText = text.nullish()
const identity = z.object({ id: text, revision: z.number().int().nonnegative(), name: text,
  scopeType: z.enum(['PERSONAL', 'DEPARTMENT', 'HOSPITAL']), status: z.literal('ACTIVE') }).passthrough()
const diagnosis = z.object({ code: text, display: text, type: z.enum(['PRIMARY', 'SECONDARY']) }).passthrough()
const medication = z.object({ lineId: text, medicationId: text, medicationCode: text, medicationName: text,
  editorMode: z.enum(['regular', 'herbal']), categoryCode: z.enum(['WESTERN', 'CHINESE_PATENT', 'HERBAL']),
  catalogItemId: optionalText, packageId: optionalText, quantity: z.number().finite().positive(), quantityUnit: text,
  substitutionAllowed: z.boolean(), selfProvided: z.boolean() }).passthrough()
const service = z.object({ catalogItemId: text, itemCode: text, itemName: text,
  serviceType: z.enum(['LABORATORY', 'EXAMINATION', 'TREATMENT', 'OTHER']),
  quantity: z.number().finite().positive(), unitCode: text }).passthrough()
const planSchema = identity.extend({ diagnoses: z.array(diagnosis), medications: z.array(medication), services: z.array(service),
  noteTemplateId: optionalText, tasks: z.array(z.unknown()) })
const annotation = z.object({ field: z.enum(recordTextFields), text: z.string(), start: z.number().int().nonnegative().nullish(),
  source: z.enum(['TEMPLATE', 'VOICE', 'CONTEXT', 'DOCTOR', 'AI']),
  kind: z.enum(['PRESET', 'VARIABLE', 'IMPORTANT', 'FACT', 'CONFLICT']), confirmed: z.boolean().nullish() }).passthrough()
const noteSchema = identity.extend({ scopeType: z.enum(['PERSONAL', 'DEPARTMENT']), specialtyCode: text,
  documentType: z.literal('OUTPATIENT_NOTE'), contentSchema: z.literal('RHN.OUTPATIENT_NOTE_TEMPLATE.V1'),
  content: z.object({ ...Object.fromEntries(['chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam',
    'treatmentPlan', 'allergyHistory', 'medicationHistory', 'auxiliaryExaminations', 'healthEducation', 'followUp']
    .map(field => [field, z.string().nullish()])), annotations: z.array(annotation).nullish() }).passthrough() })
const createSchema = z.object({ name: text, scopeType: z.enum(['PERSONAL', 'DEPARTMENT', 'HOSPITAL']),
  diagnoses: z.array(diagnosis), medications: z.array(z.object({ medicationId: text,
    quantity: z.number().finite().positive(), substitutionAllowed: z.boolean(), selfProvided: z.boolean() })),
  services: z.array(z.object({ catalogItemId: text, quantity: z.number().finite().positive() })) })
const fail = (detail: string): never => { throw new Error(`模板未带入：${detail}，请重新加载核对`) }

// Ignore transport differences in absent optional fields and object-key order, never clinical array order.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, field]) => field != null).sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => [key, canonical(field)]))
  return typeof value === 'string' ? value.trim() : value
}
const equal = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
const planContent = (plan: OutpatientPlanTemplate) => ({ name: plan.name, scopeType: plan.scopeType, noteTemplateId: plan.noteTemplateId,
  diagnoses: plan.diagnoses, medications: plan.medications, services: plan.services, tasks: plan.tasks })

export function requirePlanApplicationShape(value: OutpatientPlanTemplate): OutpatientPlanTemplate {
  if (!planSchema.safeParse(value).success) return fail('方案回执缺少有效身份、状态或完整明细')
  if (new Set(value.medications.map(item => item.lineId)).size !== value.medications.length) return fail('方案药品明细身份重复')
  return value
}

export function requireUsedPlanReceipt(receipt: OutpatientPlanTemplate, viewed: OutpatientPlanTemplate,
  selection: OutpatientPlanTemplate): OutpatientPlanTemplate {
  requirePlanApplicationShape(receipt); requirePlanApplicationShape(viewed); requirePlanApplicationShape(selection)
  if (receipt.id !== viewed.id || receipt.revision < viewed.revision || selection.id !== viewed.id
    || !equal(planContent(receipt), planContent(viewed))) return fail('方案已变化或回执与所选模板不一致')
  function selectedRows<T>(original: T[], current: T[], selected: T[]): T[] {
    const remaining = original.map((item, index) => ({ item, index }))
    return selected.map(item => {
      const at = remaining.findIndex(value => equal(value.item, item))
      if (at < 0) return fail('勾选明细不在本次方案中')
      const [{ index }] = remaining.splice(at, 1)
      return current[index]
    })
  }
  return { ...receipt, diagnoses: selectedRows(viewed.diagnoses, receipt.diagnoses, selection.diagnoses),
    medications: selectedRows(viewed.medications, receipt.medications, selection.medications),
    services: selectedRows(viewed.services, receipt.services, selection.services) }
}

export function requireUsedNoteReceipt(receipt: OutpatientNoteTemplate, viewed: OutpatientNoteTemplate): OutpatientNoteTemplate {
  if (!noteSchema.safeParse(receipt).success || !noteSchema.safeParse(viewed).success
    || receipt.id !== viewed.id || receipt.revision < viewed.revision || receipt.name !== viewed.name
    || receipt.scopeType !== viewed.scopeType || receipt.specialtyCode !== viewed.specialtyCode
    || !equal(receipt.content, viewed.content)) return fail('病历模板已变化或回执不完整')
  return receipt
}

export function requireNoteTemplateShape(value: OutpatientNoteTemplate): OutpatientNoteTemplate {
  if (!noteSchema.safeParse(value).success || !Number.isSafeInteger(value.sortOrder)
    || !Number.isSafeInteger(value.useCount) || value.useCount < 0) return fail('病历模板资料不完整')
  return value
}

export function requireNoteTemplateList(value: OutpatientNoteTemplate[], specialtyCode: string): OutpatientNoteTemplate[] {
  if (!Array.isArray(value)) return fail('病历模板目录未返回完整列表')
  value.forEach(requireNoteTemplateShape)
  if (new Set(value.map(item => item.id)).size !== value.length || value.some(item => item.specialtyCode !== specialtyCode)) {
    return fail('病历模板目录存在重复身份或专科不符')
  }
  return value
}

export function requireCreatedNoteReceipt(receipt: OutpatientNoteTemplate, input: SaveOutpatientNoteTemplateInput): OutpatientNoteTemplate {
  return requireSavedNoteReceipt(receipt, input)
}

export function requireSavedNoteReceipt(receipt: OutpatientNoteTemplate, input: SaveOutpatientNoteTemplateInput,
  previous?: OutpatientNoteTemplate | null): OutpatientNoteTemplate {
  if (!noteSchema.safeParse(receipt).success || !Number.isSafeInteger(receipt.sortOrder)
    || !Number.isSafeInteger(receipt.useCount) || (previous
      ? receipt.id !== previous.id || receipt.revision <= previous.revision || receipt.useCount < previous.useCount
      : receipt.useCount !== 0) || receipt.scopeType !== input.scopeType
    || receipt.name !== input.name || !equal(receipt.description, input.description)
    || receipt.specialtyCode !== input.specialtyCode || receipt.sortOrder !== input.sortOrder
    || !equal({ ...receipt.content, annotations: receipt.content.annotations ?? [] },
      { ...input.content, annotations: input.content.annotations ?? [] })) {
    throw new Error('病历模板保存未确认：回执缺少有效身份或与提交内容不一致，请先查询模板核实，勿重复创建。')
  }
  return receipt
}

export function requireCreatedPlanReceipt(receipt: OutpatientPlanTemplate, input: SaveOutpatientPlanTemplateInput): OutpatientPlanTemplate {
  requirePlanCreationInput(input)
  requirePlanApplicationShape(receipt)
  if (receipt.scopeType !== input.scopeType || receipt.name !== input.name.trim()
    || (input.sourceType != null && receipt.sourceType !== input.sourceType)
    || (receipt.templateKind ?? 'PROTOCOL') !== (input.templateKind ?? 'PROTOCOL')
    || !equal(receipt.noteTemplateId, input.noteTemplateId)) return fail('保存的方案与本次请求不一致')
  function matches(inputRows: object[], actualRows: object[], fields: string[]) {
    return inputRows.length === actualRows.length && inputRows.every((row, index) =>
      Object.entries(row).filter(([key, value]) => fields.includes(key) && value != null).every(([key, value]) =>
        equal(value, (actualRows[index] as Record<string, unknown>)[key])))
  }
  if (!matches(input.diagnoses, receipt.diagnoses, ['codeSystem', 'diagnosisDomain', 'code', 'display', 'type'])
    || !matches(input.medications, receipt.medications, ['medicationId', 'catalogItemId', 'packageId', 'doseValue', 'doseUnit',
      'routeCode', 'frequencyCode', 'durationValue', 'durationUnit', 'quantity', 'quantityUnit', 'substitutionAllowed',
      'selfProvided', 'medicationInstruction', 'priceType', 'pricingRequired', 'reason', 'defaultSelected'])
    || !matches(input.services, receipt.services, ['catalogItemId', 'quantity', 'unitCode', 'priceType', 'pricingRequired',
      'reason', 'clinicalDescription', 'performerOrganizationId', 'performerDepartmentId', 'defaultSelected', 'executionDepartmentId'])
    || (input.tasks && !equal(input.tasks, receipt.tasks))) {
    return fail('保存回执缺少所选明细或改变了请求内容')
  }
  return receipt
}

export function requirePlanCreationInput(input: SaveOutpatientPlanTemplateInput): SaveOutpatientPlanTemplateInput {
  if (!createSchema.safeParse(input).success) return fail('所选方案缺少药品、项目、数量或明确的自备与替代标记')
  return input
}

export function requireNoTemplateOrderConflicts(plan: OutpatientPlanTemplate, medications: MedicationPlanDraft[], services: ServicePlanDraft[]) {
  const medicationKey = (item: { medicationId?: string; catalogItemId?: string; routeCode?: string; frequencyCode?: string }) =>
    [item.medicationId ?? '', item.catalogItemId ?? '', item.routeCode ?? '', item.frequencyCode ?? ''].join('|')
  const keys = new Set(medications.map(item => medicationKey(item.request)))
  const serviceIds = new Set(services.map(item => item.catalogItemId))
  if (plan.medications.some(item => keys.has(medicationKey(item))) || plan.services.some(item => serviceIds.has(item.catalogItemId))) {
    return fail('所选医嘱与当前草稿重复，本次整批未带入')
  }
}

const apiScopes = new WeakMap<object, number>()
let nextApiScope = 0
export function templateApiScope(api: object): number {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  return apiScopes.get(api)!
}

export interface SkippedTemplateItem { label: string; reason: string }
export interface TemplateApplicationOutcome {
  /** 模板或组套名称 */
  source: string
  /** 实际带入数量（诊断为去重后的新增数，病历为实际改变的段落数）。 */
  applied: { diagnoses?: number; medications?: number; services?: number; noteFields?: number }
  skipped: SkippedTemplateItem[]
}

/**
 * 统一带入回执：已带入 N 项，跳过 M 项（原因）。
 * changed 表示草稿确实发生变化；全部跳过时 changed 为 false，调用方应作为未完成提示展示。
 */
export function describeTemplateApplication({ source, applied, skipped }: TemplateApplicationOutcome): { message: string; changed: boolean } {
  const parts = [['诊断', applied.diagnoses], ['药品', applied.medications], ['诊疗项目', applied.services], ['病历段落', applied.noteFields]]
    .filter((part): part is [string, number] => typeof part[1] === 'number' && part[1] > 0)
  const total = parts.reduce((sum, [, count]) => sum + count, 0)
  const detail = parts.map(([name, count]) => `${name} ${count}`).join('、')
  const reasons = skipped.slice(0, 3).map(item => `${item.label}：${item.reason}`).join('；') + (skipped.length > 3 ? '等' : '')
  if (!total && !skipped.length) return { message: '所选内容已在当前草稿中，未新增内容。', changed: false }
  if (!total) return { message: `“${source}”未带入任何内容，跳过 ${skipped.length} 项（${reasons}）。`, changed: false }
  return { changed: true, message: `已从“${source}”带入 ${total} 项（${detail}）${skipped.length
    ? `，跳过 ${skipped.length} 项（${reasons}）` : ''}，请核对后保存和开立。` }
}
