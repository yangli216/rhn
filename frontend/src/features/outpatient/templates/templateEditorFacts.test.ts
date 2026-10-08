import { describe, expect, it } from 'vitest'
import type { DiseaseConcept, MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import { editorMedicationValidation, editorServiceAdopted, requireEditorDiagnosis, requireEditorMedication,
  requireEditorPage, requireEditorService, requireEditorStandards } from './templateEditorFacts'
import { editorStandardsFixture } from './templateEditorFacts.testFixtures'
import { maintainedPlanFixture } from './maintainedTemplateSave.testFixtures'

const service = () => ({ id: 's', code: 'S', name: '检验项目', sdStatus: 'ACTIVE', sdServiceType: 'LABORATORY', unitCode: '项',
  organizationAdoption: { catalogItemId: 'local', organizationId: 'org', sdStatus: 'ACTIVE', orderable: true,
    validFrom: '2000-01-01', validTo: '2099-12-31' } }) as ServiceCatalogItem

describe('manual template catalog facts', () => {
  it.each(['', 'UNKNOWN', undefined])('rejects missing or unknown diagnosis domain %s', domain => {
    expect(() => requireEditorDiagnosis({ id: 'd', systemCode: 'ICD', code: 'A', display: '诊断',
      sdStatus: 'ACTIVE', sdDiagnosisDomain: domain } as DiseaseConcept)).toThrow('类型尚未确认')
  })
  it.each([{ sdServiceType: 'UNKNOWN' }, { unitCode: undefined }])('rejects unknown service facts %s', patch => {
    expect(() => requireEditorService({ ...service(), ...patch } as ServiceCatalogItem)).toThrow('类型或数量单位缺失')
  })
  it('preserves missing medication defaults without manufacturing them', () => {
    const medication = { id: 'm', code: 'M', name: '药品', sdStatus: 'ACTIVE' } as MedicationKnowledge
    expect(requireEditorMedication(medication)).toBe(medication)
    expect(medication.preparationUnit).toBeUndefined()
  })
  it.each([{ sdStatus: 'SUSPENDED' }, { orderable: false }, { validFrom: '2099-01-01' }, { validTo: '2001-01-01' }])('disables unorderable adoption %s', patch => {
    const value = service(); Object.assign(value.organizationAdoption!, patch)
    expect(editorServiceAdopted(value, 'org')).toBe(false)
  })
  it.each([{ organizationId: 'other' }, { orderable: undefined }, { sdStatus: 'UNKNOWN' }, { validFrom: 'invalid' }])('rejects unverified adoption %s', patch => {
    const value = service(); Object.assign(value.organizationAdoption!, patch)
    expect(() => editorServiceAdopted(value, 'org')).toThrow('采用信息不完整')
  })
  it('accepts a verified current adoption', () => expect(editorServiceAdopted(service(), 'org')).toBe(true))
  it('rejects truncated pages instead of presenting a complete catalog', () => {
    expect(() => requireEditorPage({ content: [], totalElements: 1, totalPages: 1, page: 0, size: 30 }, requireEditorMedication)).toThrow('完整查询结果')
  })
  it.each(['missing', 'duplicate'])('rejects %s standard options', defect => {
    const value = editorStandardsFixture()
    if (defect === 'missing') Object.assign(value, { routes: undefined })
    else value.routes.push(value.routes[0])
    expect(() => requireEditorStandards(value)).toThrow('不完整或编码重复')
  })
  it('requires a current dictionary only when medication rows exist', () => {
    expect(editorMedicationValidation([], undefined)).toBe('')
    expect(editorMedicationValidation(maintainedPlanFixture().medications, undefined)).toContain('尚未确认')
  })
  it.each([{ routeCode: 'ORAL' }, { frequencyCode: 'unknown' }, { doseUnit: 'unknown' }, { durationValue: 3 }, { doseValue: 1 }])('blocks unconfirmed usage %s', patch => {
    const medication = { ...maintainedPlanFixture().medications[0], ...patch }
    expect(editorMedicationValidation([medication], editorStandardsFixture())).not.toBe('')
  })
})
