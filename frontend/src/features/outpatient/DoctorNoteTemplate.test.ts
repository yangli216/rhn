import { describe, expect, it } from 'vitest'
import { diagnosisDraftSignature, draftStateLabels, mergeNoteTemplateContent,
  prescriptionCategoryLabel, printPurposeLabel, structuredFormSignature, validateStructuredForm,
  type NoteTemplateField } from './DoctorWorkstation'
import { canPrintPrescription } from './PrescriptionListEditor'
import type { OutpatientNoteForm } from '../../shared/api/outpatientNoteFormsApi'

const allFields = new Set<NoteTemplateField>([
  'chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam', 'treatmentPlan',
])

describe('病历模板带入', () => {
  it('默认只填充空白段落并保留医生已经书写的内容', () => {
    const result = mergeNoteTemplateContent(
      { chiefComplaint: '患者本次真实主诉', presentIllness: '' },
      { chiefComplaint: '模板主诉', presentIllness: '模板现病史', physicalExam: '模板查体' },
      allFields, false,
    )
    expect(result.chiefComplaint).toBe('患者本次真实主诉')
    expect(result.presentIllness).toBe('模板现病史')
    expect(result.physicalExam).toBe('模板查体')
  })

  it('仅在医生显式选择覆盖时替换所选段落', () => {
    const result = mergeNoteTemplateContent(
      { chiefComplaint: '原主诉', presentIllness: '原现病史' },
      { chiefComplaint: '模板主诉', presentIllness: '模板现病史' },
      new Set<NoteTemplateField>(['chiefComplaint']), true,
    )
    expect(result.chiefComplaint).toBe('模板主诉')
    expect(result.presentIllness).toBe('原现病史')
  })
})

describe('患者切换草稿保护', () => {
  it('归纳病历、诊断和待确认医嘱，供切换患者前统一拦截', () => {
    expect(draftStateLabels({ recordChanged: true, diagnosesChanged: true,
      medicationDraftCount: 2, serviceDraftCount: 1, busy: false })).toEqual([
      '尚未保存的病历内容', '尚未保存的诊断调整', '2 条待确认药品医嘱', '1 条待确认诊疗项目',
    ])
  })

  it('诊断比较不受展示顺序影响，但能识别类型和名称调整', () => {
    const baseline = [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' as const },
      { code: 'R42', display: '头晕', type: 'SECONDARY' as const }]
    expect(diagnosisDraftSignature([...baseline].reverse())).toBe(diagnosisDraftSignature(baseline))
    expect(diagnosisDraftSignature([{ ...baseline[0], type: 'SECONDARY' }]))
      .not.toBe(diagnosisDraftSignature([baseline[0]]))
  })
})

describe('版本化结构病历', () => {
  const form: OutpatientNoteForm = {
    id: '100', formCode: 'HYPERTENSION_FOLLOW_UP', version: 2, specialtyCode: 'GENERAL_PRACTICE',
    name: '高血压复诊评估', definitionSchema: 'RHN.OUTPATIENT_NOTE_FORM_DEFINITION.V1',
    status: 'PUBLISHED', publishedBy: '1', publishedAt: '2026-08-30T00:00:00Z', sections: [{
      code: 'followUp', title: '复诊评估', fields: [
        { code: 'homeSystolic', label: '家庭收缩压', type: 'NUMBER', required: true,
          minimum: 40, maximum: 300, options: [] },
        { code: 'adherence', label: '服药依从性', type: 'SELECT', required: true,
          options: [{ value: 'GOOD', label: '良好' }] },
      ],
    }],
  }

  it('校验必填字段和数值范围', () => {
    expect(validateStructuredForm(form, { homeSystolic: 320 })).toEqual({
      homeSystolic: '家庭收缩压不能大于 300', adherence: '请填写服药依从性',
    })
    expect(validateStructuredForm(form, { homeSystolic: 138, adherence: 'GOOD' })).toEqual({})
  })

  it('草稿签名包含表单版本且不受字段插入顺序影响', () => {
    expect(structuredFormSignature('100', { adherence: 'GOOD', homeSystolic: 138 }))
      .toBe(structuredFormSignature('100', { homeSystolic: 138, adherence: 'GOOD' }))
    expect(structuredFormSignature('101', { homeSystolic: 138, adherence: 'GOOD' }))
      .not.toBe(structuredFormSignature('100', { homeSystolic: 138, adherence: 'GOOD' }))
  })
})

describe('门诊受控打印', () => {
  it('仅向全部生效且包含药品明细的处方开放打印', () => {
    expect(canPrintPrescription({ status: 'ACTIVE', medicationRequests: [{ status: 'ACTIVE' }] })).toBe(true)
    expect(canPrintPrescription({ status: 'DRAFT', medicationRequests: [{ status: 'DRAFT' }] })).toBe(false)
    expect(canPrintPrescription({ status: 'ACTIVE', medicationRequests: [] })).toBe(false)
    expect(canPrintPrescription({ status: 'ACTIVE', medicationRequests: [
      { status: 'ACTIVE' }, { status: 'CANCELLED' },
    ] })).toBe(false)
  })

  it('统一显示打印用途和处方类别名称', () => {
    expect(printPurposeLabel('PATIENT_COPY')).toBe('患者副本')
    expect(printPurposeLabel('ARCHIVE_COPY')).toBe('归档副本')
    expect(prescriptionCategoryLabel('HERBAL')).toBe('草药处方')
  })
})
