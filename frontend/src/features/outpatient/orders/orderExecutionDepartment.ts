import { z } from 'zod'
import type { RhnApi } from '../../../shared/rhnApi'

export async function resolveOrderExecutionDepartment(id: string, organizationId: string, api: RhnApi) {
  const known = (value: unknown) => typeof value === 'string' && value.trim().length > 0
  if (!known(id) || !known(organizationId)) throw new Error('执行机构或科室尚未确认')
  const profile = await api.organization.department(id), department = profile?.department
  const now = new Date(), at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (!department || department.id !== id || department.organizationId !== organizationId || !known(department.name)
    || department.sdOrgStatus !== 'ACTIVE' || !z.iso.date().safeParse(department.validFrom).success
    || (department.validTo !== null && !z.iso.date().safeParse(department.validTo).success)
    || department.validFrom > at || (department.validTo != null && (department.validTo < at || department.validTo < department.validFrom))) {
    throw new Error('执行科室的归属、状态或有效期尚未确认，无法导入')
  }
  return department
}
