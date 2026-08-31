import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PaymentOrder } from '../api/billingApi'
import { SettlementPaymentPanel } from './SettlementPaymentPanel'

const processingCashOrder: PaymentOrder = {
  id: 'payment-order-1',
  revision: 2,
  patientAccountId: 'account-1',
  settlementId: 'settlement-1',
  orderNo: 'PO202608300053208V32PC3',
  idempotencyKey: 'payment-command-1',
  businessScene: 'OUTPATIENT',
  paymentSceneCode: 'CASHIER',
  paymentMethodCode: 'CASH',
  paymentMethodName: '现金',
  orderType: 'SETTLEMENT_PAY',
  status: 'PROCESSING',
  requestedAmount: 28.6,
  capturedAmount: 0,
  refundedAmount: 0,
  currencyCode: 'CNY',
  createdAt: '2026-08-30T05:32:08Z',
  updatedAt: '2026-08-30T05:32:08Z',
  duplicate: false,
  events: [],
}

describe('SettlementPaymentPanel payment recovery', () => {
  it('keeps duplicate collection blocked and lets the cashier recover an interrupted cash order', async () => {
    const user = userEvent.setup()
    const onRecoverOrder = vi.fn().mockResolvedValue(undefined)
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'ORA-OPD-INV-133204', outstandingAmount: 28.6, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }]}
      orders={[processingCashOrder]}
      onRecoverOrder={onRecoverOrder}
      onSubmit={onSubmit}
    />)

    expect(screen.getByText('处理中')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认收款并记账' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '查询并恢复' }))

    expect(onRecoverOrder).toHaveBeenCalledWith(processingCashOrder)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('allows a zero balance settlement without requiring a payment method', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(<SettlementPaymentPanel
      settlements={[{ id: 'draft-settlement', code: '本次待结算费用', outstandingAmount: 0, currencyCode: 'CNY' }]}
      methods={[]}
      orders={[]}
      actionLabel="结算"
      onSubmit={onSubmit}
    />)

    expect(await screen.findByText('本次无需收款')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: '结算' })
    expect(button).toBeEnabled()
    await user.click(button)
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      settlementId: 'draft-settlement', paymentMethodCode: '', amount: 0,
    }))
  })

  it('separates medical insurance settlement from the patient payment method', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 6, currencyCode: 'CNY',
        insuranceReady: true, insuranceAmount: 10, personalAccountAmount: 2 }]}
      methods={[{ code: 'CASH', name: '现金' }, { code: 'MEDICAL_INSURANCE', name: '医保支付' }]}
      orders={[]}
      showSettlementMode
      actionLabel="结算"
      onSubmit={onSubmit}
    />)

    expect(screen.getByLabelText('结算类型')).toBeInTheDocument()
    expect(screen.queryByText('医保支付')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('结算类型'))
    await user.click(await screen.findByRole('option', { name: '医保结算' }))

    expect(screen.getByLabelText('个人自付支付方式')).toBeInTheDocument()
    expect(screen.getByLabelText('个人自付金额')).toHaveValue(6)
    expect(screen.getByText(/医保基金.*¥10.00.*个人账户.*¥2.00.*个人自付待收.*¥6.00/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '结算' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      settlementId: 'settlement-1', settlementModeCode: 'MEDICAL_INSURANCE',
      paymentMethodCode: 'CASH', amount: 6,
    }))
  })
})
