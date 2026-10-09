import type { AccountStatement, PaymentOrder } from '../../../shared/api/billingApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'

export const completionModeKey = 'outpatient.doctor-workstation.completion-mode'
export type OutpatientCompletionMode = 'COMBINED_CONFIRMATION' | 'SEPARATE_CONFIRMATIONS'
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) }
function signedAmount(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function amount(value: unknown): value is number { return signedAmount(value) && value >= 0 }
function requireFact(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(`诊毕资料未确认：${detail}，请重新加载核实`)
}
export function requireCompletionMode(value: unknown): OutpatientCompletionMode {
  requireFact(object(value) && value.key === completionModeKey && value.suppressedByDependency === false
    && typeof value.inherited === 'boolean' && text(value.requestedScope) && text(value.resolvedScope)
    && (value.value === 'COMBINED_CONFIRMATION' || value.value === 'SEPARATE_CONFIRMATIONS'), '诊毕模式配置缺失或无效')
  return value.value
}

export function requireCompletionOrderCount(value: unknown, encounter: Encounter, kind: 'service' | 'medication'): number {
  const states = kind === 'service' ? ['ACTIVE', 'CANCELLED'] : ['DRAFT', 'ACTIVE', 'CANCELLED']
  requireFact(Array.isArray(value), '医嘱列表缺失')
  requireFact(value.every(row => object(row) && text(row.id) && row.encounterId === encounter.id
    && row.residentId === encounter.residentId && states.includes(String(row.status)))
    && new Set(value.map(row => row.id)).size === value.length, '医嘱归属、身份或状态无效')
  return value.filter(row => row.status !== 'CANCELLED').length
}

export function requireCompletionStatement(value: unknown, encounter: Encounter): AccountStatement {
  requireFact(object(value) && text(value.accountId) && text(value.currencyCode) && /^[A-Z]{3}$/.test(value.currencyCode)
    && ['encounterId', 'residentId', 'organizationId', 'departmentId'].every(key =>
      value[key] === (key === 'encounterId' ? encounter.id : encounter[key as keyof Encounter]))
    && ['chargeAmount', 'uninvoicedAmount', 'accountBalance'].every(key => signedAmount(value[key]))
    && amount(value.paymentAmount)
    && Array.isArray(value.settlements), '费用归属、金额或结算列表无效')
  const states = ['DRAFT', 'PRICED', 'PAYMENT_PENDING', 'PARTIAL', 'SETTLED', 'REVERSING', 'REVERSED', 'FAILED']
  requireFact(value.settlements.every(row => object(row) && text(row.id) && text(row.settlementNo)
    && row.patientAccountId === value.accountId && row.currencyCode === value.currencyCode
    && states.includes(String(row.status)) && signedAmount(row.outstandingAmount) && signedAmount(row.netAmount)
    && ['NORMAL', 'REVERSAL', 'SUPPLEMENT'].includes(String(row.settlementType)))
    && new Set(value.settlements.map(row => row.id)).size === value.settlements.length, '结算单归属、状态或待收金额无效')
  requireFact(Number.isFinite(value.settlements.reduce((sum, row) => sum + Math.max(row.outstandingAmount, 0), 0)), '待收金额合计无效')
  return value as unknown as AccountStatement
}

export function completionBillingSummary(statement: AccountStatement) {
  const payable = statement.settlements.filter(row => ['PRICED', 'PAYMENT_PENDING', 'PARTIAL'].includes(row.status)
    && row.outstandingAmount > 0)
  // A credit invoice is retained as PRICED by the backend; it is not another collection obligation.
  // Refund completion is evidenced by the account ledger balance plus the payment-order check.
  const outstanding = statement.settlements.reduce((sum, row) => sum + Math.max(row.outstandingAmount, 0), 0)
  const unresolved = statement.settlements.some(row => !['SETTLED', 'REVERSED'].includes(row.status)
    && !(row.settlementType === 'REVERSAL' && row.netAmount < 0 && row.status === 'PRICED'))
  return { payable, outstanding, settled: outstanding === 0 && statement.uninvoicedAmount === 0
    && statement.accountBalance === 0 && !unresolved }
}

export function requireCompletionPaymentOrders(value: unknown, statement: AccountStatement): PaymentOrder[] {
  const states = ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDING', 'REFUNDED']
  requireFact(Array.isArray(value) && value.every(row => object(row) && text(row.id)
    && row.patientAccountId === statement.accountId && row.currencyCode === statement.currencyCode
    && statement.settlements.some(settlement => settlement.id === row.settlementId)
    && states.includes(String(row.status)) && amount(row.requestedAmount) && amount(row.capturedAmount)
    && amount(row.refundedAmount)) && new Set(value.map(row => row.id)).size === value.length, '支付订单列表或状态无效')
  return value as PaymentOrder[]
}

export function hasPendingCompletionPayment(orders: PaymentOrder[]) {
  return orders.some(row => ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL', 'REFUNDING'].includes(row.status))
}

/** Re-read clinical facts before signing/completion. Billing proceeds independently after the visit. */
export async function confirmCompletionFacts(api: RhnApi, encounter: Encounter,
  displayedMode: OutpatientCompletionMode | undefined, assertCurrent: () => void) {
  assertCurrent()
  const [configuration, services, medications] = await Promise.all([
    api.configuration.resolve(completionModeKey, { organizationId: encounter.organizationId,
      departmentId: encounter.departmentId, moduleCode: 'DOCTOR_WORKSTATION' }),
    api.encounters.serviceRequests(encounter.id), api.encounters.medicationRequests(encounter.id),
  ])
  assertCurrent()
  requireFact(requireCompletionMode(configuration) === displayedMode, '诊毕模式已变化')
  requireCompletionOrderCount(services, encounter, 'service')
  requireCompletionOrderCount(medications, encounter, 'medication')
}
