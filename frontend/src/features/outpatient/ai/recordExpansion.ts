import type { ClinicalAiDraftContext, ClinicalAiRecordDraft } from '../../../shared/api/clinicalAiApi'
import { aiRecordDraftFields, aiRecordDraftValue, isAiVitalField, type AiRecordDraftField } from './aiDraftAdapter'

/** Record sections the chief-complaint expansion may fill; the server returns the same scope. */
export const recordExpansionSections = ['presentIllness', 'medicalHistory', 'allergyHistory', 'physicalExam'] as const

/** A "short" chief complaint; longer text is already a narrative and is not offered for expansion. */
export const RECORD_EXPANSION_MAX_CHIEF_COMPLAINT = 60

type ExpansionContext = Pick<ClinicalAiDraftContext, AiRecordDraftField>

function filled(context: ExpansionContext, field: AiRecordDraftField) {
  const value = context[field]
  return isAiVitalField(field) ? value != null : typeof value === 'string' && value.trim() !== ''
}

/** Offered only for a short chief complaint while at least one target section is still empty. */
export function canExpandRecord(context: ExpansionContext) {
  const chiefComplaint = context.chiefComplaint?.trim() ?? ''
  return chiefComplaint.length > 0 && chiefComplaint.length <= RECORD_EXPANSION_MAX_CHIEF_COMPLAINT
    && recordExpansionSections.some((field) => !filled(context, field))
}

/**
 * Fields the expansion writes back: the normalized chief complaint (the expansion source), plus target sections
 * and vitals that are still empty. Doctor-written sections and measured vitals are never replaced.
 */
export function recordExpansionTargets(context: ExpansionContext): AiRecordDraftField[] {
  return aiRecordDraftFields.filter((field) => field === 'chiefComplaint'
    || (recordExpansionSections as readonly string[]).includes(field) && !filled(context, field)
    || isAiVitalField(field) && !filled(context, field))
}

/** Projects an expansion draft onto its writable targets, keeping only marks that belong to those fields. */
export function pickRecordExpansion(draft: ClinicalAiRecordDraft, targets: readonly AiRecordDraftField[]): ClinicalAiRecordDraft {
  const picked: ClinicalAiRecordDraft = {}
  for (const field of targets) {
    const value = aiRecordDraftValue(field, draft[field])
    if (value !== undefined) Object.assign(picked, { [field]: value })
  }
  const annotations = draft.annotations?.filter((mark) => mark.field in picked)
  return annotations?.length ? { ...picked, annotations } : picked
}
