import { z } from 'zod'
import type { OutpatientNoteTemplateContent, SaveOutpatientNoteTemplateInput } from '../../../shared/api/outpatientNoteTemplatesApi'
import { recordTextFields } from '../../../shared/api/recordAnnotations'
import { anchorAnnotations } from '../record/recordAnnotations'

const annotation = z.object({ field: z.enum(recordTextFields), text: z.string().min(1).max(4000),
  start: z.number().int().nonnegative().nullish(), source: z.enum(['TEMPLATE', 'VOICE', 'CONTEXT', 'DOCTOR', 'AI']),
  kind: z.enum(['PRESET', 'VARIABLE', 'IMPORTANT', 'FACT', 'CONFLICT']), binding: z.string().max(120).nullish(),
  label: z.string().max(100).nullish(), sourceQuote: z.string().max(1000).nullish(), reason: z.string().max(500).nullish(),
  confirmed: z.boolean().nullish() })

export function prepareNoteTemplateSave(input: SaveOutpatientNoteTemplateInput): SaveOutpatientNoteTemplateInput {
  const fail = (): never => { throw new Error('病历模板未保存：名称、范围、正文或来源标记不完整，请核实后重试。') }
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100
    || !['PERSONAL', 'DEPARTMENT'].includes(input.scopeType) || typeof input.specialtyCode !== 'string'
    || !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.specialtyCode)
    || input.description != null && (typeof input.description !== 'string' || input.description.trim().length > 500)
    || input.sortOrder != null && !Number.isSafeInteger(input.sortOrder)
    || !input.content || typeof input.content !== 'object' || Array.isArray(input.content)) return fail()
  const content: OutpatientNoteTemplateContent = {}
  for (const field of recordTextFields) {
    const value = input.content[field]
    if (value == null) continue
    if (typeof value !== 'string' || value.trim().length > (field === 'chiefComplaint' ? 1000 : 4000)) return fail()
    if (value.trim()) content[field] = value.trim()
  }
  if (!Object.keys(content).length) return fail()
  const annotations = input.content.annotations ?? []
  if (!z.array(annotation).max(200).safeParse(annotations).success) return fail()
  const original = anchorAnnotations(input.content, annotations)
  if (original.length !== annotations.length) return fail()
  const rebased = original.map(item => {
    const raw = input.content[item.field]!, leading = raw.length - raw.trimStart().length
    const start = Math.max(item.start!, leading), end = Math.min(item.start! + item.text.length, leading + (content[item.field]?.length ?? 0))
    if (end <= start) return fail()
    return { ...item, text: raw.slice(start, end), start: start - leading, confirmed: false }
  })
  content.annotations = anchorAnnotations(content, rebased)
  if (content.annotations.length !== annotations.length) return fail()
  // Backend template storage deliberately excludes treatmentPlan and patient-specific non-text fields.
  return { scopeType: input.scopeType, name: input.name.trim(), description: input.description?.trim() || undefined,
    specialtyCode: input.specialtyCode, sortOrder: input.sortOrder ?? 0, content }
}
