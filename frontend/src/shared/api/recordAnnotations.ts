/** Sidecar metadata. Never interpolate these objects into printed/copied clinical text. */
export const recordTextFields = ['chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam',
  'allergyHistory', 'medicationHistory', 'auxiliaryExaminations', 'healthEducation', 'followUp'] as const
export type RecordTextField = typeof recordTextFields[number]
export type RecordText = Partial<Record<RecordTextField, string>>
export interface RecordAnnotation {
  field: RecordTextField
  text: string
  /** UTF-16 offset. Missing offsets are resolved only for unique exact quotes from fresh model output. */
  start?: number
  source: 'TEMPLATE' | 'VOICE' | 'CONTEXT' | 'DOCTOR' | 'AI'
  kind: 'PRESET' | 'VARIABLE' | 'IMPORTANT' | 'FACT' | 'CONFLICT'
  binding?: string
  label?: string
  sourceQuote?: string
  reason?: string
  confirmed?: boolean
}
