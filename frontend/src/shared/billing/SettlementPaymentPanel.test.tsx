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

  it('calculates cash change and validates tendered amount for cash payments', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 20, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }]}
      orders={[]}
      onSubmit={onSubmit}
    />)

    expect(screen.getByText('缴款金额：')).toBeInTheDocument()
    expect(screen.getByText('¥0.00')).toBeInTheDocument()

    const preset50 = screen.getByRole('button', { name: '¥50' })
    await user.click(preset50)
    expect(screen.getByText('¥30.00')).toBeInTheDocument()
    expect(screen.getByText(/应找零给患者/)).toBeInTheDocument()

    const tenderInput = screen.getByPlaceholderText('20')
    await user.clear(tenderInput)
    await user.type(tenderInput, '10')
    expect(screen.getByText(/缴款不足，还差 ¥10.00/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认收款并记账' })).toBeDisabled()
  })

  it('shows clear error notice when medical insurance interface is unintegrated and pending', async () => {
    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 15, currencyCode: 'CNY',
        insuranceReady: false }]}
      methods={[{ code: 'CASH', name: '现金' }]}
      orders={[]}
      showSettlementMode
      settlementModeCode="MEDICAL_INSURANCE"
      onSubmit={vi.fn()}
    />)

    expect(screen.getByText('医保接口未对接')).toBeInTheDocument()
    expect(screen.getByText(/当前系统未对接国家\/地方医保平台/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '医保接口未对接，请改选自费' })).toBeDisabled()
  })

  it('shows clear error notice when unintegrated payment method like WeChat or Alipay is selected', async () => {
    const user = userEvent.setup()
    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 15, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }, { code: 'WECHAT', name: '微信支付' }]}
      orders={[]}
      onSubmit={vi.fn()}
    />)

    await user.click(screen.getByRole('button', { name: /微信支付/ }))

    expect(screen.getByText('接口未对接')).toBeInTheDocument()
    expect(screen.getByText(/【微信支付接口未对接】当前系统未配置在线商户支付网关/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '微信支付未对接，请改选现金' })).toBeDisabled()
  })

  it('verifies that physical cash drawer button is removed per requirements', async () => {
    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 20, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }]}
      orders={[]}
      onSubmit={vi.fn()}
    />)

    expect(screen.queryByRole('button', { name: /开钱箱/ })).not.toBeInTheDocument()
  })

  it('delegates to onInitiateScanPay when WeChat or Alipay is selected and onInitiateScanPay is provided', async () => {
    const user = userEvent.setup()
    const onInitiateScanPay = vi.fn()

    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 38.5, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }, { code: 'WECHAT', name: '微信支付' }]}
      orders={[]}
      onInitiateScanPay={onInitiateScanPay}
      onSubmit={vi.fn()}
    />)

    await user.click(screen.getByRole('button', { name: /微信支付/ }))

    // Notice should NOT be displayed when onInitiateScanPay is provided
    expect(screen.queryByText('接口未对接')).not.toBeInTheDocument()
    const scanPayBtn = screen.getByRole('button', { name: '发起扫码收款' })
    expect(scanPayBtn).toBeEnabled()

    await user.click(scanPayBtn)
    expect(onInitiateScanPay).toHaveBeenCalledWith({
      settlementId: 'settlement-1',
      paymentMethodCode: 'WECHAT',
      paymentMethodName: '微信支付',
      amount: 38.5,
    })
  })

  it('renders CHS pre-settlement guide and invokes onPreSettleInsurance when integrated', async () => {
    const user = userEvent.setup()
    const onPreSettleInsurance = vi.fn().mockResolvedValue({})

    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 50, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }]}
      orders={[]}
      showSettlementMode
      settlementModeCode="MEDICAL_INSURANCE"
      insuranceIntegrated
      onPreSettleInsurance={onPreSettleInsurance}
      onSubmit={vi.fn()}
    />)

    expect(screen.getByText('CHS 国家医保中台')).toBeInTheDocument()
    expect(screen.getByText('待执行门诊医保预结算')).toBeInTheDocument()
    const preSettleBtn = screen.getByRole('button', { name: '立即试算医保' })
    expect(preSettleBtn).toBeEnabled()

    await user.click(preSettleBtn)
    expect(onPreSettleInsurance).toHaveBeenCalledWith('settlement-1')
  })

  it('renders CHS breakdown card and allows direct settlement when cash amount is zero', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancelInsurancePreSettle = vi.fn()

    const insuranceClaimView = {
      claimId: 'claim-101',
      revision: 1,
      settlementId: 'settlement-1',
      patientAccountId: 'acc-1',
      claimNo: 'CLM-101',
      settlementNo: 'SETL-101',
      status: 'PRE_SETTLED' as const,
      regionCode: '360100',
      insuranceTypeCode: '310',
      externalPreSettlementNo: 'CHS-PRE-20260904001',
      grossAmount: 120,
      insuranceFundAmount: 96,
      personalAccountAmount: 24,
      patientCashAmount: 0,
      otherFundAmount: 0,
      currencyCode: 'CNY',
    }

    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 120, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }]}
      orders={[]}
      showSettlementMode
      settlementModeCode="MEDICAL_INSURANCE"
      insuranceIntegrated
      insuranceClaimView={insuranceClaimView}
      onCancelInsurancePreSettle={onCancelInsurancePreSettle}
      onSubmit={onSubmit}
    />)

    expect(screen.getByText('国家医保预结算成功')).toBeInTheDocument()
    expect(screen.getByText(/流水号: CHS-PRE-20260904001/)).toBeInTheDocument()
    expect(screen.getByText('¥96.00')).toBeInTheDocument() // 统筹
    expect(screen.getByText('¥24.00')).toBeInTheDocument() // 个账
    expect(screen.getByText(/本次费用由医保统筹与个账全额抵扣，零现金自付/)).toBeInTheDocument()

    // 零自付无需支付方式，主按钮为确认医保结算并记账
    const confirmBtn = screen.getByRole('button', { name: '确认医保结算并记账' })
    expect(confirmBtn).toBeEnabled()
    await user.click(confirmBtn)
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      settlementId: 'settlement-1',
      settlementModeCode: 'MEDICAL_INSURANCE',
      amount: 0,
    }))

    // 取消试算测试
    const cancelBtn = screen.getByRole('button', { name: '取消试算 (改选自费)' })
    await user.click(cancelBtn)
    expect(onCancelInsurancePreSettle).toHaveBeenCalled()
  })

  it('renders CHS breakdown card and supports cash checkout when cash amount > 0', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    const insuranceClaimView = {
      claimId: 'claim-102',
      revision: 1,
      settlementId: 'settlement-1',
      patientAccountId: 'acc-1',
      claimNo: 'CLM-102',
      settlementNo: 'SETL-102',
      status: 'PRE_SETTLED' as const,
      regionCode: '360100',
      insuranceTypeCode: '310',
      externalPreSettlementNo: 'CHS-PRE-20260904002',
      grossAmount: 150,
      insuranceFundAmount: 80,
      personalAccountAmount: 20,
      patientCashAmount: 50,
      otherFundAmount: 0,
      currencyCode: 'CNY',
    }

    render(<SettlementPaymentPanel
      settlements={[{ id: 'settlement-1', code: 'INV-1', outstandingAmount: 150, currencyCode: 'CNY' }]}
      methods={[{ code: 'CASH', name: '现金' }]}
      orders={[]}
      showSettlementMode
      settlementModeCode="MEDICAL_INSURANCE"
      insuranceIntegrated
      insuranceClaimView={insuranceClaimView}
      onSubmit={onSubmit}
    />)

    expect(screen.getByText('国家医保预结算成功')).toBeInTheDocument()
    expect(screen.getByText('¥80.00')).toBeInTheDocument() // 统筹
    expect(screen.getByText('¥50.00')).toBeInTheDocument() // 自付现金

    // 自付部分支持现金收银与速算找零
    expect(screen.getByLabelText('个人自付金额')).toHaveValue(50)
    expect(screen.getByText('缴款金额：')).toBeInTheDocument()

    const preset100 = screen.getByRole('button', { name: '¥100' })
    await user.click(preset100)
    expect(screen.getByText(/应找零给患者 ¥50.00/)).toBeInTheDocument() // 找零 50

    const submitBtn = screen.getByRole('button', { name: '确认收款并记账' })
    await user.click(submitBtn)
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      settlementId: 'settlement-1',
      settlementModeCode: 'MEDICAL_INSURANCE',
      paymentMethodCode: 'CASH',
      amount: 50,
    }))
  })
})

