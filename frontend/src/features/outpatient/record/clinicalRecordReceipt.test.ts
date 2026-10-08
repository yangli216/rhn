import { describe, expect, it } from 'vitest'
import type { Encounter } from '../../../shared/model'
import type { ClinicalRecordInput } from '../../../shared/api/encountersApi'
import { clinicalRecordSaveFixture } from './clinicalRecordSave.testFixtures'
import { requireClinicalDocument, requireClinicalEncounter } from './clinicalRecordReceipt'

const target = { encounterId: 'enc-1', residentId: 'resident-1', organizationId: 'org-1', departmentId: 'dept-1',
  previousDocument: { id: 'note-1', currentVersion: 2 } }
const input: Omit<ClinicalRecordInput, 'commandCode'> = { chiefComplaint: ' 咳嗽三天 ', presentIllness: '夜间咳嗽',
  systolic: 120, diastolic: 80, temperature: 36.8,
  diagnoses: [{ code: 'R05', display: '咳嗽', type: 'PRIMARY', codeSystem: 'WHO.ICD10', diagnosisDomain: 'WESTERN_MEDICINE' }],
  annotations: [{ field: 'presentIllness', text: '夜间咳嗽', start: 0, source: 'VOICE', kind: 'FACT', confirmed: false }] }
function fixture() {
  return clinicalRecordSaveFixture({ id: 'enc-1', residentId: 'resident-1', status: 'IN_PROGRESS',
    organizationId: 'org-1', departmentId: 'dept-1' } as Encounter, input, 3)
}

describe('persisted clinical record evidence', () => {
  it('confirms actual text, vitals, diagnoses, ownership, sources and a new draft version', () => {
    const saved = fixture()
    expect(requireClinicalEncounter(target, input, saved.encounter)).toBe(saved.encounter)
    expect(requireClinicalDocument(target, input, saved.encounter, [saved.document])).toBe(saved.document)
  })
  it.each([
    ['patient', { residentId: 'another' }], ['status', { status: 'COMPLETED' }],
    ['complaint', { chiefComplaint: '旧主诉' }], ['blood-pressure', { systolic: 121 }],
    ['diagnoses-missing', { diagnoses: null }], ['diagnoses-omitted', { diagnoses: [] }],
    ['diagnosis-identity', { diagnoses: [{ ...fixture().encounter.diagnoses[0], systemCode: 'OTHER' }] }],
    ['diagnosis-domain', { diagnoses: [{ ...fixture().encounter.diagnoses[0], diagnosisDomain: null }] }],
    ['diagnosis-type', { diagnoses: [{ ...fixture().encounter.diagnoses[0], type: 'SECONDARY' }] }],
    ['diagnosis-text', { diagnoses: [{ ...fixture().encounter.diagnoses[0], display: '其他诊断' }] }],
  ])('rejects an encounter with %s inconsistent even when its id matches', (_name, change) => {
    expect(() => requireClinicalEncounter(target, input, { ...fixture().encounter, ...change })).toThrow('病历保存回执未确认')
  })
  it.each([
    ['identity', { id: 'another' }], ['patient', { residentId: 'another' }], ['encounter', { encounterId: 'another' }],
    ['department', { departmentId: 'another' }], ['organization', { organizationId: 'another' }],
    ['stale-version', { currentVersion: 2 }], ['version-absent', { currentVersion: undefined }],
    ['fractional-version', { currentVersion: 3.5 }], ['signed', { status: 'SIGNED' }],
    ['schema', { contentSchema: 'RHN.OUTPATIENT_NOTE.V1' }], ['content-missing', { content: null }],
    ['wrong-instance', { instanceKey: 'OTHER' }],
  ])('rejects a persisted note with %s inconsistent', (_name, change) => {
    const saved = fixture()
    expect(() => requireClinicalDocument(target, input, saved.encounter, [{ ...saved.document, ...change }])).toThrow('病历保存回执未确认')
  })
  it.each([
    ['missing-blank-paragraph', { medicalHistory: undefined }], ['changed-text', { presentIllness: '旧内容' }],
    ['stale-cleared-vital', { vitalSigns: { ...fixture().document.content.vitalSigns, pulseRate: 80 } }],
    ['missing-vital', { vitalSigns: {} }], ['missing-diagnoses', { diagnoses: [] }],
    ['stale-structured-form', { structuredForm: { versionId: 'another' } }],
    ['missing-sources', { annotations: [] }], ['unconfirmed-sources', { annotations: input.annotations }],
  ])('rejects note content with %s', (_name, change) => {
    const saved = fixture()
    expect(() => requireClinicalDocument(target, input, saved.encounter,
      [{ ...saved.document, content: { ...saved.document.content, ...change } }])).toThrow('病历保存回执未确认')
  })
  it('rejects missing and ambiguous document collections', () => {
    const saved = fixture()
    for (const documents of [null, {}, [], [null], [saved.document, saved.document]]) {
      expect(() => requireClinicalDocument(target, input, saved.encounter, documents)).toThrow('病历保存回执未确认')
    }
  })
  it('checks structured values after contract normalization without discarding false or zero', () => {
    const requested = { ...input, noteFormVersionId: 'form-1', structuredData: { label: ' 明确内容 ', zero: 0, negative: false, empty: '  ' } }
    const saved = clinicalRecordSaveFixture(fixture().encounter, requested, 3)
    saved.document.content.structuredData = { negative: false, label: '明确内容', zero: 0 }
    expect(requireClinicalDocument(target, requested, saved.encounter, [saved.document])).toBe(saved.document)
    saved.document.content.structuredData = { label: '明确内容' }
    expect(() => requireClinicalDocument(target, requested, saved.encounter, [saved.document])).toThrow('结构化字段不一致')
    saved.document.content.structuredForm!.versionId = 'form-2'
    expect(() => requireClinicalDocument(target, requested, saved.encounter, [saved.document])).toThrow('结构化表单版本不一致')
  })
  it('accepts catalog canonical text only for the same concept and declared identity', () => {
    const requested = { ...input, diagnoses: [{ ...input.diagnoses[0], conceptId: 'concept-1' }] }
    const saved = clinicalRecordSaveFixture(fixture().encounter, requested, 3)
    saved.encounter.diagnoses[0].display = '目录规范名称'
    expect(requireClinicalEncounter(target, requested, saved.encounter)).toBe(saved.encounter)
    saved.encounter.diagnoses[0].conceptId = 'concept-2'
    expect(() => requireClinicalEncounter(target, requested, saved.encounter)).toThrow('诊断身份')
  })
})
