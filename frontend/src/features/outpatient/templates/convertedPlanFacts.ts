import { z } from 'zod'
import type { OutpatientPlanTask, OutpatientPlanTemplateScope, PlanTextReviewItem, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import { requirePlanCreationInput } from './templateApplicationReceipt'

const text = z.string().trim().min(1)
const optionalText = text.nullish()
const task = z.object({ kind: z.enum(['DIAGNOSIS', 'MEDICATION', 'LABORATORY', 'EXAMINATION', 'EDUCATION', 'FOLLOW_UP', 'CONDITION']),
  text, origin: z.enum(['EXPLICIT', 'SUGGESTED']), status: z.enum(['MATCHED', 'NEEDS_REVIEW', 'UNMATCHED']),
  sourceQuote: z.string().nullish(), details: z.string().max(500).nullish() })
const resultShape = z.object({ name: text, scopeType: z.enum(['PERSONAL', 'DEPARTMENT', 'HOSPITAL']),
  diagnoses: z.array(z.object({ code: text, display: text, type: z.enum(['PRIMARY', 'SECONDARY']),
    codeSystem: optionalText, diagnosisDomain: z.enum(['WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME']).nullish() })),
  medications: z.array(z.object({ medicationId: text, medicationName: text, quantityUnit: text,
    doseValue: z.number().finite().positive().nullish(), doseUnit: optionalText, routeCode: optionalText, frequencyCode: optionalText,
    durationValue: z.number().finite().positive().nullish(), durationUnit: optionalText })),
  services: z.array(z.object({ catalogItemId: text, itemCode: text, itemName: text, unitCode: text,
    serviceType: z.enum(['LABORATORY', 'EXAMINATION', 'TREATMENT', 'OTHER']) })), tasks: z.array(task) })
const fail = (): never => { throw new Error('目录转换结果未确认：返回内容、作用域或匹配记录不完整，请保留原方案并重新匹配。') }
const key = (item: Pick<OutpatientPlanTask, 'kind' | 'text' | 'origin'>) => JSON.stringify([item.kind, item.text, item.origin])

export function confirmConvertedPlan(value: SaveOutpatientPlanTemplateInput, reviewItems: PlanTextReviewItem[],
  expectedName: string, expectedScope: OutpatientPlanTemplateScope): SaveOutpatientPlanTemplateInput {
  if (!resultShape.safeParse(value).success || value.name !== expectedName.trim() || value.scopeType !== expectedScope
    || !z.array(task.omit({ status: true })).safeParse(reviewItems).success || new Set(reviewItems.map(key)).size !== reviewItems.length) fail()
  try { requirePlanCreationInput(value) } catch { fail() }
  const tasks = value.tasks!
  if (new Set(tasks.map(key)).size !== tasks.length) fail()
  if (tasks.some(item => item.status === 'MATCHED' && (
    item.kind === 'DIAGNOSIS' && !value.diagnoses.length
    || item.kind === 'MEDICATION' && !value.medications.length
    || (item.kind === 'LABORATORY' || item.kind === 'EXAMINATION') && !value.services.some(service => service.serviceType === item.kind)))) fail()
  if (value.medications.some(item => item.doseValue != null && !item.doseUnit || item.durationValue != null && !item.durationUnit)) fail()

  // Task status comes from the conversion response, never a substring in clinical prose.
  const records: OutpatientPlanTask[] = reviewItems.map(item => {
    const matched = tasks.find(candidate => key(candidate) === key(item))
    const original = item.details || '', returned = matched?.details || ''
    const details = (returned.includes(original) ? returned : original.includes(returned) ? original : `${original}\n${returned}`) || undefined
    if (details && details.length > 500) throw new Error('原方案说明与目录核对说明合并后超过 500 字，请精简原说明后重新匹配；本次未丢弃原内容。')
    return { ...item, details, status: matched?.status ??
      (['CONDITION', 'EDUCATION', 'FOLLOW_UP'].includes(item.kind) ? 'NEEDS_REVIEW' : 'UNMATCHED') }
  })
  const known = new Set(records.map(key))
  return { ...value, tasks: [...records, ...tasks.filter(item => !known.has(key(item)))] }
}
