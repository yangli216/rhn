import { describe, expect, it } from 'vitest'
import { endOfDateInstant, grantScopeText, grantStatus, requireDepartmentDefaults, requirePractitionerAccess } from './accessFacts'

const scope = { scopeType: 'DEPARTMENT', organizationId: 'org', departmentId: 'dept' }
const account = { id: 'u-1', username: 'p001', status: 'ACTIVE', practitionerId: 'p-1' }
const grant = { id: 'g-1', userId: 'u-1', username: 'p001', roleId: 'r-1', roleCode: 'R1', roleName: '角色', organizationId: 'org', organizationName: '机构',
  departmentId: 'dept', departmentName: '科室', dataScopeType: 'DEPARTMENT', validFrom: '2026-01-01T00:00:00Z', validTo: null,
  createdAt: '2026-01-01T00:00:00Z', effective: true, grantSource: 'DEPT_DEFAULT' }

describe('access facts', () => {
  it('accepts an access view only for the requested practitioner and their own account', () => {
    expect(requirePractitionerAccess({ practitionerId: 'p-1', account: null, assignments: [], scope }, 'p-1').account).toBeNull()
    expect(requirePractitionerAccess({ practitionerId: 'p-1', account, assignments: [grant], scope }, 'p-1').assignments).toHaveLength(1)
    expect(() => requirePractitionerAccess({ practitionerId: 'p-2', account: null, assignments: [], scope }, 'p-1')).toThrow()
    expect(() => requirePractitionerAccess({ practitionerId: 'p-1', account: { ...account, practitionerId: 'p-2' }, assignments: [], scope }, 'p-1')).toThrow()
    expect(() => requirePractitionerAccess({ practitionerId: 'p-1', account, assignments: [{ ...grant, userId: 'u-9' }], scope }, 'p-1')).toThrow()
    expect(() => requirePractitionerAccess({ practitionerId: 'p-1', account, assignments: [{ ...grant, grantSource: 'OTHER' }], scope }, 'p-1')).toThrow()
  })

  it('rejects default roles of another department', () => {
    const value = { organizationId: 'org', departmentId: 'dept', manageable: true, grantedCount: 0, roles: [] }
    expect(requireDepartmentDefaults(value, 'dept').roles).toEqual([])
    expect(() => requireDepartmentDefaults(value, 'other')).toThrow()
  })

  it('describes scope and status of a grant', () => {
    expect(grantScopeText(grant as never)).toBe('机构 · 科室')
    expect(grantScopeText({ dataScopeType: 'TENANT' })).toBe('全院（不限机构）')
    expect(grantStatus({ effective: false, validFrom: '2999-01-01T00:00:00Z' }).label).toBe('待生效')
    expect(grantStatus({ effective: false, validFrom: '2020-01-01T00:00:00Z', validTo: '2020-02-01T00:00:00Z' }).label).toBe('已失效')
  })

  it('ends an inclusive end date at the next local midnight', () => {
    const end = new Date(endOfDateInstant('2026-10-19'))
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toEqual([2026, 9, 20, 0])
  })
})
