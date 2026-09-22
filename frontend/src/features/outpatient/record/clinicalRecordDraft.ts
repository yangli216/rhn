import { z } from 'zod'
import type { DiagnosisInput, ClinicalRecordInput } from '../../../shared/api/encountersApi'
import type { OutpatientNoteForm } from '../../../shared/api/outpatientNoteFormsApi'
import { VITAL_HARD_LIMITS } from '../../../shared/validation/businessValidation'

function vitalNumber(label: string, limits: { minimum: number; maximum: number }, integer: boolean) {
  const rangeMessage = `${label}请输入 ${limits.minimum}～${limits.maximum} 之间的数值`
  const number = z.number({ error: (issue) => issue.input === undefined
    ? `请填写${label}` : `${label}请输入有效数字` }).min(limits.minimum, rangeMessage).max(limits.maximum, rangeMessage)
  return integer ? number.int(`${label}请输入整数`) : number
}

export const createRecordSchema = (bloodPressureRequired: boolean) => z.object({
  chiefComplaint: z.string().trim().min(1, '请输入主诉').max(1000),
  presentIllness: z.string().trim().max(4000),
  medicalHistory: z.string().trim().max(4000),
  physicalExam: z.string().trim().max(4000),
  treatmentPlan: z.string().trim().max(4000),
  systolic: vitalNumber('收缩压', VITAL_HARD_LIMITS.systolicPressure, true).optional(),
  diastolic: vitalNumber('舒张压', VITAL_HARD_LIMITS.diastolicPressure, true).optional(),
  temperature: vitalNumber('体温', VITAL_HARD_LIMITS.temperature, false).optional(),
  pulseRate: vitalNumber('脉搏', VITAL_HARD_LIMITS.pulse, true).optional(),
  respiratoryRate: vitalNumber('呼吸', VITAL_HARD_LIMITS.respiratoryRate, true).optional(),
  heightCm: vitalNumber('身高', VITAL_HARD_LIMITS.height, false).optional(),
  weightKg: vitalNumber('体重', VITAL_HARD_LIMITS.weight, false).optional(),
  oxygenSaturation: vitalNumber('血氧', VITAL_HARD_LIMITS.oxygenSaturation, true).optional(),
}).superRefine((value, context) => {
  if (bloodPressureRequired || value.systolic !== undefined || value.diastolic !== undefined) {
    if (value.systolic === undefined) context.addIssue({ code: 'custom', path: ['systolic'], message: '请填写收缩压' })
    if (value.diastolic === undefined) context.addIssue({ code: 'custom', path: ['diastolic'], message: '请填写舒张压' })
  }
  if (value.systolic !== undefined && value.diastolic !== undefined && value.systolic <= value.diastolic) {
    context.addIssue({ code: 'custom', path: ['systolic'], message: '收缩压必须大于舒张压' })
  }
})
export type RecordForm = z.infer<ReturnType<typeof createRecordSchema>>

export function structuredFormSignature(formVersionId: string, values: Record<string, unknown>) {
  return JSON.stringify({ formVersionId, values: Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== '')
      .sort(([left], [right]) => left.localeCompare(right)),
  ) })
}

export function validateStructuredForm(form: OutpatientNoteForm | undefined, values: Record<string, unknown>) {
  const errors: Record<string, string> = {}
  form?.sections.forEach((section) => section.fields.forEach((field) => {
    const value = values[field.code]
    const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim())
    if (field.required && empty) errors[field.code] = `请填写${field.label}`
    if (!empty && typeof value === 'string' && field.maxLength && value.trim().length > field.maxLength) {
      errors[field.code] = `${field.label}不能超过 ${field.maxLength} 个字符`
    }
    if (!empty && field.type === 'NUMBER' && typeof value === 'number') {
      if (field.minimum != null && value < field.minimum) errors[field.code] = `${field.label}不能小于 ${field.minimum}`
      if (field.maximum != null && value > field.maximum) errors[field.code] = `${field.label}不能大于 ${field.maximum}`
    }
  }))
  return errors
}


export function diagnosisDraftSignature(values: DiagnosisInput[]) {
  return values.map((value) => `${value.conceptId ?? ''}|${value.diagnosisDomain ?? ''}|${value.code}|${value.display}|${value.type}`)
    .join('\n')
}

export function diagnosisKey(value: DiagnosisInput) {
  return String(value.conceptId || `${value.diagnosisDomain}|${value.code}`)
}

export function normalizeDiagnosisOrder(values: DiagnosisInput[]) {
  return values.map((value, index) => ({
    ...value,
    type: index === 0 ? 'PRIMARY' as const : 'SECONDARY' as const,
  }))
}

export function moveDiagnosis(values: DiagnosisInput[], sourceKey: string, targetKey: string) {
  const sourceIndex = values.findIndex((value) => diagnosisKey(value) === sourceKey)
  const targetIndex = values.findIndex((value) => diagnosisKey(value) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return normalizeDiagnosisOrder(values)
  const next = [...values]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return normalizeDiagnosisOrder(next)
}


export function clinicalRecordContent(form: RecordForm, diagnoses: DiagnosisInput[], noteFormId: string,
  structuredValues: Record<string, unknown>): Omit<ClinicalRecordInput, 'commandCode'> {
  return {
    chiefComplaint: form.chiefComplaint, presentIllness: form.presentIllness, medicalHistory: form.medicalHistory,
    physicalExam: form.physicalExam, treatmentPlan: form.treatmentPlan,
    systolic: form.systolic, diastolic: form.diastolic, temperature: form.temperature,
    pulseRate: form.pulseRate, respiratoryRate: form.respiratoryRate, heightCm: form.heightCm,
    weightKg: form.weightKg, oxygenSaturation: form.oxygenSaturation,
    noteFormVersionId: noteFormId || undefined,
    structuredData: noteFormId ? structuredValues : undefined,
    diagnoses: diagnoses.map(({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type }) => ({
      conceptId, diagnosisDomain, diagnosisGroupId, code, display, type,
    })),
  }
}
