import type { ResidentCoverageInput } from '../api/residentsApi'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

/** 居民档案与挂号建档共用：保障信息必须明确保障类型、支付方和有效期。 */
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
