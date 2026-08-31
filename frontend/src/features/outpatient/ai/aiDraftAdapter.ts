import type {
  ClinicalAiDraftContext, ClinicalAiDraftInput, ClinicalAiRecordDraft, ClinicalAiSuggestion,
} from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'

export interface ClinicalAiDraftRequest {
  requestId: string
  sourceSuggestionId: string
  encounterId: string
  residentId: string
  contextFingerprint: string
  sourceLabel: string
  recordDraft?: ClinicalAiRecordDraft
  diagnoses?: DiagnosisInput[]
  planTemplate?: OutpatientPlanTemplate
  allergyReviewConfirmed?: boolean
  allergyOverrideReason?: string
}

export function clinicalAiContextFingerprint(value: ClinicalAiDraftContext) {
  return stableClinicalAiFingerprint('ctx', {
    ...value,
    diagnoses: [...value.diagnoses]
      .map(({ code, display, type }) => ({ code, display, type }))
      .sort((left, right) => left.code.localeCompare(right.code)),
  })
}

export function stableClinicalAiFingerprint(prefix: string, value: unknown) {
  const normalized = JSON.stringify(stableValue(value)) ?? 'undefined'
  let h1 = 1779033703; let h2 = 3144134277; let h3 = 1013904242; let h4 = 2773480762
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index)
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  const hash = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((item) => (item >>> 0).toString(16).padStart(8, '0')).join('')
  return `${prefix}-v2-${hash}`
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]))
}

export function clinicalAiDraftInput(value: ClinicalAiDraftContext): ClinicalAiDraftInput {
  return {
    chiefComplaint: value.chiefComplaint, presentIllness: value.presentIllness,
    medicalHistory: value.medicalHistory, physicalExam: value.physicalExam,
    treatmentPlan: value.treatmentPlan, systolic: value.systolic, diastolic: value.diastolic,
    temperature: value.temperature, pulseRate: value.pulseRate,
    respiratoryRate: value.respiratoryRate, oxygenSaturation: value.oxygenSaturation,
    diagnoses: value.diagnoses,
  }
}

export function mergeAiRecordDraft<T extends ClinicalAiRecordDraft>(current: T,
  patch: ClinicalAiRecordDraft, overwrite = false): T {
  const next = { ...current }
  for (const field of recordDraftFields) {
    const suggestion = patch[field]?.trim()
    if (!suggestion || (!overwrite && current[field]?.trim())) continue
    Object.assign(next, { [field]: suggestion })
  }
  return next
}

export function mergeAiDiagnoses(current: DiagnosisInput[], suggestions: DiagnosisInput[]) {
  const existing = new Set(current.map((item) => item.code.trim().toUpperCase()))
  let hasPrimary = current.some((item) => item.type === 'PRIMARY')
  const additions: DiagnosisInput[] = []
  for (const suggestion of suggestions) {
    const code = suggestion.code.trim()
    const display = suggestion.display.trim()
    if (!code || !display || existing.has(code.toUpperCase())) continue
    const type = suggestion.type === 'PRIMARY' && !hasPrimary ? 'PRIMARY' : 'SECONDARY'
    additions.push({ code, display, type })
    existing.add(code.toUpperCase())
    hasPrimary ||= type === 'PRIMARY'
  }
  return [...current, ...additions]
}

export function canApplyClinicalAiSuggestion(suggestion: ClinicalAiSuggestion,
  currentContext: ClinicalAiDraftContext) {
  return ['GENERATED', 'PARTIALLY_ADOPTED'].includes(suggestion.status)
    && !currentContext.busy && currentContext.allergyState !== 'LOADING'
    && new Date(suggestion.expiresAt).getTime() > Date.now()
    && suggestion.clientContextFingerprint === clinicalAiContextFingerprint(currentContext)
}

export const recordDraftFields = [
  'chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam', 'treatmentPlan',
] as const

export const recordDraftFieldLabels: Record<(typeof recordDraftFields)[number], string> = {
  chiefComplaint: '主诉', presentIllness: '现病史', medicalHistory: '既往史',
  physicalExam: '查体所见', treatmentPlan: '诊疗计划',
}
