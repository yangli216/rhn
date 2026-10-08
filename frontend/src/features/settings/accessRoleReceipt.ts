import type { AccessRole } from '../../shared/rhnApi'
import { requireAccessRoles } from './accessPermissionFacts'
export type CreateAccessRoleInput = { code: string; name: string; roleType: AccessRole['roleType'] }
export function requireCreatedAccessRole(source: unknown, input: CreateAccessRoleInput, existing: AccessRole[]): AccessRole {
  const next = requireAccessRoles([source])[0]
  if (existing.some(role => role.id === next.id || role.code === next.code) || next.code !== input.code.trim().toUpperCase()
    || next.name !== input.name.trim() || next.roleType !== input.roleType || next.status !== 'ACTIVE'
    || next.version !== 0 || next.permissionCodes.length !== 0) {
    throw new Error('角色创建结果未确认：返回记录不是本次创建的无权限新角色')
  }
  return next
}
export function requireAccessRoleStatus(source: unknown, before: AccessRole, target: AccessRole['status']): AccessRole {
  const next = requireAccessRoles([source])[0]
  if (next.id !== before.id || next.code !== before.code || next.name !== before.name || next.roleType !== before.roleType
    || next.status !== target || next.version <= before.version || next.permissionCodes.length !== before.permissionCodes.length
    || next.permissionCodes.some(code => !before.permissionCodes.includes(code))) {
    throw new Error('角色状态结果未确认：返回身份、版本、目标状态或权限与本次操作不一致')
  }
  return next
}
