import { z } from 'zod'
import type { AccessPermission, AccessRole } from '../../shared/rhnApi'
const text = z.string().refine(value => value.trim().length > 0)
const role = z.object({ id: text, code: text, name: text, roleType: z.enum(['SYSTEM', 'BUSINESS', 'CUSTOM']),
  status: z.enum(['ACTIVE', 'INACTIVE']), version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  permissionCodes: z.array(text).refine(values => new Set(values).size === values.length),
}).passthrough()
const permission = z.object({ id: text, code: text, name: text, resourceCode: text, actionCode: text,
  status: z.enum(['ACTIVE', 'INACTIVE']), moduleId: text.nullish(), moduleCode: text.nullish(), moduleName: text.nullish(), routePath: z.string().nullish(),
}).passthrough()
function unique<T extends { id: string; code: string }>(values: T[]) {
  return new Set(values.map(value => value.id)).size === values.length && new Set(values.map(value => value.code)).size === values.length
}
export function requireAccessRoles(source: unknown): AccessRole[] {
  const result = z.array(role).safeParse(source)
  if (!result.success || !unique(result.data)) throw new Error('角色目录返回不完整或编码重复，请重新加载核实')
  return result.data
}
export function requireAccessPermissions(source: unknown): AccessPermission[] {
  const result = z.array(permission).safeParse(source)
  if (!result.success || !unique(result.data)) throw new Error('权限目录返回不完整或编码重复，请重新加载核实')
  return result.data
}
export function permissionIdsFor(codes: Set<string>, permissions: AccessPermission[]): string[] {
  return [...codes].map(code => {
    const match = permissions.find(value => value.code === code && value.status === 'ACTIVE')
    if (!match) throw new Error(`权限 ${code} 不存在于当前启用目录中，请重新核实，未提交替代权限列表`)
    return match.id
  })
}
export function requirePermissionReceipt(source: unknown, before: AccessRole, codes: Set<string>): AccessRole {
  const next = requireAccessRoles([source])[0]
  if (next.id !== before.id || next.code !== before.code || next.name !== before.name || next.roleType !== before.roleType
    || next.status !== before.status || next.version <= before.version || next.permissionCodes.length !== codes.size
    || next.permissionCodes.some(code => !codes.has(code))) throw new Error('权限保存结果未确认：返回角色、版本或权限集合与提交不一致')
  return next
}
