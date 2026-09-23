import type {
  ClinicalAiDraftContext, ClinicalAiDraftInput, ClinicalAiRecordDraft, ClinicalAiSuggestion, ClinicalAiVitalSigns,
} from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import { VITAL_HARD_LIMITS } from '../../../shared/validation/businessValidation'

export interface ClinicalAiDraftRequest {
  requestId: string
  sourceSuggestionId: string
  encounterId: string
  residentId: string
  contextFingerprint: string
  sourceLabel: string
  recordDraft?: ClinicalAiRecordDraft
  overwriteRecord?: boolean
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
    heightCm: value.heightCm, weightKg: value.weightKg,
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
  for (const field of vitalDraftFields) {
    const suggestion = patch[field]
    if (!validAiVital(field, suggestion) || (!overwrite && current[field] != null)) continue
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

export const vitalDraftFields = [
  'temperature', 'pulseRate', 'respiratoryRate', 'systolic', 'diastolic', 'oxygenSaturation', 'heightCm', 'weightKg',
] as const
export const aiRecordDraftFields = [...recordDraftFields, ...vitalDraftFields] as const
export type AiRecordDraftField = (typeof aiRecordDraftFields)[number]
export type AiVitalDraftField = keyof ClinicalAiVitalSigns

export const aiVitalDefinitions = {
  temperature: { ...VITAL_HARD_LIMITS.temperature, unit: '℃', step: 0.1 },
  pulseRate: { ...VITAL_HARD_LIMITS.pulse, unit: '次/分', step: 1 },
  respiratoryRate: { ...VITAL_HARD_LIMITS.respiratoryRate, unit: '次/分', step: 1 },
  systolic: { ...VITAL_HARD_LIMITS.systolicPressure, unit: 'mmHg', step: 1 },
  diastolic: { ...VITAL_HARD_LIMITS.diastolicPressure, unit: 'mmHg', step: 1 },
  oxygenSaturation: { ...VITAL_HARD_LIMITS.oxygenSaturation, unit: '%', step: 1 },
  heightCm: { ...VITAL_HARD_LIMITS.height, unit: 'cm', step: 0.1 },
  weightKg: { ...VITAL_HARD_LIMITS.weight, unit: 'kg', step: 0.1 },
} as const

export function isAiVitalField(field: AiRecordDraftField): field is AiVitalDraftField {
  return (vitalDraftFields as readonly string[]).includes(field)
}

export function validAiVital(field: AiVitalDraftField, value: unknown): value is number {
  const rule = aiVitalDefinitions[field]
  return typeof value === 'number' && Number.isFinite(value) && value >= rule.minimum && value <= rule.maximum
    && (rule.step !== 1 || Number.isInteger(value))
}

export function aiRecordDraftValue(field: AiRecordDraftField, value: unknown): string | number | undefined {
  return isAiVitalField(field) ? validAiVital(field, value) ? value : undefined
    : typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function formatAiRecordDraftValue(field: AiRecordDraftField, value: unknown) {
  const valid = aiRecordDraftValue(field, value)
  return valid === undefined ? '' : `${valid}${isAiVitalField(field) ? ` ${aiVitalDefinitions[field].unit}` : ''}`
}

export const recordDraftFieldLabels: Record<AiRecordDraftField, string> = {
  chiefComplaint: '主诉', presentIllness: '现病史', medicalHistory: '既往史',
  physicalExam: '查体所见', treatmentPlan: '诊疗计划',
  temperature: '体温', pulseRate: '脉搏', respiratoryRate: '呼吸', systolic: '收缩压', diastolic: '舒张压',
  oxygenSaturation: '血氧', heightCm: '身高', weightKg: '体重',
}
