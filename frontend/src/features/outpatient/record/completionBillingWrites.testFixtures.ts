import { vi } from 'vitest'
import type { ChargeItem, Invoice, PaymentOrder } from '../../../shared/api/billingApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { completionStatementFixture, completionSettlementFixture } from './completionFacts.testFixtures'

export function billingWriteFixture(encounter: Encounter, kind: 'invoice' | 'payment' = 'invoice',
  paymentStatus: 'SUCCEEDED' | 'PENDING' | 'FAILED' = 'SUCCEEDED') {
  const charge: ChargeItem = { id: 'charge-1', patientAccountId: 'acc-1', residentId: encounter.residentId,
    encounterId: encounter.id, catalogItemId: 'service-1', sourceType: 'SERVICE_REQUEST', sourceId: 'source-1',
    requestCode: 'REQ-1', status: 'POSTED', quantity: 1, unitCode: '次', unitPrice: 10, totalAmount: 10,
    currencyCode: 'CNY', itemCode: 'S1', itemName: '检查项目', occurredAt: '2026-10-04T00:00:00Z' }
  const invoice = (invoiceNo: string): Invoice => ({ id: 'invoice-1', patientAccountId: 'acc-1', invoiceNo,
    invoiceType: 'STANDARD', status: 'ISSUED', currencyCode: 'CNY', grossAmount: 10, discountAmount: 0, netAmount: 10,
    paidAmount: 0, outstandingAmount: 10, issuedAt: '2026-10-04T00:00:00Z', issuedBy: 'doctor-1',
    lines: [{ id: 'line-1', chargeItemId: charge.id, lineNo: 1, amount: 10 }] })
  let statement = { ...completionStatementFixture(encounter), charges: [charge], chargeAmount: 10,
    accountBalance: 10, uninvoicedAmount: 10 }
  let orders: PaymentOrder[] = []
  const issue = (invoiceNo: string) => {
    if (statement.invoices.some(row => row.invoiceNo === invoiceNo)) return statement.invoices.find(row => row.invoiceNo === invoiceNo)!
    if (!statement.uninvoicedAmount) throw new Error('没有待结算收费事项')
    const saved = invoice(invoiceNo)
    statement = { ...statement, uninvoicedAmount: 0, invoicedAmount: 10, invoices: [saved],
      settlements: [completionSettlementFixture({ legacyInvoiceId: saved.id })] }
    return saved
  }
  if (kind === 'payment') issue('INV-EXISTING')
  const before = structuredClone(statement)
  const api = {
    statement: vi.fn(async (_id: string) => structuredClone(statement)),
    issueInvoice: vi.fn(async (_account: string, invoiceNo: string, _scene?: string, _charges?: string[]) => issue(invoiceNo)),
    createPaymentOrder: vi.fn(async (settlementId: string, input: Parameters<RhnApi['billing']['createPaymentOrder']>[1]) => {
      const existing = orders.find(row => row.idempotencyKey === input.idempotencyKey)
      if (existing) return structuredClone(existing)
      const saved: PaymentOrder = { id: `payment-${input.idempotencyKey}`, revision: 1, patientAccountId: 'acc-1', settlementId,
        orderNo: 'PAY-1', idempotencyKey: input.idempotencyKey, businessScene: 'OUTPATIENT', paymentSceneCode: 'CLINIC_SETTLE',
        paymentMethodCode: input.paymentMethodCode, paymentMethodName: '银行卡', orderType: 'SETTLEMENT_PAY', status: paymentStatus,
        requestedAmount: input.amount, capturedAmount: paymentStatus === 'SUCCEEDED' ? input.amount : 0, refundedAmount: 0, currencyCode: 'CNY',
        createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:01Z', duplicate: false, events: [] }
      orders = [saved]
      if (paymentStatus === 'SUCCEEDED') statement = { ...statement, paymentAmount: input.amount, accountBalance: 10 - input.amount,
        invoices: statement.invoices.map(row => ({ ...row, paidAmount: input.amount, outstandingAmount: 10 - input.amount })),
        settlements: statement.settlements.map(row => ({ ...row, status: input.amount === 10 ? 'SETTLED' as const : 'PARTIAL' as const,
          tenderedAmount: input.amount, outstandingAmount: 10 - input.amount })) }
      return structuredClone(saved)
    }),
    paymentOrder: vi.fn(async (id: string) => structuredClone(orders.find(row => row.id === id)!)),
    paymentOrders: vi.fn(async (_account: string) => structuredClone(orders)),
  }
  return { api, before, statement: () => structuredClone(statement), orders: () => structuredClone(orders) }
}
