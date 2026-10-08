import { describe, expect, it } from 'vitest'
import type { OrganizationProfileInput, OrganizationProfileResult } from '../../shared/rhnApi'
import { requireOrganizationUnit } from './organizationPersonnelFacts'
import { requireOrganizationProfile } from './organizationProfileFacts'
import { assertNewProfileItem, requireCreatedProfileItem } from './organizationProfileReceipt'

const organization = requireOrganizationUnit({ id: 'org', revision: 1, code: 'ORG', name: '机构', sdOrgKind: 'LEGAL_ORGANIZATION',
  sdOrgKindText: '机构', sdOrgType: 'HOSPITAL', sdOrgTypeText: '医院', sdOrgStatus: 'ACTIVE', sdOrgStatusText: '正常',
  virtual: false, sortOrder: 0, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })
const departmentUnit = { ...organization, id: 'dept', code: 'DEPT', sdOrgKind: 'ORG_UNIT' as const }
const period = { validFrom: '2026-01-01', validTo: '2027-01-01' }
const base = { id: 'new-record', ...period, sdDetailStatus: 'ACTIVE', sdDetailStatusText: '启用' }
const empty = { organization, identifiers: [], addresses: [], contacts: [], relations: [], capabilities: [], responsibilities: [] }
const deptEmpty = { department: { ...departmentUnit, organizationId: 'org', sdDepartmentType: 'CLINICAL', sdDepartmentTypeText: '临床' },
  contacts: [], relations: [], capabilities: [], responsibilities: [] }
const cases: Array<{ input: OrganizationProfileInput; field: string; row: Record<string, unknown>; patches: Array<Record<string, unknown>> }> = [
  { input: { section: 'identifier', ...period, identifierSystem: ' urn:test:org ', identifierCode: ' code-1 ', sdIdentifierType: 'LOCAL',
      primaryIdentifier: false, sdVerifyStatus: 'UNVERIFIED', issuerOrganizationId: 'issuer' }, field: 'identifiers',
    row: { ...base, identifierSystem: 'urn:test:org', identifierCode: 'code-1', sdIdentifierType: 'LOCAL', sdIdentifierTypeText: '内部代码',
      primaryIdentifier: false, sdVerifyStatus: 'UNVERIFIED', sdVerifyStatusText: '待核验', issuerOrganizationId: 'issuer' },
    patches: [{ identifierSystem: 'other' }, { identifierCode: 'CODE-1' }, { sdIdentifierType: 'OTHER' }, { primaryIdentifier: true }, { sdVerifyStatus: 'VERIFIED' }, { issuerOrganizationId: null }] },
  { input: { section: 'contact', ...period, sdContactType: 'EMAIL', contactValue: ' office@example.test ', sdContactUse: 'WORK', primaryContact: false, sortOrder: 7 },
    field: 'contacts', row: { ...base, sdContactType: 'EMAIL', sdContactTypeText: '邮箱', contactValue: 'office@example.test', sdContactUse: 'WORK', sdContactUseText: '办公', primaryContact: false, sortOrder: 7 },
    patches: [{ sdContactType: 'PHONE' }, { contactValue: 'other@example.test' }, { sdContactUse: 'OTHER' }, { primaryContact: true }, { sortOrder: 0 }] },
  { input: { section: 'address', ...period, sdAddressType: 'MAILING', countryCode: ' CN ', provinceCode: ' P ', cityCode: ' C ', districtCode: ' D ', streetAddress: ' 通信街1号 ', postalCode: ' 100000 ' },
    field: 'addresses', row: { ...base, sdAddressType: 'MAILING', sdAddressTypeText: '通信地址', countryCode: 'CN', provinceCode: 'P', cityCode: 'C', districtCode: 'D', streetAddress: '通信街1号', postalCode: '100000' },
    patches: [{ sdAddressType: 'PRACTICE' }, { countryCode: 'OTHER' }, { provinceCode: null }, { cityCode: null }, { districtCode: null }, { streetAddress: '其他地址' }, { postalCode: null }] },
  { input: { section: 'relation', ...period, targetOrganizationId: 'other-org', sdRelationType: 'SUPPORT', primaryRelation: false, description: ' 业务支持 ' },
    field: 'relations', row: { ...base, targetOrganizationId: 'other-org', targetOrganizationName: '其他机构', sdRelationType: 'SUPPORT', sdRelationTypeText: '支持', primaryRelation: false, description: '业务支持' },
    patches: [{ targetOrganizationId: 'wrong-org' }, { sdRelationType: 'OTHER' }, { primaryRelation: true }, { description: null }] },
  { input: { section: 'capability', ...period, sdCapabilityType: 'CONSULTING', qualificationBasisCode: ' Q001 ', capabilityScope: ' 咨询范围 ', sdVerifyStatus: 'UNVERIFIED' },
    field: 'capabilities', row: { ...base, sdCapabilityType: 'CONSULTING', sdCapabilityTypeText: '咨询', qualificationBasisCode: 'Q001', capabilityScope: '咨询范围', sdVerifyStatus: 'UNVERIFIED', sdVerifyStatusText: '待核验' },
    patches: [{ sdCapabilityType: 'OTHER' }, { qualificationBasisCode: null }, { capabilityScope: null }, { sdVerifyStatus: 'VERIFIED' }] },
  { input: { section: 'responsibility', ...period, externalResponsibleName: ' 负责人 ', sdResponsibilityType: 'BUSINESS', primaryResponsibility: false },
    field: 'responsibilities', row: { ...base, responsibleName: '负责人', sdResponsibilityType: 'BUSINESS', sdResponsibilityTypeText: '业务负责人', primaryResponsibility: false },
    patches: [{ responsibleName: '其他人' }, { assignmentId: 'assignment' }, { sdResponsibilityType: 'OTHER' }, { primaryResponsibility: true }] },
]

