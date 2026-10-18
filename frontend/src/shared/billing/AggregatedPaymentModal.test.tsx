import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PaymentOrder, PaymentChannelCapability } from '../api/billingApi'
import { AggregatedPaymentModal } from './AggregatedPaymentModal'

const order: PaymentOrder = {
  id: 'order-1', revision: 1, patientAccountId: 'acc-1', settlementId: 'settlement-1', orderNo: 'PO1',
  idempotencyKey: 'KEY1', businessScene: 'OUTPATIENT', paymentSceneCode: 'CASHIER', paymentMethodCode: 'WECHAT',
  paymentMethodName: '微信支付', orderType: 'SETTLEMENT_PAY', status: 'PENDING', requestedAmount: 50,
  capturedAmount: 0, refundedAmount: 0, currencyCode: 'CNY', createdAt: '', updatedAt: '', duplicate: false, events: [],
}
const code = '134567890123456789'
const channel: PaymentChannelCapability = {
  paymentMethodCode: 'WECHAT', available: true,
  capabilities: { adapterCode: 'WECHAT_DIRECT', interaction: 'AUTHORIZATION_CODE', querySupported: true,
    refundSupported: true, confirmBeforeCancel: true,
    authorizationCodeRule: { pattern: '1[0-5][0-9]{16}', minLength: 18, maxLength: 18 } },
}
function setup(create = vi.fn().mockResolvedValue(order)) {
  const props = {
    open: true, onClose: vi.fn(), paymentMethodCode: 'WECHAT', paymentMethodName: '微信支付', amount: 50,
    settlementId: 'settlement-1', onPaymentSuccess: vi.fn(),
    api: { billing: { paymentChannelCapabilities: vi.fn().mockResolvedValue(channel), createPaymentOrder: create, queryPaymentOrder: vi.fn(), cancelPaymentOrder: vi.fn() } },
  }
  return { props, user: userEvent.setup() }
}
describe('AggregatedPaymentModal', () => {
  it('submits the full code transiently and uses a fixed terminal identity', async () => {
    const { props, user } = setup(vi.fn().mockResolvedValue({ ...order, status: 'SUCCEEDED' }))
    render(<AggregatedPaymentModal {...props} />)
    expect(await screen.findByLabelText(/^患者付款码/)).toHaveFocus()
    await user.type(screen.getByLabelText(/^患者付款码/), `${code}{Enter}`)
    expect(props.api.billing.createPaymentOrder).toHaveBeenCalledWith('settlement-1', expect.objectContaining({
      authorizationCode: code, terminalCode: 'CASHIER-BARCODE', amount: 50,
    }))
    expect(screen.getByLabelText(/^患者付款码/)).toHaveValue('')
    expect(props.onPaymentSuccess).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/模拟患者/)).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
  it('rejects a code from a different channel without making a request', async () => {
    const { props, user } = setup(); render(<AggregatedPaymentModal {...props} />)
    await user.type(await screen.findByLabelText(/^患者付款码/), '284567890123456789{Enter}')
    expect(props.api.billing.createPaymentOrder).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('有效患者付款码')
  })
  it('closes a pending payment without cancelling it or submitting again', async () => {
    const { props, user } = setup(); render(<AggregatedPaymentModal {...props} />)
    await user.type(await screen.findByLabelText(/^患者付款码/), `${code}{Enter}`)
    expect(screen.getByLabelText(/^患者付款码/)).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(props.api.billing.cancelPaymentOrder).not.toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalled()
  })
  it('queries the existing pending order and reports success once', async () => {
    const { props, user } = setup(); props.api.billing.queryPaymentOrder.mockResolvedValue({ ...order, status: 'SUCCEEDED' })
    render(<AggregatedPaymentModal {...props} />)
    await user.type(await screen.findByLabelText(/^患者付款码/), `${code}{Enter}`)
    await user.click(screen.getByRole('button', { name: '核验支付结果' }))
    expect(props.api.billing.queryPaymentOrder).toHaveBeenCalledWith('order-1')
    expect(props.api.billing.createPaymentOrder).toHaveBeenCalledTimes(1)
    expect(props.onPaymentSuccess).toHaveBeenCalledTimes(1)
  })
  it('reuses the idempotency key after an ambiguous network failure', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(order)
    const { props, user } = setup(create); render(<AggregatedPaymentModal {...props} />)
    await user.type(await screen.findByLabelText(/^患者付款码/), `${code}{Enter}`)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('同一支付请求'))
    await user.type(await screen.findByLabelText(/^患者付款码/), `${code}{Enter}`)
    expect(create.mock.calls[0][1].idempotencyKey).toBe(create.mock.calls[1][1].idempotencyKey)
  })
  it('ignores a late success after switching settlement context', async () => {
    let resolve!: (value: PaymentOrder) => void
    const { props, user } = setup(vi.fn().mockReturnValue(new Promise<PaymentOrder>(r => { resolve = r })))
    const view = render(<AggregatedPaymentModal {...props} />)
    await user.type(await screen.findByLabelText(/^患者付款码/), `${code}{Enter}`)
    view.rerender(<AggregatedPaymentModal {...props} settlementId="settlement-2" />)
    await act(async () => resolve({ ...order, status: 'SUCCEEDED' }))
    expect(props.onPaymentSuccess).not.toHaveBeenCalled()
    expect(await screen.findByLabelText(/^患者付款码/)).toHaveValue('')
  })
  it('accepts a new channel and its declared code rule without a channel-name branch', async () => {
    const { props, user } = setup(vi.fn().mockResolvedValue({ ...order, status: 'SUCCEEDED' }))
    props.paymentMethodCode = 'NEW_BARCODE'
    props.paymentMethodName = '新增渠道'
    props.api.billing.paymentChannelCapabilities.mockResolvedValue({ ...channel, paymentMethodCode: 'NEW_BARCODE',
      capabilities: { ...channel.capabilities!, adapterCode: 'NEW_PROVIDER', authorizationCodeRule: { pattern: '[A-Z0-9]{8}', minLength: 8, maxLength: 8 } } })
    render(<AggregatedPaymentModal {...props} />)
    await user.type(await screen.findByLabelText(/^患者付款码/), 'ABC12345{Enter}')
    expect(props.api.billing.createPaymentOrder).toHaveBeenCalledWith('settlement-1', expect.objectContaining({
      paymentMethodCode: 'NEW_BARCODE', authorizationCode: 'ABC12345',
    }))
  })
  it('uses direct interaction without requesting an authorization code or unsupported queries', async () => {
    const { props, user } = setup()
    props.api.billing.paymentChannelCapabilities.mockResolvedValue({ ...channel, capabilities: {
      adapterCode: 'DIRECT_TERMINAL', interaction: 'DIRECT', querySupported: false, refundSupported: false, confirmBeforeCancel: false,
    } })
    render(<AggregatedPaymentModal {...props} />)
    await screen.findByText('确认金额后发起渠道收款。')
    expect(screen.queryByLabelText(/^患者付款码/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认收款' }))
    expect(props.api.billing.createPaymentOrder).toHaveBeenCalledWith('settlement-1', expect.objectContaining({
      authorizationCode: undefined, terminalCode: 'CASHIER-CHANNEL',
    }))
    expect(screen.queryByRole('button', { name: '核验支付结果' })).not.toBeInTheDocument()
    expect(props.api.billing.queryPaymentOrder).not.toHaveBeenCalled()
  })
  it.each(['missing-merchant', 'load-failure', 'wrong-channel', 'unsupported-interaction'])(
    'blocks submission when capability discovery fails: %s', async kind => {
      const { props, user } = setup()
      if (kind === 'load-failure') props.api.billing.paymentChannelCapabilities.mockRejectedValue(new Error('network'))
      else props.api.billing.paymentChannelCapabilities.mockResolvedValue(kind === 'missing-merchant'
        ? { ...channel, available: false, unavailableReason: '机构未配置商户' }
        : kind === 'wrong-channel' ? { ...channel, paymentMethodCode: 'OTHER' }
        : { ...channel, capabilities: { ...channel.capabilities!, interaction: 'UNSUPPORTED' } })
      render(<AggregatedPaymentModal {...props} />)
      await screen.findByRole('alert')
      const submit = screen.getByRole('button', { name: '确认收款' })
      expect(submit).toBeDisabled()
      await user.click(submit)
      expect(props.api.billing.createPaymentOrder).not.toHaveBeenCalled()
    },
  )
  it('ignores capability results from a previous institution', async () => {
    const { props } = setup()
    let resolveOld!: (value: PaymentChannelCapability) => void
    props.api.billing.paymentChannelCapabilities.mockReturnValueOnce(new Promise<PaymentChannelCapability>(r => { resolveOld = r }))
      .mockResolvedValueOnce({ ...channel, available: false, unavailableReason: '新机构未配置商户' })
    const view = render(<AggregatedPaymentModal {...props} contextKey="org-1" />)
    view.rerender(<AggregatedPaymentModal {...props} contextKey="org-2" />)
    await screen.findByText('新机构未配置商户')
    await act(async () => resolveOld(channel))
    expect(screen.getByRole('button', { name: '确认收款' })).toBeDisabled()
    expect(screen.queryByLabelText(/^患者付款码/)).not.toBeInTheDocument()
  })

})
