import { describe, expect, it } from 'vitest'
import type { AccessPermission, AccessRole } from '../../shared/rhnApi'
import { permissionIdsFor, requireAccessPermissions, requireAccessRoles, requirePermissionReceipt } from './accessPermissionFacts'
const role: AccessRole = { id: '9007199254740993123', code: 'ROLE', name: '角色', roleType: 'BUSINESS', status: 'ACTIVE', version: 2, permissionCodes: ['TASK.READ'] }
const permission: AccessPermission = { id: '9007199254740993555', code: 'TASK.READ', name: '读取任务', resourceCode: 'TASK', actionCode: 'READ', status: 'ACTIVE' }
describe('permission maintenance facts', () => {
  it.each([undefined, {}, [{ id: 'role' }], [{ ...role, permissionCodes: undefined }], [{ ...role, permissionCodes: ['TASK.READ', 'TASK.READ'] }],
    [{ ...role, version: -1 }], [role, role]])('rejects invalid role directory %j', source => {
    expect(() => requireAccessRoles(source)).toThrow()
  })
  it.each([undefined, {}, [{ id: 'permission' }], [{ ...permission, status: 'UNKNOWN' }], [permission, permission],
    [permission, { ...permission, id: 'other' }]])('rejects invalid permission directory %j', source => {
    expect(() => requireAccessPermissions(source)).toThrow()
  })
  it('allows verified empty directories and preserves exact IDs', () => {
    expect(requireAccessRoles([])).toEqual([])
    expect(requireAccessPermissions([])).toEqual([])
    expect(permissionIdsFor(new Set(['TASK.READ']), [permission])).toEqual(['9007199254740993555'])
  })
  it('never silently drops unknown or inactive codes', () => {
    expect(() => permissionIdsFor(new Set(['TASK.READ']), [])).toThrow()
    expect(() => permissionIdsFor(new Set(['TASK.READ']), [{ ...permission, status: 'INACTIVE' }])).toThrow()
    expect(permissionIdsFor(new Set(), [permission])).toEqual([])
  })
  it.each([{ id: 'other' }, { version: 2 }, { name: 'other' }, { roleType: 'SYSTEM' }, { status: 'INACTIVE' },
    { permissionCodes: ['TASK.READ'] }, { permissionCodes: [] }, { permissionCodes: ['TASK.READ', 'TASK.WRITE', 'TASK.EXTRA'] }])('rejects mismatched save receipt %j', patch => {
    expect(() => requirePermissionReceipt({ ...role, version: 3, permissionCodes: ['TASK.READ', 'TASK.WRITE'], ...patch },
      role, new Set(['TASK.READ', 'TASK.WRITE']))).toThrow()
  })
  it('requires exact sets but ignores order; permits explicit clearing', () => {
    const next = { ...role, version: 3, permissionCodes: ['TASK.WRITE', 'TASK.READ'] }
    expect(requirePermissionReceipt(next, role, new Set(['TASK.READ', 'TASK.WRITE']))).toEqual(next)
    expect(requirePermissionReceipt({ ...role, version: 3, permissionCodes: [] }, role, new Set()).permissionCodes).toEqual([])
  })
})