describe('governance profile creation receipts', () => {
  it.each(cases)('requires an actual new $field record matching every submitted field', item => {
    const before = requireOrganizationProfile(empty, organization), source = { ...empty, [item.field]: [item.row] }
    expect(requireCreatedProfileItem(source, organization, before, item.input)).toEqual(source)
    expect(() => requireCreatedProfileItem(before, organization, before, item.input)).toThrow(/未确认/)
    for (const patch of [...item.patches, { validFrom: '2026-02-01' }, { validTo: null }, { sdDetailStatus: 'INACTIVE' }]) {
      expect(() => requireCreatedProfileItem({ ...source, [item.field]: [{ ...item.row, ...patch }] }, organization, before, item.input)).toThrow()
    }
  })
  it.each(cases)('does not mistake a known old $field record or duplicated new matches for success', item => {
    const source = { ...empty, [item.field]: [item.row] }, before = requireOrganizationProfile(source, organization)
    expect(() => assertNewProfileItem(requireOrganizationProfile(empty, organization), organization, item.input)).not.toThrow()
    expect(() => assertNewProfileItem(before, organization, item.input)).toThrow(/未重复提交/)
    expect(() => requireCreatedProfileItem(source, organization, before, item.input)).toThrow()
    expect(() => requireCreatedProfileItem({ ...empty, [item.field]: [item.row, { ...item.row, id: 'duplicate-new' }] }, organization,
      requireOrganizationProfile(empty, organization), item.input)).toThrow()
  })
  it.each(cases.filter(item => !['identifier', 'address'].includes(item.input.section)))('supports department $field and verifies the department relation target', item => {
    const row = item.input.section === 'relation' ? { ...item.row, targetDepartmentId: 'other-org', targetDepartmentName: '其他科室' } : item.row
    const source = { ...deptEmpty, [item.field]: [row] }, before = requireOrganizationProfile(deptEmpty, departmentUnit)
    expect(requireCreatedProfileItem(source, departmentUnit, before, item.input)).toEqual(source)
    if (item.input.section === 'relation') expect(() => requireCreatedProfileItem({ ...source, relations: [{ ...row, targetDepartmentId: 'wrong' }] }, departmentUnit, before, item.input)).toThrow()
  })
  it('does not lose previous records in a different collection', () => {
    const contact = cases[1], identifier = cases[0]
    const before = requireOrganizationProfile({ ...empty, identifiers: [identifier.row] }, organization)
    expect(() => requireCreatedProfileItem({ ...empty, contacts: [contact.row] }, organization, before, contact.input)).toThrow()
    expect(requireCreatedProfileItem({ ...before, contacts: [contact.row] }, organization, before, contact.input).contacts).toEqual([contact.row])
  })
  it('allows other independently added records while finding exactly one match for this command', () => {
    const item = cases[1], source = { ...empty, contacts: [item.row, { ...item.row, id: 'concurrent', contactValue: 'other@example.test' }] }
    expect(requireCreatedProfileItem(source, organization, requireOrganizationProfile(empty, organization), item.input).contacts).toHaveLength(2)
  })
  it('rejects unsupported department identifier and address creation', () => {
    const before = requireOrganizationProfile(deptEmpty, departmentUnit)
    for (const item of [cases[0], cases[2]]) expect(() => requireCreatedProfileItem(before, departmentUnit, before, item.input)).toThrow()
  })
  it('distinguishes linked responsibilities from externally named people', () => {
    const item = cases[5], source = { ...empty, responsibilities: [{ ...item.row, assignmentId: 'assignment', responsibleName: '任职人员' }] }
    const input: OrganizationProfileInput = { section: 'responsibility', ...period, assignmentId: 'assignment', sdResponsibilityType: 'BUSINESS', primaryResponsibility: false }
    const before = requireOrganizationProfile(empty, organization)
    expect(requireCreatedProfileItem(source, organization, before, input).responsibilities[0].assignmentId).toBe('assignment')
    expect(() => requireCreatedProfileItem(source, organization, before, { ...input, externalResponsibleName: '外部人员' })).toThrow()
    expect(() => requireCreatedProfileItem(source, organization, before, { ...input, assignmentId: undefined })).toThrow()
  })
  it.each([null, {}, { ...empty, contacts: undefined }, { ...empty, organization: { ...organization, id: 'other' } }])('rejects incomplete or wrong-subject receipts %j', source => {
    expect(() => requireCreatedProfileItem(source, organization, empty as OrganizationProfileResult, cases[1].input)).toThrow()
  })
})
