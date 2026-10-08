import { describe, expect, it } from 'vitest'
import type { AccessRole, UserRoleAssignment } from '../../shared/rhnApi'
import { requireAccessUsers, requireGrantedAssignment, requireRevokedAssignment, requireUserAssignments } from './accessAssignmentFacts'
const scope = { organizationId: 'org', departmentId: 'dept' }
const account = { id: 'user', username: 'operator', status: 'ACTIVE' }
const role: AccessRole = { id: 'role', code: 'ROLE', name: '角色', roleType: 'BUSINESS', status: 'ACTIVE', version: 0, permissionCodes: [] }
const record: UserRoleAssignment = { id: 'grant', userId: account.id, username: account.username, roleId: role.id, roleCode: role.code, roleName: role.name,
  ...scope, organizationName: '机构', departmentName: '科室', dataScopeType: 'DEPARTMENT', validFrom: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z', effective: true }
describe('user assignment facts and receipts', () => {
  it.each([undefined, {}, [{ id: 'u' }], [account, account], [{ ...account, status: undefined }]])('rejects invalid users %j', source => {
    expect(() => requireAccessUsers(source)).toThrow()
  })
  it.each([{ userId: 'wrong' }, { roleName: undefined }, { organizationId: 'other' }, { departmentId: 'other' },
    { departmentName: null }, { dataScopeType: 'TENANT' }, { effective: undefined }, { validFrom: '2026-02-30T00:00:00Z' },
    { validTo: '2025-01-01T00:00:00Z' }])('rejects incomplete or wrong-scope records %j', patch => {
    expect(() => requireUserAssignments([{ ...record, ...patch }], account.id, scope)).toThrow()
  })
  it('accepts confirmed empty lists and zero-length revoked validity but rejects duplicate IDs', () => {
    expect(requireAccessUsers([])).toEqual([])
    expect(requireUserAssignments([], account.id, scope)).toEqual([])
    expect(requireUserAssignments([{ ...record, validTo: record.validFrom, effective: false }], account.id, scope)).toHaveLength(1)
    expect(() => requireUserAssignments([record, record], account.id, scope)).toThrow()
  })
  it('requires a new matching grant and compares timestamps by instant, without inventing effective status', () => {
    const saved = { ...record, effective: false, validTo: '2027-01-01T08:00:00+08:00' }
    expect(requireGrantedAssignment(saved, account, role, scope, '2027-01-01T00:00:00Z', [])).toEqual(saved)
    for (const patch of [{ username: 'other' }, { roleId: 'other' }, { roleCode: 'OTHER' }, { roleName: '其他' }, { validTo: undefined }]) {
      expect(() => requireGrantedAssignment({ ...saved, ...patch }, account, role, scope, '2027-01-01T00:00:00Z', [])).toThrow()
    }
    expect(() => requireGrantedAssignment(record, account, role, scope, null, [record])).toThrow()
  })
  it('requires an actual historical end record before confirming revocation', () => {
    const ended = { ...record, effective: false, validTo: '2026-03-01T00:00:00Z' }
    expect(requireRevokedAssignment([ended], record, scope)).toEqual([ended])
    const scheduled = { ...record, validTo: ended.validTo }
    expect(() => requireRevokedAssignment([ended], scheduled, scope)).toThrow()
    expect(() => requireRevokedAssignment([{ ...ended, validTo: '2026-04-01T00:00:00Z' }], scheduled, scope)).toThrow()
    for (const source of [[], [record], [{ ...ended, effective: true }], [{ ...ended, validTo: undefined }], [{ ...ended, roleId: 'other' }]]) {
      expect(() => requireRevokedAssignment(source, record, scope)).toThrow()
    }
  })
})
