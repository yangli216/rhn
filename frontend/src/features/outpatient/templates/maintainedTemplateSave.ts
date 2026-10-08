import { z } from 'zod'
import type { RhnApi } from '../../../shared/rhnApi'
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent, SaveOutpatientNoteTemplateInput } from '../../../shared/api/outpatientNoteTemplatesApi'
import type { OutpatientPlanTemplate, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import { prepareNoteTemplateSave } from './noteTemplateSaveInput'
import { requireCreatedPlanReceipt, requireNoteTemplateShape, requirePlanApplicationShape, requirePlanCreationInput, requireSavedNoteReceipt, templateApiScope } from './templateApplicationReceipt'
import { recordTextFields } from '../../../shared/api/recordAnnotations'

type NoteWriter = { outpatientNoteTemplates: Pick<RhnApi['outpatientNoteTemplates'], 'create' | 'update'> }
type PlanWriter = { outpatientPlanTemplates: Pick<RhnApi['outpatientPlanTemplates'], 'create' | 'update'> }

const text = z.string().trim().min(1)
const taskSchema = z.object({ kind: z.enum(['DIAGNOSIS', 'MEDICATION', 'LABORATORY', 'EXAMINATION', 'EDUCATION', 'FOLLOW_UP', 'CONDITION']),
  text, origin: z.enum(['EXPLICIT', 'SUGGESTED']), status: z.enum(['MATCHED', 'NEEDS_REVIEW', 'UNMATCHED']),
  sourceQuote: z.string().nullish(), details: z.string().nullish() })
const optionalPositive = (value: unknown) => value == null || typeof value === 'number' && Number.isFinite(value) && value > 0
function requirePlanTarget(previous?: OutpatientPlanTemplate | null) {
  if (!previous) return
  requirePlanApplicationShape(previous)
  if (!Number.isSafeInteger(previous.revision) || !Number.isSafeInteger(previous.sortOrder)
    || !Number.isSafeInteger(previous.useCount) || previous.useCount < 0) throw new Error('原方案版本或使用记录尚未确认，请重新加载。')
}
function sameOptionalFields(expected: object, actual: object, fields: string[]) {
  const normalize = (value: unknown) => typeof value === 'string' ? value.trim() || null : value ?? null
  return fields.every(field => normalize((expected as Record<string, unknown>)[field]) === normalize((actual as Record<string, unknown>)[field]))
}

export function prepareMaintainedPlanSave(input: SaveOutpatientPlanTemplateInput): SaveOutpatientPlanTemplateInput {
  requirePlanCreationInput(input)
  if (!z.object({ name: text.max(100), description: z.string().max(500).nullish(),
    guidelineReference: z.string().nullish(), sourceType: z.enum(['MANUAL', 'AI_INPUT', 'AI_MINED', 'AI_GUIDELINE']).nullish(),
    sortOrder: z.number().int().nullish(), noteTemplateId: text.nullish(), tasks: z.array(taskSchema).nullish() }).safeParse(input).success
    || !input.diagnoses.length && !input.medications.length && !input.services.length && !input.tasks?.length
    || input.medications.some(item => !text.safeParse(item.quantityUnit).success
      || !optionalPositive(item.doseValue) || !optionalPositive(item.durationValue))
    || input.services.some(item => !text.safeParse(item.unitCode).success)) {
    throw new Error('方案未保存：名称、明细、数量单位或任务事实不完整，请核对后重试。')
  }
  return { ...structuredClone(input), name: input.name.trim(), description: input.description?.trim() || undefined,
    guidelineReference: input.guidelineReference?.trim() || undefined, sortOrder: input.sortOrder ?? 0, tasks: input.tasks ?? [] }
}

export async function saveMaintainedNote(api: NoteWriter,
  input: SaveOutpatientNoteTemplateInput, previous?: OutpatientNoteTemplate | null) {
  if (previous) requireNoteTemplateShape(previous)
  const request = prepareNoteTemplateSave(input)
  const receipt = previous
    ? await api.outpatientNoteTemplates.update(previous.id, { ...request, expectedRevision: previous.revision })
    : await api.outpatientNoteTemplates.create(request)
  return requireSavedNoteReceipt(receipt, request, previous)
}

export async function saveMaintainedPlan(api: PlanWriter,
  input: SaveOutpatientPlanTemplateInput, previous?: OutpatientPlanTemplate | null) {
  requirePlanTarget(previous)
  const request = prepareMaintainedPlanSave(input)
  const receipt = previous
    ? await api.outpatientPlanTemplates.update(previous.id, { ...request, expectedRevision: previous.revision })
    : await api.outpatientPlanTemplates.create(request)
  try {
    requireCreatedPlanReceipt(receipt, request)
    if (!Number.isSafeInteger(receipt.useCount) || !Number.isSafeInteger(receipt.sortOrder)
      || (previous ? receipt.id !== previous.id || receipt.revision <= previous.revision || receipt.useCount < previous.useCount
        || receipt.sourceType !== previous.sourceType : receipt.useCount !== 0)
      || (receipt.description?.trim() || undefined) !== request.description
      || (receipt.guidelineReference?.trim() || undefined) !== request.guidelineReference
      || receipt.sortOrder !== request.sortOrder
      || request.medications.some((item, index) => !sameOptionalFields(item, receipt.medications[index],
        ['catalogItemId', 'packageId', 'doseValue', 'doseUnit', 'routeCode', 'frequencyCode', 'durationValue', 'durationUnit', 'medicationInstruction', 'reason']))
      || request.services.some((item, index) => !sameOptionalFields(item, receipt.services[index], ['reason', 'clinicalDescription']))) {
      throw new Error('保存属性、临床内容或版本不一致')
    }
  } catch {
    throw new Error('方案保存未确认：回执与提交内容、身份或版本不一致，请先查询核实，勿重复创建。')
  }
  return receipt
}

export interface NoteSaveCheckpoint { context: string; fingerprint: string; note: OutpatientNoteTemplate }

/** These are two server transactions. Retain a verified note receipt when the plan step fails. */
export async function saveAiMaintainedPlan(api: NoteWriter & PlanWriter,
  input: SaveOutpatientPlanTemplateInput, content: OutpatientNoteTemplateContent,
  previous: OutpatientPlanTemplate | null | undefined, linked: OutpatientNoteTemplate | undefined,
  checkpoint: { current: NoteSaveCheckpoint | null }, isCurrent: () => boolean) {
  requirePlanTarget(previous)
  const request = prepareMaintainedPlanSave(input)
  const context = JSON.stringify([templateApiScope(api), previous?.id ?? 'new', previous?.revision])
  const existing = checkpoint.current?.context === context ? checkpoint.current : null
  if (request.scopeType === 'HOSPITAL') request.noteTemplateId = undefined
  else {
    if (request.noteTemplateId && linked?.id !== request.noteTemplateId && !existing) throw new Error('配套病历模板尚未确认或已不可用，请重新加载核对。')
    if (recordTextFields.some(field => Boolean(content[field]?.trim()))) {
      const noteBefore = existing?.note ?? linked
      const noteInput = prepareNoteTemplateSave({ scopeType: request.scopeType,
        name: noteBefore?.name ?? `${request.name}·病历`.slice(0, 100), description: noteBefore?.description,
        specialtyCode: noteBefore?.specialtyCode ?? 'GENERAL_PRACTICE', sortOrder: noteBefore?.sortOrder ?? 0, content })
      const fingerprint = JSON.stringify(noteInput)
      if (!isCurrent()) throw new Error('保存上下文已变化，请重新核对。')
      if (!existing || existing.fingerprint !== fingerprint) {
        const note = await saveMaintainedNote(api, noteInput, noteBefore)
        if (!isCurrent()) throw new Error('病历模板可能已保存，但当前上下文已变化，未继续保存方案。')
        checkpoint.current = { context, fingerprint, note }
      }
      request.noteTemplateId = checkpoint.current!.note.id
    } else if (request.noteTemplateId || existing) {
      throw new Error('配套病历正文为空，未自动保留旧正文或取消关联，请核对后重试。')
    }
  }
  if (!isCurrent()) throw new Error('保存上下文已变化，未继续保存方案。')
  try { return await saveMaintainedPlan(api, request, previous) }
  catch (cause) {
    if (checkpoint.current?.context === context) throw new Error(`病历模板已保存，方案保存尚未确认；重试将复用已确认的病历模板。${cause instanceof Error ? cause.message : ''}`)
    throw cause
  }
}
