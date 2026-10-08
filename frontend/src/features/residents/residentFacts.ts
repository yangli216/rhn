import type { Resident } from '../../shared/model'
import type { ResidentCoverageInput, ResidentPageView, ResidentProfile } from '../../shared/api/residentsApi'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function requireCoverageFacts(values: ResidentCoverageInput[]): void {
  const validDate = (value: unknown): value is string => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  values.forEach((value, index) => {
    if (!text(value.sdCoverageType) || !text(value.payerName) || !validDate(value.validFrom)
      || (value.validTo && (!validDate(value.validTo) || value.validTo < value.validFrom))) {
      throw new Error(`第 ${index + 1} 条保障信息需明确保障类型、支付方和有效期；证件号码不能证明参保情况`)
    }
  })
}

function requireResident(value: unknown): asserts value is Resident {
  if (!object(value) || !text(value.id) || !text(value.healthRecordNo) || !text(value.fullName)
    || !['ACTIVE', 'MERGED', 'INACTIVE'].includes(value.status as string) || typeof value.deceased !== 'boolean'
    || !['MALE', 'FEMALE', 'UNKNOWN'].includes(value.gender as string)
    || !text(value.birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate)
    || !Number.isFinite(Date.parse(value.birthDate)) || new Date(value.birthDate).toISOString().slice(0, 10) !== value.birthDate
    || !Number.isSafeInteger(value.version) || (value.version as number) < 0
    || !Array.isArray(value.identifiers)) throw new Error('居民身份或状态数据不完整，请重新读取档案')
}

export function requireResidentPage(value: ResidentPageView, page: number, size: number): ResidentPageView {
  if (!value || !Array.isArray(value.content) || value.page !== page || value.size !== size
    || !Number.isSafeInteger(value.totalElements) || value.totalElements < 0
    || value.totalPages !== Math.ceil(value.totalElements / size)
    || value.content.length !== Math.max(0, Math.min(size, value.totalElements - page * size))
    || value.first !== (page === 0) || value.last !== (page + 1 >= value.totalPages)) {
    throw new Error('居民列表或分页数据不完整，请重新读取，不能据此判断档案数量')
  }
  value.content.forEach(requireResident)
  if (new Set(value.content.map(item => item.id)).size !== value.content.length) throw new Error('居民列表包含重复身份，请重新读取')
  return value
}

export function requireResidentProfile(value: ResidentProfile, residentId: string): ResidentProfile {
  requireResident(value?.resident)
  if (value.resident.id !== residentId || !object(value.demographicProfile)
    || ![value.addresses, value.relatedPersons, value.coverages, value.employments].every(
      rows => Array.isArray(rows) && rows.every(object))) {
    throw new Error('居民档案身份不匹配或资料不完整，请重新读取')
  }
  return value
}
