import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { ClinicalRecordInput } from '../../../shared/api/encountersApi'
import { recordTextFields, type RecordAnnotation } from '../../../shared/api/recordAnnotations'
import type { Encounter } from '../../../shared/model'
import { anchorAnnotations } from './recordAnnotations'

type RecordContent = Omit<ClinicalRecordInput, 'commandCode'>
export interface ClinicalRecordTarget {
  encounterId: string
  residentId: string
  organizationId: string
  departmentId: string
  previousDocument?: Pick<ClinicalDocument, 'id' | 'currentVersion'>
}
const vitalFields = ['systolic', 'diastolic', 'temperature', 'pulseRate', 'respiratoryRate',
  'heightCm', 'weightKg', 'oxygenSaturation'] as const

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function requireFact(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`病历保存回执未确认：${detail}。医嘱尚未提交，草稿已保留；远端可能已保存，请核实后重试`)
}
function nullable(value: unknown) { return value == null ? null : value }
function same(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((v, i) => same(v, right[i]))
  if (object(left) && object(right)) {
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]))
  }
  return left === right
}

/** Verify persisted facts, not just a successful HTTP status or matching encounter id. */
export function requireClinicalEncounter(target: ClinicalRecordTarget, input: RecordContent, value: unknown): Encounter {
  requireFact(object(value) && value.id === target.encounterId && value.residentId === target.residentId
    && value.organizationId === target.organizationId && value.departmentId === target.departmentId,
    '就诊、患者或机构科室身份不一致')
  requireFact(value.status === 'IN_PROGRESS' && value.chiefComplaint === input.chiefComplaint.trim()
    && nullable(value.systolic) === nullable(input.systolic) && nullable(value.diastolic) === nullable(input.diastolic),
  '主诉、血压或就诊状态不一致')
  requireFact(Array.isArray(value.diagnoses) && value.diagnoses.length === input.diagnoses.length, '诊断数量不一致')
  value.diagnoses.forEach((diagnosis: unknown, index: number) => {
    const requested = input.diagnoses[index]
    requireFact(object(diagnosis) && diagnosis.type === requested.type
      && nullable(diagnosis.conceptId) === nullable(requested.conceptId)
      && nullable(diagnosis.diagnosisGroupId) === (requested.diagnosisGroupId?.trim() || null), '诊断身份、分组或主次不一致')
    // Directory concepts may canonicalize text and fill identity; explicitly supplied identity must still match.
    requireFact((!requested.codeSystem || diagnosis.systemCode === requested.codeSystem.trim())
      && (!requested.diagnosisDomain || diagnosis.diagnosisDomain === requested.diagnosisDomain)
      && typeof diagnosis.code === 'string' && diagnosis.code.trim()
      && typeof diagnosis.display === 'string' && diagnosis.display.trim(), '诊断编码体系、诊断域或内容未确认')
    if (!requested.conceptId) requireFact(diagnosis.code === requested.code.trim()
      && diagnosis.display === requested.display.trim()
      && nullable(diagnosis.systemCode) === nullable(requested.codeSystem?.trim())
      && nullable(diagnosis.diagnosisDomain) === nullable(requested.diagnosisDomain), '自由录入诊断与提交内容不一致')
  })
  return value as unknown as Encounter
}

export function requireClinicalDocument(target: ClinicalRecordTarget, input: RecordContent,
  encounter: Encounter, values: unknown): ClinicalDocument {
  requireFact(Array.isArray(values) && values.every(object), '文书列表缺失或格式异常')
  const notes = values.filter(value => value.documentType === 'OUTPATIENT_NOTE' && value.instanceKey === 'DEFAULT')
  requireFact(notes.length === 1, '未找到唯一的本次门诊病历')
  const note = notes[0]
  requireFact(typeof note.id === 'string' && note.id.trim() && note.encounterId === target.encounterId
    && note.residentId === target.residentId && note.organizationId === encounter.organizationId
    && note.departmentId === encounter.departmentId, '文书归属不一致')
  requireFact(Number.isSafeInteger(note.currentVersion) && Number(note.currentVersion) > 0
    && (note.status === 'DRAFT' || note.status === 'AMENDMENT_IN_PROGRESS'), '文书版本或草稿状态未确认')
  if (target.previousDocument) requireFact(note.id === target.previousDocument.id
    && Number(note.currentVersion) > target.previousDocument.currentVersion, '文书未返回新的保存版本')
  requireFact(note.contentSchema === (input.noteFormVersionId ? 'RHN.OUTPATIENT_NOTE.V3' : 'RHN.OUTPATIENT_NOTE.V2')
    && object(note.content), '文书内容契约未确认')
  const content = note.content
  for (const field of recordTextFields) requireFact(content[field] === (input[field]?.trim() ?? ''), `正文 ${field} 未保存一致`)
  requireFact(object(content.vitalSigns), '生命体征缺失')
  for (const field of vitalFields) requireFact(nullable(content.vitalSigns[field]) === nullable(input[field]), `生命体征 ${field} 不一致`)
  requireFact(same(content.diagnoses, encounter.diagnoses.map(({ code, display, type }) => ({ code, display, type }))), '文书诊断与就诊回执不一致')

  if (input.noteFormVersionId) {
    requireFact(object(content.structuredForm) && content.structuredForm.versionId === input.noteFormVersionId,
      '结构化表单版本不一致')
    // The service trims strings and omits empty optional values; false and zero are real values.
    const expected = Object.fromEntries(Object.entries(input.structuredData ?? {})
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value != null && value !== ''))
    requireFact(same(content.structuredData, expected), '结构化字段不一致')
  } else requireFact(content.structuredForm == null && content.structuredData == null, '文书仍包含未提交的结构化表单')

  requireFact(Array.isArray(content.annotations), '正文来源标记缺失')
  // Match only metadata that is actually anchored in the submitted, trimmed text. The server drops stale hints.
  const submittedText = Object.fromEntries(recordTextFields.map(field => [field, input[field]?.trim() ?? '']))
  const expectedMarks = anchorAnnotations(submittedText, input.annotations).filter(mark => mark.text.length <= 4000)
    .map(mark => annotationFacts({ ...mark, confirmed: true }))
  requireFact(content.annotations.every(mark => object(mark)
    && ['binding', 'label', 'sourceQuote', 'reason'].every(key => mark[key] == null || typeof mark[key] === 'string'))
    && same(content.annotations.map(mark => annotationFacts(mark as unknown as RecordAnnotation)), expectedMarks), '正文来源标记尚未确认')
  return note as unknown as ClinicalDocument
}

function annotationFacts(mark: RecordAnnotation) {
  return { field: mark.field, text: mark.text, start: mark.start, source: mark.source, kind: mark.kind,
    binding: mark.binding?.slice(0, 120) ?? null, label: mark.label?.slice(0, 100) ?? null,
    sourceQuote: mark.sourceQuote?.slice(0, 1000) ?? null, reason: mark.reason?.slice(0, 500) ?? null,
    confirmed: mark.confirmed }
}
