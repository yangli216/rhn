import { z } from 'zod'
import type { AccessRole, AccessUser, UserRoleAssignment } from '../../shared/rhnApi'
import { isIsoInstant } from '../../shared/validation/instant'
const text = z.string().refine(value => value.trim().length > 0)
const instant = z.string().refine(isIsoInstant)
const user = z.object({ id: text, username: text, status: text }).passthrough()
const assignment = z.object({ id: text, userId: text, username: text, roleId: text, roleCode: text, roleName: text,
  organizationId: text, organizationName: text, departmentId: text, departmentName: text,
  dataScopeType: z.literal('DEPARTMENT'), validFrom: instant, validTo: instant.nullish(), grantedBy: text.nullish(), createdAt: instant,
  effective: z.boolean(),
}).passthrough().refine(value => !value.validTo || Date.parse(value.validTo) >= Date.parse(value.validFrom))
export type AssignmentScope = { organizationId: string; departmentId: string }
export function requireAccessUsers(source: unknown): AccessUser[] {
  const parsed = z.array(user).safeParse(source)
  if (!parsed.success || new Set(parsed.data.map(value => value.id)).size !== parsed.data.length
    || new Set(parsed.data.map(value => value.username)).size !== parsed.data.length) throw new Error('用户目录返回不完整或账号重复，请重新加载核实')
  return parsed.data
}
export function requireUserAssignments(source: unknown, userId: string, scope: AssignmentScope): UserRoleAssignment[] {
  const parsed = z.array(assignment).safeParse(source)
  if (!parsed.success || new Set(parsed.data.map(value => value.id)).size !== parsed.data.length
    || parsed.data.some(value => value.userId !== userId || value.organizationId !== scope.organizationId || value.departmentId !== scope.departmentId)) {
    throw new Error('用户授权记录不完整或账号、工作范围不一致，请重新加载核实')
  }
  return parsed.data
}
const sameInstant = (left?: string | null, right?: string | null) => left == null || right == null
  ? left == null && right == null : Date.parse(left) === Date.parse(right)
export function requireGrantedAssignment(source: unknown, account: AccessUser, role: AccessRole, scope: AssignmentScope,
  validTo: string | null, existing: UserRoleAssignment[]): UserRoleAssignment {
  const next = requireUserAssignments([source], account.id, scope)[0]
  if (existing.some(value => value.id === next.id) || next.username !== account.username || next.roleId !== role.id
    || next.roleCode !== role.code || next.roleName !== role.name || !sameInstant(next.validTo, validTo)) {
    throw new Error('授权保存结果未确认：返回记录与本次用户、角色或有效期不一致')
  }
  return next
}
export function requireRevokedAssignment(source: unknown, before: UserRoleAssignment, scope: AssignmentScope): UserRoleAssignment[] {
  const values = requireUserAssignments(source, before.userId, scope)
  const next = values.find(value => value.id === before.id)
  const fields = ['username', 'roleId', 'roleCode', 'roleName', 'validFrom', 'createdAt', 'grantedBy'] as const
  if (!next || next.effective || !next.validTo || (before.validTo && Date.parse(next.validTo) >= Date.parse(before.validTo)) || fields.some(key => (next[key] ?? null) !== (before[key] ?? null))) {
    throw new Error('撤销结果未确认：尚未查到原授权已终止的记录')
  }
  return values
}
