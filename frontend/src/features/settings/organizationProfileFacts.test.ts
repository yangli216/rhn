import { describe, expect, it } from 'vitest'
import { requireOrganizationProfile } from './organizationProfileFacts'
import { requireOrganizationUnit } from './organizationPersonnelFacts'

const organization = requireOrganizationUnit({ id: 'org', revision: 1, code: 'ORG', name: '机构', sdOrgKind: 'LEGAL_ORGANIZATION',
  sdOrgKindText: '机构', sdOrgType: 'HOSPITAL', sdOrgTypeText: '医院', sdOrgStatus: 'ACTIVE', sdOrgStatusText: '正常',
  virtual: false, sortOrder: 0, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })
const departmentUnit = { ...organization, id: 'dept', code: 'DEPT', parentId: 'org', sdOrgKind: 'ORG_UNIT' as const }
const department = { ...departmentUnit, organizationId: 'org', sdDepartmentType: 'CLINICAL', sdDepartmentTypeText: '临床科室' }
const base = { id: 'entry', sdDetailStatus: 'ACTIVE', sdDetailStatusText: '启用', validFrom: '2026-01-01', validTo: null }
const contact = { ...base, sdContactType: 'EMAIL', sdContactTypeText: '电子邮箱', contactValue: 'office@example.test',
  sdContactUse: 'WORK', sdContactUseText: '办公', primaryContact: false, sortOrder: 0 }
const address = { ...base, sdAddressType: 'MAILING', sdAddressTypeText: '通信地址', countryCode: 'CN', streetAddress: '通信街1号' }
const identifier = { ...base, identifierSystem: 'urn:test:org', identifierCode: 'ORGANIZATION_ID', sdIdentifierType: 'LOCAL',
  sdIdentifierTypeText: '内部代码', primaryIdentifier: false, sdVerifyStatus: 'UNVERIFIED', sdVerifyStatusText: '待核验' }
const capability = { ...base, sdCapabilityType: 'CONSULTING', sdCapabilityTypeText: '咨询', sdVerifyStatus: 'UNVERIFIED', sdVerifyStatusText: '待核验' }
const responsibility = { ...base, responsibleName: '业务负责人', sdResponsibilityType: 'BUSINESS', sdResponsibilityTypeText: '业务负责人', primaryResponsibility: false }
const relation = { ...base, targetOrganizationId: 'other', targetOrganizationName: '其他机构', sdRelationType: 'SUPPORT', sdRelationTypeText: '支持', primaryRelation: false }
const profile = { organization, identifiers: [identifier], addresses: [address], contacts: [contact], capabilities: [capability],
  responsibilities: [responsibility], relations: [relation] }
const departmentProfile = { department, contacts: [contact], capabilities: [capability], responsibilities: [responsibility],
  relations: [{ ...base, targetDepartmentId: 'other', targetDepartmentName: '其他科室', sdRelationType: 'SUPPORT', sdRelationTypeText: '支持', primaryRelation: false }] }

describe('organization governance profile facts', () => {
  it('preserves real record types and genuinely unspecified department properties', () => {
    expect(requireOrganizationProfile(profile, organization)).toEqual(profile)
    expect(requireOrganizationProfile(departmentProfile, departmentUnit)).toEqual(departmentProfile)
    const result = requireOrganizationProfile({ ...departmentProfile, department: { ...department, sdDepartmentProperty: null } }, departmentUnit)
    expect('department' in result && result.department.sdDepartmentProperty).toBeNull()
  })
  it.each(['identifiers', 'addresses', 'contacts', 'capabilities', 'responsibilities', 'relations'] as const)('requires a confirmed %s collection', field => {
    for (const value of [undefined, null, {}, [null], [...profile[field], ...profile[field]]]) {
      expect(() => requireOrganizationProfile({ ...profile, [field]: value }, organization)).toThrow()
    }
    expect(requireOrganizationProfile({ ...profile, [field]: [] }, organization)).toMatchObject({ [field]: [] })
  })
  it.each(['contacts', 'capabilities', 'responsibilities', 'relations'] as const)('requires department %s without borrowing organization arrays', field => {
    expect(() => requireOrganizationProfile({ ...departmentProfile, [field]: undefined }, departmentUnit)).toThrow()
  })
  it.each([null, {}, { ...profile, organization: { ...organization, id: 'other' } },
    { ...profile, organization: { ...organization, code: 'OTHER' } }, { ...profile, organization: { ...organization, revision: 0 } },
    { ...profile, department }, departmentProfile,
  ])('rejects a missing, wrong or older organization subject %j', value => {
    expect(() => requireOrganizationProfile(value, organization)).toThrow()
  })
  it.each([profile, { ...departmentProfile, department: { ...department, id: 'other' } },
    { ...departmentProfile, department: { ...department, revision: 0 } }, { ...departmentProfile, organization },
    { ...departmentProfile, department: { ...department, organizationId: undefined } },
  ])('rejects an unconfirmed department subject %j', value => {
    expect(() => requireOrganizationProfile(value, departmentUnit)).toThrow()
  })
  it.each([{ contactValue: '' }, { sdContactType: null }, { sdContactTypeText: undefined }, { sdContactUse: undefined },
    { primaryContact: 'false' }, { sortOrder: '0' }, { sdDetailStatus: undefined }, { validFrom: '2026-02-30' },
    { validTo: '2025-01-01' },
  ])('refuses incomplete contacts without relabeling them as a phone %j', patch => {
    expect(() => requireOrganizationProfile({ ...profile, contacts: [{ ...contact, ...patch }] }, organization)).toThrow()
  })
  it.each([
    { addresses: [{ ...address, sdAddressType: undefined }] }, { identifiers: [{ ...identifier, identifierSystem: undefined }] },
    { identifiers: [{ ...identifier, sdVerifyStatus: undefined }] }, { capabilities: [{ ...capability, sdCapabilityType: undefined }] },
    { capabilities: [{ ...capability, sdVerifyStatusText: undefined }] }, { responsibilities: [{ ...responsibility, primaryResponsibility: null }] },
    { responsibilities: [{ ...responsibility, responsibleName: null }] }, { relations: [{ ...relation, targetOrganizationId: undefined }] },
  ])('requires actual types, statuses and subjects for each record %j', patch => {
    expect(() => requireOrganizationProfile({ ...profile, ...patch }, organization)).toThrow()
  })
  it('accepts historic and inactive records as records without calling them current facts', () => {
    const contacts = [{ ...contact, sdDetailStatus: 'INACTIVE', sdDetailStatusText: '停用', validTo: '2026-02-01' }]
    expect(requireOrganizationProfile({ ...profile, contacts }, organization).contacts).toEqual(contacts)
  })
})
