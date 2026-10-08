import type { AccountStatement, Invoice, PaymentOrder } from '../../../shared/api/billingApi'
import { errorMessage } from '../../../shared/api/httpClient'
import type { SettlementPaymentCommand } from '../../../shared/billing/SettlementPaymentPanel'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { requireCompletionPaymentOrders, requireCompletionStatement } from './completionFacts'

type BillingApi = Pick<RhnApi['billing'], 'statement' | 'paymentOrders' | 'paymentOrder' | 'issueInvoice' | 'createPaymentOrder'>
type Target = { api: BillingApi; encounter: Encounter; statement: AccountStatement }
type Pending = Target & ({ kind: 'payment'; command: SettlementPaymentCommand }
  | { kind: 'invoice'; invoiceNo: string; charges: { id: string; amount: number }[] })
function requireFact(value: unknown, detail: string): asserts value {
  if (!value) throw new Error(`诊间结算操作未确认：${detail}`)
}
function text(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()) }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function sameAmount(left: unknown, right: number) { return finite(left) && Math.abs(left - right) < 0.000001 }

function invoiceCharges(statement: AccountStatement) {
  requireFact(Array.isArray(statement.charges) && Array.isArray(statement.invoices), '收费明细或已有凭证缺失')
  const invoiced = new Set<string>()
  for (const invoice of statement.invoices) {
    requireFact(invoice && text(invoice.id) && invoice.patientAccountId === statement.accountId
      && invoice.currencyCode === statement.currencyCode && Array.isArray(invoice.lines), '已有结算凭证归属或明细无效')
    for (const line of invoice.lines) {
      requireFact(line && text(line.chargeItemId), '已有凭证缺少收费明细身份')
      invoiced.add(line.chargeItemId)
    }
  }
  requireFact(statement.charges.every(row => row && text(row.id) && row.patientAccountId === statement.accountId
    && row.encounterId === statement.encounterId && row.residentId === statement.residentId
    && row.currencyCode === statement.currencyCode && finite(row.totalAmount))
    && new Set(statement.charges.map(row => row.id)).size === statement.charges.length, '收费明细归属、身份或金额无效')
  const charges = statement.charges.filter(row => !invoiced.has(row.id)).map(row => ({ id: row.id, amount: row.totalAmount }))
  requireFact(charges.length && sameAmount(statement.uninvoicedAmount, charges.reduce((sum, row) => sum + row.amount, 0)),
    '待开票汇总与收费明细不一致')
  return charges
}

function requireInvoice(value: unknown, pending: Extract<Pending, { kind: 'invoice' }>): Invoice {
  const invoice = value as Invoice | undefined
  const total = pending.charges.reduce((sum, row) => sum + row.amount, 0)
  requireFact(invoice && text(invoice.id) && invoice.patientAccountId === pending.statement.accountId
    && invoice.invoiceNo === pending.invoiceNo && invoice.currencyCode === pending.statement.currencyCode
    && invoice.invoiceType === (total >= 0 ? 'STANDARD' : 'CREDIT') && invoice.status === 'ISSUED'
    && text(invoice.issuedBy) && text(invoice.issuedAt) && Number.isFinite(Date.parse(invoice.issuedAt))
    && sameAmount(invoice.grossAmount, total) && finite(invoice.discountAmount) && finite(invoice.netAmount)
    && finite(invoice.paidAmount) && finite(invoice.outstandingAmount)
    && sameAmount(invoice.outstandingAmount, invoice.netAmount - invoice.paidAmount)
    && Array.isArray(invoice.lines) && invoice.lines.length === pending.charges.length
    && new Set(invoice.lines.map(row => row?.id)).size === invoice.lines.length
    && new Set(invoice.lines.map(row => row?.chargeItemId)).size === invoice.lines.length
    && invoice.lines.every(row => row && text(row.id) && pending.charges.some(charge => charge.id === row.chargeItemId
      && sameAmount(row.amount, charge.amount))), '结算凭证回执与原编号、账户或收费明细不一致')
  return invoice
}

