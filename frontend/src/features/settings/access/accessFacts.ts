import { z } from 'zod'
import type { AccessUser, DepartmentDefaultRoles, PractitionerAccess, UserRoleAssignment } from '../../../shared/rhnApi'
import { isIsoInstant } from '../../../shared/validation/instant'
import { formatLocaleDateTime } from '../../../shared/format'

const text = z.string().refine(value => value.trim().length > 0)
const instant = z.string().refine(isIsoInstant)
const user = z.object({ id: text, username: text, status: text, revision: z.number().int().nonnegative(), practitionerId: text.nullish(),
  practitionerCode: z.string().nullish(), practitionerName: z.string().nullish() }).passthrough()
const grant = z.object({ id: text, userId: text, username: text, roleId: text, roleCode: text, roleName: text,
  organizationId: text.nullish(), organizationName: z.string().nullish(), departmentId: text.nullish(), departmentName: z.string().nullish(),
  dataScopeType: z.enum(['TENANT', 'ORGANIZATION', 'DEPARTMENT']), validFrom: instant, validTo: instant.nullish(),
  grantedBy: text.nullish(), createdAt: instant, effective: z.boolean(), grantSource: z.enum(['MANUAL', 'DEPT_DEFAULT']),
  staffAssignmentId: text.nullish(), practitionerId: text.nullish(), practitionerCode: z.string().nullish(), practitionerName: z.string().nullish(),
}).passthrough().refine(value => !value.validTo || Date.parse(value.validTo) >= Date.parse(value.validFrom))
const scope = z.object({ scopeType: z.enum(['TENANT', 'ORGANIZATION', 'DEPARTMENT']), organizationId: text.nullish(),
  organizationName: z.string().nullish(), departmentId: text.nullish(), departmentName: z.string().nullish() }).passthrough()
const access = z.object({ practitionerId: text, account: user.nullish(), assignments: z.array(grant), scope }).passthrough()
const defaults = z.object({ organizationId: text, departmentId: text, manageable: z.boolean(), grantedCount: z.number().int().nonnegative(),
  roles: z.array(z.object({ id: text, organizationId: text, departmentId: text, roleId: text, roleCode: text, roleName: text,
    roleStatus: z.enum(['ACTIVE', 'INACTIVE']), createdAt: instant }).passthrough()) }).passthrough()

const unique = (values: Array<{ id: string }>) => new Set(values.map(value => value.id)).size === values.length

export function requireAccessUsers(source: unknown): AccessUser[] {
  const parsed = z.array(user).safeParse(source)
  if (!parsed.success || !unique(parsed.data)) throw new Error('用户目录返回不完整或账号重复，请重新加载核实')
  return parsed.data
}

/** 停用/启用或重置密码后的账号：须为同一账号且版本前进。 */
export function requireAccountChange(source: unknown, before: AccessUser): AccessUser {
  const parsed = user.safeParse(source)
  if (!parsed.success || parsed.data.id !== before.id || parsed.data.revision <= before.revision) {
    throw new Error('账号保存结果未确认，请重新加载核实')
  }
  return parsed.data
}

/** 与开通账号、后端一致：8–64 位，同时包含字母和数字。 */
export const passwordAcceptable = (value: string) => value.length >= 8 && value.length <= 64 && /[A-Za-z]/.test(value) && /\d/.test(value)

export function requireGrants(source: unknown): UserRoleAssignment[] {
  const parsed = z.array(grant).safeParse(source)
  if (!parsed.success || !unique(parsed.data)) throw new Error('授权记录返回不完整，请重新加载核实')
  return parsed.data
}

export function requirePractitionerAccess(source: unknown, practitionerId: string): PractitionerAccess {
  const parsed = access.safeParse(source)
  if (!parsed.success || parsed.data.practitionerId !== practitionerId || !unique(parsed.data.assignments)
    || parsed.data.account && parsed.data.account.practitionerId !== practitionerId
    || parsed.data.assignments.some(value => value.userId !== parsed.data.account?.id)) {
    throw new Error('账号与授权返回不完整或与当前人员不一致，请重新加载核实')
  }
  return parsed.data
}

export function requireDepartmentDefaults(source: unknown, departmentId: string): DepartmentDefaultRoles {
  const parsed = defaults.safeParse(source)
  if (!parsed.success || parsed.data.departmentId !== departmentId || parsed.data.roles.some(value => value.departmentId !== departmentId)) {
    throw new Error('科室默认角色返回不完整或科室不一致，请重新加载核实')
  }
  return parsed.data
}

export function grantScopeText(value: Pick<UserRoleAssignment, 'dataScopeType' | 'organizationName' | 'departmentName'>) {
  if (value.dataScopeType === 'TENANT') return '全院（不限机构）'
  if (value.dataScopeType === 'ORGANIZATION') return `${value.organizationName ?? '机构'} · 全部科室`
  return `${value.organizationName ?? ''} · ${value.departmentName ?? ''}`
}

export function grantStatus(value: Pick<UserRoleAssignment, 'effective' | 'validFrom' | 'validTo'>, now = Date.now()) {
  if (value.effective) return { tone: 'success' as const, label: '有效' }
  if (Date.parse(value.validFrom) > now) return { tone: 'info' as const, label: '待生效' }
  return { tone: 'neutral' as const, label: '已失效' }
}

/** 授权是否仍可撤销：有效或待生效。 */
export const grantOpen = (value: Pick<UserRoleAssignment, 'validTo'>, now = Date.now()) => !value.validTo || Date.parse(value.validTo) > now

export function formatValidity(from: string, to?: string | null) {
  const format = (value: string) => formatLocaleDateTime(value, { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `${format(from)} 至 ${to ? format(to) : '长期'}`
}

/** 失效日期含当日：转换为次日零点（本地时间）。 */
export function endOfDateInstant(date: string) {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + 1)
  return value.toISOString()
}

export const scopeText = (value: PractitionerAccess['scope']) => value.scopeType === 'TENANT' ? '全院'
  : value.scopeType === 'ORGANIZATION' ? value.organizationName ?? '本机构' : `${value.organizationName ?? ''} · ${value.departmentName ?? ''}`
