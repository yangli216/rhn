import { describe, expect, it } from 'vitest'
import type { Encounter } from '../../../shared/model'
import { completionModeKey, requireCompletionMode, requireCompletionOrderCount, requireCompletionStatement,
  completionBillingSummary, requireCompletionPaymentOrders, hasPendingCompletionPayment } from './completionFacts'
import { completionStatementFixture, completionSettlementFixture } from './completionFacts.testFixtures'

const encounter = { id: 'enc-1', residentId: 'r-1', organizationId: 'org-1', departmentId: 'dept-1' } as Encounter
const mode = { key: completionModeKey, value: 'COMBINED_CONFIRMATION', requestedScope: 'DEPARTMENT',
  resolvedScope: 'PLATFORM', inherited: true, suppressedByDependency: false }
describe('completion facts require actual evidence', () => {
  it.each(['COMBINED_CONFIRMATION', 'SEPARATE_CONFIRMATIONS'])('accepts configured %s', value => {
    expect(requireCompletionMode({ ...mode, value })).toBe(value)
  })
  it.each([undefined, null, {}, { ...mode, key: 'other' }, { ...mode, value: '' },
    { ...mode, value: 'UNKNOWN' }, { ...mode, suppressedByDependency: true }, { ...mode, inherited: undefined }])(
    'does not replace invalid configuration %j with a mode', value => expect(() => requireCompletionMode(value)).toThrow('诊毕模式'))
  it('counts confirmed orders and distinguishes a real empty list', () => {
    const row = { id: 'order-1', encounterId: encounter.id, residentId: encounter.residentId, status: 'ACTIVE' }
    expect(requireCompletionOrderCount([], encounter, 'service')).toBe(0)
    expect(requireCompletionOrderCount([row, { ...row, id: 'order-2', status: 'CANCELLED' }], encounter, 'service')).toBe(1)
    expect(requireCompletionOrderCount([{ ...row, status: 'DRAFT' }], encounter, 'medication')).toBe(1)
  })
  it.each([undefined, null, {}, [null], [{ id: 'order-1', status: 'ACTIVE' }],
    [{ id: 'order-1', encounterId: 'other', residentId: 'r-1', status: 'ACTIVE' }],
    [{ id: 'order-1', encounterId: 'enc-1', residentId: 'r-1', status: 'UNKNOWN' }]])(
    'rejects missing or invalid orders %j', value => expect(() => requireCompletionOrderCount(value, encounter, 'service')).toThrow('医嘱'))
  it.each(['accountId', 'encounterId', 'residentId', 'organizationId', 'departmentId', 'currencyCode',
    'chargeAmount', 'paymentAmount', 'uninvoicedAmount', 'accountBalance', 'settlements'])('rejects absent statement %s', key => {
    expect(() => requireCompletionStatement({ ...completionStatementFixture(encounter), [key]: undefined }, encounter)).toThrow('费用')
  })
  it.each([NaN, Infinity, '0'])('does not coerce invalid amounts %s', value => {
    expect(() => requireCompletionStatement({ ...completionStatementFixture(encounter), chargeAmount: value }, encounter)).toThrow('费用')
  })
  it.each([{ patientAccountId: 'other' }, { currencyCode: 'USD' }, { status: 'UNKNOWN' },
    { outstandingAmount: undefined }, { outstandingAmount: NaN }])('rejects invalid settlement %j', change => {
    expect(() => requireCompletionStatement({ ...completionStatementFixture(encounter),
      settlements: [{ ...completionSettlementFixture(), ...change }] }, encounter)).toThrow('结算单')
  })
  it('rejects duplicate settlement identities', () => {
    const settlement = completionSettlementFixture()
    expect(() => requireCompletionStatement({ ...completionStatementFixture(encounter), settlements: [settlement, settlement] }, encounter)).toThrow('结算单')
  })
  it('allows a confirmed empty account and refuses uninvoiced charges', () => {
    const statement = requireCompletionStatement(completionStatementFixture(encounter), encounter)
    expect(completionBillingSummary(statement).settled).toBe(true)
    expect(completionBillingSummary({ ...statement, chargeAmount: 10, uninvoicedAmount: 10 }).settled).toBe(false)
  })
  it('preserves real credit invoices and requires the refunded ledger to balance', () => {
    const statement = requireCompletionStatement({ ...completionStatementFixture(encounter), accountBalance: -10,
      settlements: [completionSettlementFixture({ settlementType: 'REVERSAL', netAmount: -10, outstandingAmount: -10 })],
    }, encounter)
    expect(statement.settlements[0].outstandingAmount).toBe(-10)
    expect(completionBillingSummary(statement).settled).toBe(false)
    expect(completionBillingSummary({ ...statement, accountBalance: 0 }).settled).toBe(true)
    expect(completionBillingSummary({ ...statement, accountBalance: 0, settlements: [
      ...statement.settlements, completionSettlementFixture({ id: 'unpaid' }),
    ] }).outstanding).toBe(10)
  })
  it.each(['DRAFT', 'PRICED', 'PAYMENT_PENDING', 'PARTIAL', 'REVERSING', 'FAILED'] as const)(
    'does not equate zero outstanding with a completed %s settlement', status => {
      expect(completionBillingSummary({ ...completionStatementFixture(encounter), settlements: [
        completionSettlementFixture({ status, outstandingAmount: 0 }),
      ] }).settled).toBe(false)
    })
  it('sums all outstanding balances without dropping unexpected completed-state balances', () => {
    const summary = completionBillingSummary({ ...completionStatementFixture(encounter), settlements: [
      completionSettlementFixture(), completionSettlementFixture({ id: 'second', status: 'SETTLED', outstandingAmount: 5 }),
    ] })
    expect(summary.outstanding).toBe(15)
    expect(summary.payable).toHaveLength(1)
    expect(summary.settled).toBe(false)
  })
  it.each([undefined, null, {}, [{ id: 'payment-1' }]])('rejects an unconfirmed payment list %j', value => {
    expect(() => requireCompletionPaymentOrders(value, completionStatementFixture(encounter))).toThrow('支付订单')
  })
  it.each(['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL', 'REFUNDING', 'SUCCEEDED'] as const)(
    'keeps payment status %s distinct', status => {
      const statement = { ...completionStatementFixture(encounter), settlements: [completionSettlementFixture()] }
      const orders = requireCompletionPaymentOrders([{ id: 'pay-1', patientAccountId: 'acc-1', settlementId: 'settlement-1',
        currencyCode: 'CNY', status, requestedAmount: 10, capturedAmount: 0, refundedAmount: 0 }], statement)
      expect(hasPendingCompletionPayment(orders)).toBe(status !== 'SUCCEEDED')
    })
})