function requirePayment(value: unknown, pending: Extract<Pending, { kind: 'payment' }>, statement: AccountStatement): PaymentOrder {
  const order = requireCompletionPaymentOrders([value], statement)[0]
  requireFact(order.idempotencyKey === pending.command.idempotencyKey && order.settlementId === pending.command.settlementId
    && order.businessScene === 'OUTPATIENT' && order.paymentSceneCode === 'CLINIC_SETTLE'
    && order.paymentMethodCode === pending.command.paymentMethodCode && order.orderType === 'SETTLEMENT_PAY'
    && sameAmount(order.requestedAmount, pending.command.amount) && text(order.orderNo)
    && Number.isSafeInteger(order.revision) && order.revision >= 0, '支付回执与原请求、金额或支付方式不一致')
  return order
}

/** One patient workspace, surviving dialog close/reopen. No cross-reload recovery is claimed. */
export function createCompletionBillingWriter() {
  let pending: Pending | undefined, busy = false, sequence = 0
  async function execute(api: BillingApi, assertCurrent: () => void) {
    requireFact(!busy, '原请求仍在处理中')
    requireFact(pending && pending.api === api, '原操作尚未核实，不能在另一个 API 会话重复提交')
    const attempt = pending, revision = ++sequence
    const check = () => { assertCurrent(); requireFact(sequence === revision && pending === attempt, '原请求已被其他操作替换') }
    busy = true
    try {
      check()
      let payment: PaymentOrder | undefined, invoice: Invoice | undefined
      const write = async <T,>(request: () => Promise<T>) => {
        try { return await request() } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
          const rejected = attempt.kind === 'payment'
            ? ['PAYMENT_AMOUNT_INVALID', 'PAYMENT_METHOD_INVALID', 'PAYMENT_METHOD_NOT_APPLICABLE',
              'PAYMENT_METHOD_CLASSIFICATION_INVALID', 'PAYMENT_ORDER_EXCEEDS_AVAILABLE', 'PAYMENT_CREDIT_INVOICE_INVALID']
            : ['INVOICE_NO_UNINVOICED_CHARGES', 'INVOICE_NO_SELECTED_CHARGES', 'INVOICE_CURRENCY_MISMATCH']
          // These server precondition errors are raised before creation, unlike an uncertain network response.
          if (rejected.includes(code)) pending = undefined
          throw error
        }
      }
      if (attempt.kind === 'payment') {
        const command = attempt.command
        payment = requirePayment(await write(() => api.createPaymentOrder(command.settlementId, {
          idempotencyKey: command.idempotencyKey, businessScene: 'OUTPATIENT', paymentSceneCode: 'CLINIC_SETTLE',
          paymentMethodCode: command.paymentMethodCode, amount: command.amount, roundingAdjustment: command.roundingAdjustment,
          correlationId: `DOCTOR-STATION-${attempt.encounter.id}`, terminalCode: 'WEB-DOCTOR-WORKSTATION',
        })), attempt, attempt.statement)
      } else {
        invoice = requireInvoice(await write(() => api.issueInvoice(attempt.statement.accountId, attempt.invoiceNo,
          'OUTPATIENT', attempt.charges.map(row => row.id))), attempt)
      }
      check()
      const statement = requireCompletionStatement(await api.statement(attempt.encounter.id), attempt.encounter)
      check()
      requireFact(statement.accountId === attempt.statement.accountId && statement.currencyCode === attempt.statement.currencyCode,
        '回读费用账户与原操作不一致')
      const orders = requireCompletionPaymentOrders(await api.paymentOrders(statement.accountId), statement)
      check()
      if (attempt.kind === 'payment' && payment) {
        const persisted = requirePayment(await api.paymentOrder(payment.id), attempt, statement)
        check()
        requireFact(persisted.id === payment.id && persisted.orderNo === payment.orderNo && persisted.revision >= payment.revision,
          '支付订单回读身份或版本不一致')
        const listed = orders.filter(row => row.id === persisted.id)
        requireFact(listed.length === 1, '支付订单未出现在当前账户中')
        const listedOrder = requirePayment(listed[0], attempt, statement)
        requireFact(listedOrder.revision === persisted.revision && listedOrder.status === persisted.status
          && listedOrder.capturedAmount === persisted.capturedAmount && listedOrder.refundedAmount === persisted.refundedAmount,
          '支付列表和订单详情状态不同步')
      } else if (attempt.kind === 'invoice' && invoice) {
        requireFact(Array.isArray(statement.invoices), '回读结算凭证列表缺失')
        const matches = statement.invoices.filter(row => row?.id === invoice!.id)
        requireFact(matches.length === 1, '结算凭证未出现在当前账户中')
        const persisted = requireInvoice(matches[0], attempt)
        const settlements = statement.settlements.filter(row => row.legacyInvoiceId === invoice!.id)
        requireFact(settlements.length === 1 && settlements[0].settlementScene === 'OUTPATIENT'
          && settlements[0].settlementType === (invoice.invoiceType === 'CREDIT' ? 'REVERSAL' : 'NORMAL')
          && sameAmount(settlements[0].grossAmount, persisted.grossAmount)
          && sameAmount(settlements[0].netAmount, persisted.netAmount)
          && sameAmount(settlements[0].discountAmount, persisted.discountAmount)
          && finite(settlements[0].roundingAmount)
          && sameAmount(persisted.netAmount, persisted.grossAmount + settlements[0].roundingAmount - persisted.discountAmount), '正式结算单未确认')
      }
      return { statement, orders, assertCurrent: check, confirmApplied: () => { check(); pending = undefined } }
    } catch (error) {
      const detail = errorMessage(error).replace(/^诊间结算操作未确认：/, '')
      throw new Error(`诊间结算操作未确认：${detail}。${pending
        ? '原请求已保留，远端可能已受理，请使用“核实上次结算操作”继续'
        : '请求被拒绝，请重新加载资料并检查输入'}`)
    } finally { busy = false }
  }
  return {
    hasPending: () => Boolean(pending),
    async pay(api: BillingApi, encounter: Encounter, statement: AccountStatement, command: SettlementPaymentCommand, assertCurrent: () => void) {
      assertCurrent()
      requireFact(!pending && !busy, '存在尚未核实的结算操作')
      const confirmed = requireCompletionStatement(statement, encounter)
      requireFact(text(command.idempotencyKey) && text(command.paymentMethodCode) && finite(command.amount) && command.amount > 0
        && (command.roundingAdjustment === undefined || finite(command.roundingAdjustment))
        && confirmed.settlements.some(row => row.id === command.settlementId && row.settlementScene === 'OUTPATIENT'
          && ['PRICED', 'PAYMENT_PENDING', 'PARTIAL'].includes(row.status)), '支付命令或结算单无效')
      pending = { kind: 'payment', api, encounter: structuredClone(encounter), statement: structuredClone(confirmed), command: structuredClone(command) }
      return execute(api, assertCurrent)
    },
    async issue(api: BillingApi, encounter: Encounter, statement: AccountStatement, assertCurrent: () => void) {
      assertCurrent()
      requireFact(!pending && !busy, '存在尚未核实的结算操作')
      const confirmed = requireCompletionStatement(statement, encounter), charges = invoiceCharges(confirmed)
      pending = { kind: 'invoice', api, encounter: structuredClone(encounter), statement: structuredClone(confirmed), charges,
        invoiceNo: `INV-${globalThis.crypto.randomUUID()}` }
      return execute(api, assertCurrent)
    },
    retry(api: BillingApi, encounter: Encounter, assertCurrent: () => void) {
      assertCurrent()
      requireFact(pending && ['id', 'residentId', 'organizationId', 'departmentId'].every(key =>
        pending!.encounter[key as keyof Encounter] === encounter[key as keyof Encounter]), '当前患者或就诊与原操作不同')
      return execute(api, assertCurrent)
    },
  }
}
