import { z } from 'zod'
import type { ClinicalAiPlanPreflight } from '../../../shared/api/clinicalAiApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'

const text = z.string().trim().min(1)
const status = z.enum(['READY', 'WARNING', 'BLOCKED'])
const schema = z.object({ templateId: text, templateRevision: z.number().int().nonnegative(), status,
  blockingCount: z.number().int().nonnegative(), warningCount: z.number().int().nonnegative(),
  checkedAt: z.iso.datetime({ offset: true }),
  drugInteractions: z.object({ status: z.literal('NOT_EVALUATED'), message: text }),
  contraindications: z.object({ status: z.literal('NOT_EVALUATED'), message: text }),
  medications: z.array(z.object({ lineId: text, medicationId: text, catalogItemId: text.nullish(), packageId: text.nullish(),
    medicationCode: text, medicationName: text, status, checks: z.array(z.object({ code: text,
      status: z.enum(['PASS', 'WARNING', 'BLOCKED', 'NOT_EVALUATED']), message: text })).min(1) })),
})

export function requirePlanPreflight(value: ClinicalAiPlanPreflight, plan: OutpatientPlanTemplate): ClinicalAiPlanPreflight {
  const fail = (): never => { throw new Error('方案预检回执不完整或与所选明细不一致，请重新核对。') }
  if (!schema.safeParse(value).success || value.templateId !== plan.id || value.templateRevision !== plan.revision
    || value.medications.length !== plan.medications.length) return fail()
  const rows = new Map(plan.medications.map(item => [item.lineId, item]))
  let blocking = 0, warnings = 0
  for (const item of value.medications) {
    const original = rows.get(item.lineId)
    if (!original || item.medicationId !== original.medicationId || item.medicationCode !== original.medicationCode
      || (item.catalogItemId ?? null) !== (original.catalogItemId ?? null) || (item.packageId ?? null) !== (original.packageId ?? null)
      || new Set(item.checks.map(check => check.code)).size !== item.checks.length) return fail()
    const codes = new Set(item.checks.map(check => check.code))
    if (['PRODUCT_PACKAGE', 'DOSE', 'ROUTE', 'FREQUENCY', 'DURATION', 'QUANTITY', 'INVENTORY'].some(code => !codes.has(code))
      || (!codes.has('ALLERGY_REVIEW') && !codes.has('ALLERGY_MATCH'))) return fail()
    rows.delete(item.lineId)
    const blocked = item.checks.filter(check => check.status === 'BLOCKED').length
    const warned = item.checks.filter(check => check.status === 'WARNING' || check.status === 'NOT_EVALUATED').length
    if (item.status !== (blocked ? 'BLOCKED' : warned ? 'WARNING' : 'READY')) return fail()
    blocking += blocked; warnings += warned
  }
  // Both explicitly unevaluated safety boundaries count as warnings for medication plans.
  if (value.medications.length) warnings += [value.drugInteractions, value.contraindications]
    .filter(boundary => boundary.status === 'NOT_EVALUATED').length
  if (value.blockingCount !== blocking || value.warningCount !== warnings
    || value.status !== (blocking ? 'BLOCKED' : warnings ? 'WARNING' : 'READY')) return fail()
  return value
}
