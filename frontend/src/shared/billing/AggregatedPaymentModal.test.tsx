import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PaymentOrder } from '../api/billingApi'
import { AggregatedPaymentModal } from './AggregatedPaymentModal'

const mockOrder: PaymentOrder = {
  id: 'order-1001',
  revision: 1,
  patientAccountId: 'acc-1',
  settlementId: 'settlement-1',
  orderNo: 'PO20260903001',
  idempotencyKey: 'KEY-1',
  businessScene: 'OUTPATIENT',
  paymentSceneCode: 'CASHIER',
  paymentMethodCode: 'WECHAT',
  paymentMethodName: '微信支付',
  orderType: 'SETTLEMENT_PAY',
  status: 'SUCCEEDED',
  requestedAmount: 50.0,
  capturedAmount: 50.0,
  refundedAmount: 0,
  currencyCode: 'CNY',
  createdAt: '2026-09-03T10:00:00Z',
  updatedAt: '2026-09-03T10:00:00Z',
  duplicate: false,
  events: [],
}

describe('AggregatedPaymentModal', () => {
  it('renders modal details and executes barcode payment submission', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onPaymentSuccess = vi.fn()
    const createPaymentOrder = vi.fn().mockResolvedValue(mockOrder)
    const queryPaymentOrder = vi.fn()
    const cancelPaymentOrder = vi.fn()

    const api = {
      billing: {
        createPaymentOrder,
        queryPaymentOrder,
        cancelPaymentOrder,
      },
    }

    render(
      <AggregatedPaymentModal
        open
        onClose={onClose}
        paymentMethodCode="WECHAT"
        paymentMethodName="微信支付"
        amount={50.0}
        settlementId="settlement-1"
        settlementCode="INV-20260903-01"
        onPaymentSuccess={onPaymentSuccess}
        api={api}
      />,
    )

    expect(screen.getByText('聚合收单 · 微信支付')).toBeInTheDocument()
    expect(screen.getByText('50.00')).toBeInTheDocument()
    expect(screen.getByText(/被扫模式/)).toBeInTheDocument()

    // Test simulate scan button
    const simulateBtn = screen.getByRole('button', { name: /模拟患者付款码扫入/ })
    await user.click(simulateBtn)

    expect(createPaymentOrder).toHaveBeenCalledWith(
      'settlement-1',
      expect.objectContaining({
        businessScene: 'OUTPATIENT',
        paymentSceneCode: 'CASHIER',
        paymentMethodCode: 'WECHAT',
        amount: 50.0,
      }),
    )

    await waitFor(() => {
      expect(onPaymentSuccess).toHaveBeenCalledWith(mockOrder)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('switches to dynamic QR mode and initiates QR code generation', async () => {
    const user = userEvent.setup()
    const pendingOrder: PaymentOrder = {
      ...mockOrder,
      status: 'PENDING',
      capturedAmount: 0,
    }
    const createPaymentOrder = vi.fn().mockResolvedValue(pendingOrder)
    const queryPaymentOrder = vi.fn().mockResolvedValue(mockOrder)
    const cancelPaymentOrder = vi.fn().mockResolvedValue(mockOrder)

    const api = {
      billing: {
        createPaymentOrder,
        queryPaymentOrder,
        cancelPaymentOrder,
      },
    }

    render(
      <AggregatedPaymentModal
        open
        onClose={vi.fn()}
        paymentMethodCode="ALIPAY"
        paymentMethodName="支付宝"
        amount={88.0}
        settlementId="settlement-2"
        settlementCode="INV-20260903-02"
        onPaymentSuccess={vi.fn()}
        api={api}
      />,
    )

    const qrTab = screen.getByRole('tab', { name: /主扫模式/ })
    await user.click(qrTab)

    expect(createPaymentOrder).toHaveBeenCalledWith(
      'settlement-2',
      expect.objectContaining({
        paymentMethodCode: 'ALIPAY',
        amount: 88.0,
        terminalCode: 'CASHIER-ONLINE_DYNAMIC_QR',
      }),
    )

    expect(await screen.findByLabelText('医院动态收款二维码')).toBeInTheDocument()
    expect(screen.getByText('等待患者付款中…')).toBeInTheDocument()
  })

  it('cancels active order when cashier clicks cancel payment', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const pendingOrder: PaymentOrder = {
      ...mockOrder,
      status: 'PENDING',
      capturedAmount: 0,
    }
    const createPaymentOrder = vi.fn().mockResolvedValue(pendingOrder)
    const queryPaymentOrder = vi.fn()
    const cancelPaymentOrder = vi.fn().mockResolvedValue({ ...pendingOrder, status: 'CANCELLED' })

    const api = {
      billing: {
        createPaymentOrder,
        queryPaymentOrder,
        cancelPaymentOrder,
      },
    }

    render(
      <AggregatedPaymentModal
        open
        onClose={onClose}
        paymentMethodCode="WECHAT"
        paymentMethodName="微信支付"
        amount={30.0}
        settlementId="settlement-3"
        onPaymentSuccess={vi.fn()}
        api={api}
      />,
    )

    // Trigger simulate to create an active pending order
    await user.click(screen.getByRole('button', { name: /模拟患者付款码扫入/ }))
    expect(createPaymentOrder).toHaveBeenCalled()

    // Click cancel button
    const cancelBtn = screen.getByRole('button', { name: '取消收款并关闭' })
    await user.click(cancelBtn)

    expect(cancelPaymentOrder).toHaveBeenCalledWith(pendingOrder.id)
    expect(onClose).toHaveBeenCalled()
  })
})
