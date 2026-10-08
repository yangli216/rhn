import type { AccountStatement, RefundPreCheckSummaryView } from '../../shared/api/billingApi'

const finiteAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nonnegativeAmount = (value: unknown): value is number => finiteAmount(value) && value >= 0

export function requireRefundStatement(value: AccountStatement, encounterId: string, accountId: string) {
  if (!value || value.encounterId !== encounterId || value.accountId !== accountId
    || !value.currencyCode || !finiteAmount(value.accountBalance)
    || ![value.chargeAmount, value.paymentAmount, value.refundAmount].every(finiteAmount)
    || !Array.isArray(value.payments) || !Array.isArray(value.invoices)
    || value.payments.some((payment) => !payment || !payment.id || !finiteAmount(payment.amount)
      || !payment.currencyCode)) {
    throw new Error('原收费账单返回不完整或与当前就诊不一致，无法办理退款')
  }
  return value
}

export function requireRefundPreCheck(value: RefundPreCheckSummaryView, encounterId: string, accountId: string) {
  if (!value || value.encounterId !== encounterId || value.accountId !== accountId
    || !['ALLOWED', 'PARTIAL', 'BLOCKED'].includes(value.overallDecision)
    || typeof value.eligibleForRefund !== 'boolean' || !value.currencyCode
    || !nonnegativeAmount(value.totalPaidAmount) || !nonnegativeAmount(value.refundableAmount)
    || !Array.isArray(value.items) || !Array.isArray(value.refundablePayments)
    || value.items.some((item) => !item || !item.chargeItemId || typeof item.allowed !== 'boolean'
      || !nonnegativeAmount(item.totalAmount))
    || value.refundablePayments.some((payment) => !payment || !payment.paymentId
      || !nonnegativeAmount(payment.amount) || !nonnegativeAmount(payment.refundedAmount)
      || !nonnegativeAmount(payment.refundableAmount) || payment.refundableAmount > payment.amount
      || Math.abs(payment.amount - payment.refundedAmount - payment.refundableAmount) > 0.000001
      || payment.currencyCode !== value.currencyCode)
    || new Set(value.items.map((item) => String(item.chargeItemId))).size !== value.items.length
    || new Set(value.refundablePayments.map((payment) => payment.paymentId)).size !== value.refundablePayments.length) {
    throw new Error('退费核验结果不完整或与当前就诊不一致，请重新核验')
  }
  const anyAllowed = value.items.some((item) => item.allowed)
  const allAllowed = value.items.length > 0 && value.items.every((item) => item.allowed)
  if ((value.overallDecision === 'ALLOWED' && !allAllowed)
    || (value.overallDecision === 'PARTIAL' && (!anyAllowed || allAllowed))
    || (value.overallDecision === 'BLOCKED' && anyAllowed)
    || (value.eligibleForRefund && (!anyAllowed || !value.refundablePayments.some((payment) => payment.refundableAmount > 0)))) {
    throw new Error('退费汇总结论与项目或支付明细不一致，请重新核验')
  }
  return value
}
