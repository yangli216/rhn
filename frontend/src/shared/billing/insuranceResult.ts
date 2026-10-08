import type { InsuranceSettlementView } from '../api/billingApi'
import type { RhnApi } from '../rhnApi'

export interface InsuranceResultTarget {
  settlementId: string
  patientAccountId: string
  currencyCode: string
  grossAmount: number
  claimId?: string
}

function requireFact(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(`医保结果未确认：${detail}，请核实原申请后继续。`)
}
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const sameAmount = (left: number, right: number) => Number.isFinite(left) && Number.isFinite(right)
  && Math.abs(left - right) < 0.000001
const allocations = ['insuranceFundAmount', 'personalAccountAmount', 'patientCashAmount', 'otherFundAmount'] as const

/** An HTTP-success status alone does not identify the patient's claim or prove its allocation. */
export function requireInsuranceResult(result: InsuranceSettlementView, expected: 'PRE_SETTLED' | 'SETTLED', target: InsuranceResultTarget) {
  requireFact(result && typeof result === 'object', '未返回医保申请')
  if (result.status !== expected) {
    const operation = expected === 'PRE_SETTLED' ? '医保预结算' : '医保结算'
    const pending = typeof result.status === 'string' && result.status.endsWith('_PENDING')
    throw new Error(result.errorMessage || (pending
      ? `${operation}处理中，尚未确认成功，请查询医保处理结果后继续。`
      : `${operation}未成功（${result.status || '状态缺失'}），请核实处理结果后重试。`))
  }
  requireFact(text(result.claimId) && text(result.claimNo) && text(result.settlementNo), '申请标识缺失')
  requireFact(Number.isInteger(result.revision) && result.revision >= 0, '申请版本无效')
  requireFact(text(target.patientAccountId) && result.patientAccountId === target.patientAccountId, '患者账户不一致')
  requireFact(text(target.settlementId) && result.settlementId === target.settlementId, '结算单不一致')
  requireFact(!target.claimId || result.claimId === target.claimId, '医保申请不一致')
  requireFact(/^[A-Z]{3}$/.test(target.currencyCode) && result.currencyCode === target.currencyCode, '币种不一致')
  requireFact(result.grossAmount > 0 && sameAmount(result.grossAmount, target.grossAmount), '结算总额不一致')
  requireFact(allocations.every(key => typeof result[key] === 'number' && Number.isFinite(result[key]) && result[key] >= 0), '资金分摊金额缺失或无效')
  requireFact(sameAmount(allocations.reduce((sum, key) => sum + result[key], 0), result.grossAmount), '资金分摊合计不一致')
  requireFact(text(result.externalPreSettlementNo), '医保预结算流水缺失')
  if (expected === 'SETTLED') requireFact(text(result.externalSettlementNo), '医保结算流水缺失')
  return result
}

/** Read the persisted claim before displaying success or starting patient collection. */
export async function confirmInsuranceResult(api: Pick<RhnApi['billing'], 'insuranceClaim'>,
  receipt: InsuranceSettlementView, expected: 'PRE_SETTLED' | 'SETTLED', target: InsuranceResultTarget,
  assertCurrent: () => void) {
  assertCurrent()
  requireInsuranceResult(receipt, expected, target)
  const actual = await api.insuranceClaim(receipt.claimId)
  assertCurrent()
  requireInsuranceResult(actual, expected, { ...target, claimId: receipt.claimId })
  requireFact(actual.revision >= receipt.revision && actual.claimNo === receipt.claimNo
    && actual.settlementNo === receipt.settlementNo, '保存后的申请与回执不一致')
  requireFact(actual.externalPreSettlementNo === receipt.externalPreSettlementNo
    && (expected !== 'SETTLED' || actual.externalSettlementNo === receipt.externalSettlementNo)
    && allocations.every(key => sameAmount(actual[key], receipt[key])), '保存后的医保流水或资金分摊与回执不一致')
  return actual
}
