import { describe, expect, it } from 'vitest'
import type { OrganizationUnit, OrganizationUnitInput } from '../../shared/rhnApi'
import { departmentStructure, requireCreatedUnit, requireUpdatedUnit, requireUnitStatus, unitUpdateCommand } from './organizationUnitReceipt'

const org: OrganizationUnit = { id: 'org', code: 'ORG', revision: 2, name: '机构', sdOrgKind: 'LEGAL_ORGANIZATION', sdOrgKindText: '机构',
  sdOrgType: 'HOSPITAL', sdOrgTypeText: '医院', sdOrgStatus: 'ACTIVE', sdOrgStatusText: '启用', virtual: false, sortOrder: 0,
  validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' }
const dept: OrganizationUnit = { ...org, id: 'dept', parentId: org.id, code: 'DEPT', name: '科室', sdOrgKind: 'ORG_UNIT',
  sdOrgType: 'CLINICAL_DEPARTMENT', sdDepartmentProperty: 'CLINICAL', sdDepartmentType: 'CUSTOM_OTHER' }
const command: OrganizationUnitInput = { code: 'new_org', name: ' 新机构 ', sdOrgKind: 'LEGAL_ORGANIZATION', sdOrgType: 'HOSPITAL',
  parentId: org.id, shortName: ' 简称 ', description: ' 说明 ', sdOrgProperty: 'PUBLIC', virtual: true, sortOrder: 3,
  timezoneCode: 'Asia/Shanghai', validFrom: '2026-01-01', validTo: '2026-12-31' }
const created: OrganizationUnit = { ...org, ...command, id: 'new', code: 'NEW_ORG', name: '新机构', shortName: '简称', description: '说明' }

const inputFor = (unit: OrganizationUnit): OrganizationUnitInput => ({ code: unit.code, name: unit.name, sdOrgKind: unit.sdOrgKind,
  sdOrgType: unit.sdOrgType, parentId: unit.parentId ?? undefined, shortName: unit.shortName ?? undefined,
  description: unit.description ?? undefined, sdOrgProperty: unit.sdOrgProperty ?? undefined,
  sdDepartmentProperty: unit.sdDepartmentProperty ?? undefined, sdDepartmentType: unit.sdDepartmentType ?? undefined,
  timezoneCode: unit.timezoneCode ?? undefined, virtual: unit.virtual, sortOrder: unit.sortOrder,
  validFrom: unit.validFrom, validTo: unit.validTo ?? undefined })

describe('organization unit write receipts', () => {
  it('accepts actual normalized creation and editing, including explicit clearing', () => {
    expect(requireCreatedUnit(created, command, [org])).toEqual(created)
    const input = { ...command, shortName: ' ', description: undefined, timezoneCode: undefined }
    const result = { ...created, id: org.id, code: org.code, parentId: undefined, revision: 3, shortName: null, description: null, timezoneCode: null }
    expect(requireUpdatedUnit(result, org, { ...input, parentId: undefined }, [org])).toEqual(result)
  })
  it.each(['id', 'code', 'name', 'shortName', 'description', 'sdOrgKind', 'sdOrgType', 'sdOrgProperty', 'parentId',
    'virtual', 'sortOrder', 'timezoneCode', 'validFrom', 'validTo', 'sdOrgStatus', 'revision'] as const)('rejects incorrect or missing creation field %s', key => {
    const result = { ...created, [key]: undefined }
    expect(() => requireCreatedUnit(result, command, [org])).toThrow()
  })
  it('rejects old identity, invalid hierarchy and a partial object', () => {
    expect(() => requireCreatedUnit({ ...created, id: org.id }, command, [org])).toThrow()
    expect(() => requireCreatedUnit({ ...created, parentId: 'missing' }, { ...command, parentId: 'missing' }, [org])).toThrow()
    expect(() => requireCreatedUnit({ id: 'new' }, command, [org])).toThrow()
  })
  it.each([{ revision: 2 }, { id: 'wrong' }, { code: 'changed' }, { sdOrgStatus: 'INACTIVE' }, { createdAt: '2025-01-01T00:00:00Z' },
    { updatedAt: '2025-01-01T00:00:00Z' }, { name: 'not saved' }])('rejects incorrect edit receipt %j', patch => {
    expect(() => requireUpdatedUnit({ ...org, revision: 3, ...patch }, org, inputFor(org), [org])).toThrow()
  })
  it('preserves all non-status fields and requires a new revision on status changes', () => {
    const result = { ...dept, revision: 3, sdOrgStatus: 'INACTIVE' as const }
    expect(requireUnitStatus(result, dept, 'INACTIVE')).toEqual(result)
    for (const patch of [{ revision: 2 }, { sdOrgStatus: 'ACTIVE' }, { parentId: 'other' }, { name: 'other' }, { sdDepartmentType: null }, { virtual: true }]) {
      expect(() => requireUnitStatus({ ...result, ...patch }, dept, 'INACTIVE')).toThrow()
    }
  })
  it('checks department type and property independently', () => {
    const input = { ...inputFor(dept), code: 'NEW', parentId: org.id }
    const result = { ...dept, ...input, id: 'new' }
    expect(requireCreatedUnit(result, input, [org, dept])).toEqual(result)
    for (const patch of [{ sdDepartmentType: 'OTHER' }, { sdDepartmentProperty: 'ADMINISTRATIVE' }]) {
      expect(() => requireCreatedUnit({ ...result, ...patch }, input, [org, dept])).toThrow()
    }
  })
  it('converts only the owning organization to a null department parent, preserving the visible tree parent for receipt validation', () => {
    const input = { ...inputFor(dept), parentId: org.id }
    expect(unitUpdateCommand(dept, input, [org, dept])).toMatchObject({ parentId: undefined, expectedRevision: 2 })
    const child = { ...dept, id: 'child', code: 'CHILD', parentId: dept.id }
    expect(unitUpdateCommand(child, inputFor(child), [org, dept, child])).toMatchObject({ parentId: dept.id })
    const other = { ...org, id: 'other', code: 'OTHER' }
    expect(() => unitUpdateCommand(dept, { ...input, parentId: other.id }, [org, dept, other])).toThrow(/原机构/)
  })
  it.each([['ADMINISTRATIVE', 'ADMINISTRATIVE_DEPARTMENT'], ['MEDICAL_TECHNOLOGY', 'MEDICAL_TECHNOLOGY_DEPARTMENT'],
    ['NURSING', 'NURSING_UNIT'], ['CLINICAL', 'CLINICAL_DEPARTMENT']])('uses the server compatibility projection for %s', (property, expected) => {
    expect(departmentStructure(property)).toBe(expected)
  })
})
