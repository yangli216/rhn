import { describe, expect, it } from 'vitest'
import type { AccessRole } from '../../shared/rhnApi'
import { requireAccessRoleStatus, requireCreatedAccessRole } from './accessRoleReceipt'
const role: AccessRole = { id: 'role1', code: 'NEW_ROLE', name: '新角色', roleType: 'BUSINESS', status: 'ACTIVE', version: 0, permissionCodes: [] }
const input = { code: ' new_role ', name: ' 新角色 ', roleType: 'BUSINESS' as const }
describe('role write receipts', () => {
  it('accepts only a fresh empty-permission role with server-normalized values', () => {
    expect(requireCreatedAccessRole(role, input, [])).toEqual(role)
    expect(() => requireCreatedAccessRole(role, input, [role])).toThrow()
  })
  it.each([{ id: undefined }, { code: 'OTHER' }, { name: '其他' }, { roleType: 'SYSTEM' }, { status: 'INACTIVE' },
    { version: 1 }, { permissionCodes: ['TASK.READ'] }, { permissionCodes: undefined }])('rejects incorrect creation receipt %j', patch => {
    expect(() => requireCreatedAccessRole({ ...role, ...patch }, input, [])).toThrow()
  })
  it('checks target status while preserving the original role and its permission set', () => {
    const before = { ...role, version: 2, permissionCodes: ['TASK.READ', 'TASK.WRITE'] }
    const next = { ...before, version: 3, status: 'INACTIVE' as const, permissionCodes: ['TASK.WRITE', 'TASK.READ'] }
    expect(requireAccessRoleStatus(next, before, 'INACTIVE')).toEqual(next)
    for (const patch of [{ id: 'other' }, { code: 'OTHER' }, { name: '其他' }, { roleType: 'CUSTOM' }, { version: 2 },
      { status: 'ACTIVE' }, { permissionCodes: [] }, { permissionCodes: ['TASK.WRITE', 'TASK.EXTRA'] }]) {
      expect(() => requireAccessRoleStatus({ ...next, ...patch }, before, 'INACTIVE')).toThrow()
    }
  })
})
