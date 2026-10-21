import type { AccountStatement, InsuranceSettlementView } from '../api/billingApi'
import { errorMessage, type RhnApi } from '../rhnApi'
import { confirmInsuranceResult, type InsuranceResultTarget } from './insuranceResult'

export { isInsuranceCredentialError } from './insuranceCredential'

type InsuranceBillingApi = Pick<RhnApi['billing'], 'quickPreSettleInsurance' | 'settleInsurance' | 'insuranceClaim'>

/** The statement scope a claim must belong to; omitted fields are not compared. */
export interface InsuranceStatementScope {
  encounterId?: string
  accountId?: string
  organizationId?: string
  departmentId?: string
}

/**
 * Shared by the cashier and the doctor-station settlement: a claim is only started or confirmed against a normal,
 * positive settlement of the patient's own current account.
 */
export function requireInsuranceTarget(statement: AccountStatement | undefined, settlementId: string,
  scope: InsuranceStatementScope = {}): InsuranceResultTarget {
  const target = statement?.settlements.find(value => value.id === settlementId)
  if (!statement || (scope.encounterId !== undefined && statement.encounterId !== scope.encounterId)
    || (scope.accountId !== undefined && statement.accountId !== scope.accountId)
    || (scope.organizationId !== undefined && statement.organizationId !== scope.organizationId)
    || (scope.departmentId !== undefined && statement.departmentId !== scope.departmentId)
    || !target || target.patientAccountId !== statement.accountId || target.settlementType !== 'NORMAL'
    || target.currencyCode !== statement.currencyCode || !Number.isFinite(target.netAmount) || target.netAmount <= 0) {
    throw new Error('医保结果未确认：当前患者的结算资料不完整或不一致，请重新加载后核实。')
  }
  return { settlementId, patientAccountId: statement.accountId, currencyCode: statement.currencyCode, grossAmount: target.netAmount }
}

/** Final settlement verifies the pre-settled claim itself: rounding may have changed the settlement since. */
export function requireClaimTarget(claim: InsuranceSettlementView | null | undefined, target: InsuranceResultTarget): InsuranceResultTarget {
  if (!claim || claim.settlementId !== target.settlementId || claim.patientAccountId !== target.patientAccountId) {
    throw new Error('医保结果未确认：试算申请与当前结算单不一致，请重新选择对应结算单。')
  }
  return { ...target, grossAmount: claim.grossAmount, claimId: claim.claimId }
}

/** Pre-settlement (2206) with a caller-held idempotency key, confirmed against the persisted claim. */
export async function preSettleInsurance(api: InsuranceBillingApi, target: InsuranceResultTarget, idempotencyKey: string,
  assertCurrent: () => void) {
  const receipt = await api.quickPreSettleInsurance(target.settlementId, { idempotencyKey })
  return confirmInsuranceResult(api, receipt, 'PRE_SETTLED', target, assertCurrent)
}

/** Final settlement (2207); the command code is derived from the claim so a retry is idempotent on the server. */
export async function settleInsuranceClaim(api: InsuranceBillingApi, claim: InsuranceSettlementView,
  target: InsuranceResultTarget, assertCurrent: () => void) {
  const receipt = await api.settleInsurance(claim.claimId, `CHS-SETL-${claim.claimId}`)
  return confirmInsuranceResult(api, receipt, 'SETTLED', requireClaimTarget(claim, target), assertCurrent)
}

/** Whether a settlement already carries an effective insurance split (latest insurance event not reversed). */
export function insuranceSettlementReady(settlement: AccountStatement['settlements'][number]) {
  const latestInsuranceEvent = [...settlement.events]
    .filter((value) => value.commandCode.startsWith('INSURANCE-'))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  if (latestInsuranceEvent) return latestInsuranceEvent.eventType !== 'REVERSE_COMPLETE'
  return settlement.insuranceAmount > 0 || settlement.tenders.some((value) => Boolean(value.claimResponseId))
}

/** API errors are plain objects, not Error; take their message so the operator sees the backend's actual reason. */
export function insuranceFailureText(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return errorMessage(error)
  }
  return fallback
}
