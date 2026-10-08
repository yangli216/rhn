import { describe, expect, it } from 'vitest'
import type { OutpatientNoteTemplate, SaveOutpatientNoteTemplateInput } from '../../../shared/api/outpatientNoteTemplatesApi'
import { prepareNoteTemplateSave } from './noteTemplateSaveInput'
import { requireCreatedNoteReceipt, requireNoteTemplateList } from './templateApplicationReceipt'

const input = (): SaveOutpatientNoteTemplateInput => ({ name: '  复诊模板  ', description: '  描述  ',
  scopeType: 'PERSONAL', specialtyCode: 'GENERAL_PRACTICE', content: { chiefComplaint: '  咳嗽3天  ',
    treatmentPlan: '不可带入的文字医嘱', healthEducation: '明确宣教', followUp: '明确随访',
    annotations: [{ field: 'chiefComplaint', text: '3天', start: 4, source: 'DOCTOR', kind: 'FACT', confirmed: true }] } })
function receipt(): OutpatientNoteTemplate {
  const saved = prepareNoteTemplateSave(input())
  return { ...saved, id: 'created', revision: 1, specialtyCode: 'GENERAL_PRACTICE', sortOrder: 0,
    contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1', documentType: 'OUTPATIENT_NOTE', status: 'ACTIVE',
    useCount: 0, createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }
}
describe('note template save facts', () => {
  it('projects only explicit reusable text and retains correctly rebased, unconfirmed annotations', () => {
    const source = input()
    Object.assign(source.content, { residentId: 'patient', systolic: 130, diagnoses: [{ code: 'I10' }] })
    expect(prepareNoteTemplateSave(source)).toEqual({ name: '复诊模板', description: '描述', scopeType: 'PERSONAL',
      specialtyCode: 'GENERAL_PRACTICE', sortOrder: 0, content: { chiefComplaint: '咳嗽3天', healthEducation: '明确宣教', followUp: '明确随访',
        annotations: [{ field: 'chiefComplaint', text: '3天', start: 2, source: 'DOCTOR', kind: 'FACT', confirmed: false }] } })
    expect(source.content.annotations?.[0].confirmed).toBe(true)
  })
  it('preserves a whole-paragraph preset while trimming only its whitespace edges', () => {
    const source = input()
    source.content.annotations = [{ field: 'chiefComplaint', text: '  咳嗽3天  ', start: 0, source: 'TEMPLATE', kind: 'PRESET' }]
    expect(prepareNoteTemplateSave(source).content.annotations?.[0]).toMatchObject({ text: '咳嗽3天', start: 0, confirmed: false })
  })
  it.each(['empty', 'scope', 'body-type', 'annotation-offset', 'annotation-count', 'annotation-metadata'])(
    'refuses invalid %s input before sending a create request', failure => {
      const source = input()
      if (failure === 'empty') source.content = { treatmentPlan: '只有文字医嘱' }
      if (failure === 'scope') Object.assign(source, { scopeType: 'HOSPITAL' })
      if (failure === 'body-type') Object.assign(source.content, { chiefComplaint: 123 })
      if (failure === 'annotation-offset') source.content.annotations![0].start = 0
      if (failure === 'annotation-count') source.content.annotations = Array.from({ length: 201 }, () => source.content.annotations![0])
      if (failure === 'annotation-metadata') source.content.annotations![0].binding = 'x'.repeat(121)
      expect(() => prepareNoteTemplateSave(source)).toThrow(/未保存/)
    })
  it.each(['empty', 'identity', 'scope', 'specialty', 'name', 'body', 'annotation', 'status', 'count'])(
    'does not acknowledge an invalid %s create receipt', failure => {
      const value = receipt()
      if (failure === 'identity') value.id = ''
      if (failure === 'scope') value.scopeType = 'DEPARTMENT'
      if (failure === 'specialty') value.specialtyCode = 'OTHER'
      if (failure === 'name') value.name = '另一模板'
      if (failure === 'body') value.content.chiefComplaint = '未核实的新正文'
      if (failure === 'annotation') value.content.annotations = []
      if (failure === 'status') value.status = 'INACTIVE'
      if (failure === 'count') value.useCount = 3
      expect(() => requireCreatedNoteReceipt(failure === 'empty' ? undefined as unknown as OutpatientNoteTemplate : value,
        prepareNoteTemplateSave(input()))).toThrow(/保存未确认/)
    })
  it('accepts the verified receipt and an explicitly empty visible directory', () => {
    const value = receipt()
    expect(requireCreatedNoteReceipt(value, prepareNoteTemplateSave(input()))).toBe(value)
    expect(requireNoteTemplateList([], 'GENERAL_PRACTICE')).toEqual([])
  })
  it.each(['missing', 'duplicate', 'scope', 'specialty', 'count'])('refuses an invalid %s directory', failure => {
    const value = receipt()
    if (failure === 'scope') Object.assign(value, { scopeType: 'UNKNOWN' })
    if (failure === 'specialty') value.specialtyCode = 'OTHER'
    if (failure === 'count') value.useCount = undefined as unknown as number
    const list = failure === 'missing' ? undefined as unknown as OutpatientNoteTemplate[] : failure === 'duplicate' ? [value, value] : [value]
    expect(() => requireNoteTemplateList(list, 'GENERAL_PRACTICE')).toThrow(/病历模板/)
  })
})
