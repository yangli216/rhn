import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { CashierClose, CashierClosePreview } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { CashierCloseCalculator } from './CashierCloseCalculator'
import { CashierCloseWorkspace } from './CashierCloseWorkspace'

const preview: CashierClosePreview = { currencyCode: 'CNY', transactionCount: 2, lines: [
  { paymentMethodCode: 'WECHAT', paymentType: 'PAYMENT', transactionCount: 1, expectedAmount: 100 },
  { paymentMethodCode: 'WECHAT', paymentType: 'REFUND', transactionCount: 1, expectedAmount: -20 },
] }
const close = { id: 'close-1', closeNo: 'CC001', status: 'CALCULATED', currencyCode: 'CNY',
  rangeFrom: '2026-10-03T00:00:00Z', rangeTo: '2026-10-03T12:00:00Z', transactionCount: 2,
  expectedAmount: 80, actualAmount: 80, differenceAmount: 0, terminalCode: 'T1',
  lines: preview.lines.map((line, index) => ({ ...line, lineNo: index + 1,
    actualAmount: line.expectedAmount + (index ? 5 : -5), differenceAmount: index ? 5 : -5, currencyCode: 'CNY' })),
} as CashierClose
const context = { organization: { id: 'org-1', name: '医院' }, department: { id: 'dept-1' } } as ClinicalContext
function renderQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}
function makeApi() {
  return { billing: { cashierClosePreview: vi.fn().mockResolvedValue(preview),
    calculateCashierClose: vi.fn().mockResolvedValue(close), confirmCashierClose: vi.fn().mockResolvedValue(close),
    cashierCloses: vi.fn().mockResolvedValue([]), dailyReconciliation: vi.fn().mockResolvedValue({
      currencyCode: 'CNY', sourceEventCount: 0, chargedEventCount: 0, discrepancyCount: 0,
      paymentAmount: 0, refundAmount: 0, lines: [],
    }),
  }, dictionaries: { resolve: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金' }]) } }
}
function calculator(api: ReturnType<typeof makeApi>) {
  return <CashierCloseCalculator api={api as unknown as RhnApi} scopeKey="org-1" terminalCode="T1"
    rangeFrom="2026-10-03T00:00" rangeTo="2026-10-03T12:00" onCalculated={vi.fn()} />
}

describe('Cashier closing actual amounts', () => {
  it('requires actual amounts for all channels and sends signed refunds', async () => {
    const api = makeApi()
    renderQuery(calculator(api))
    const payment = await screen.findByLabelText('WECHAT 收款核对金额')
    const refund = screen.getByLabelText('WECHAT 退款核对金额')
    expect(payment).toHaveValue(null)
    expect(refund).toHaveValue(null)
    expect(screen.getByRole('button', { name: '计算日结' })).toBeDisabled()
    await userEvent.type(payment, '95')
    expect(screen.getByRole('button', { name: '计算日结' })).toBeDisabled()
    await userEvent.type(refund, '15')
    await userEvent.click(screen.getByRole('button', { name: '计算日结' }))
    await waitFor(() => expect(api.billing.calculateCashierClose).toHaveBeenCalledWith(expect.objectContaining({
      actualAmounts: [{ paymentMethodCode: 'WECHAT', paymentType: 'PAYMENT', amount: 95 },
        { paymentMethodCode: 'WECHAT', paymentType: 'REFUND', amount: -15 }],
    })))
    expect(await screen.findByText(/日结已生成：CC001/)).toBeInTheDocument()
  })

  it.each([new Error('连接失败'), null])('blocks calculation when preview cannot be verified: %s', async (result) => {
    const api = makeApi()
    if (result instanceof Error) api.billing.cashierClosePreview.mockRejectedValue(result)
    else api.billing.cashierClosePreview.mockResolvedValue(result)
    renderQuery(calculator(api))
    await screen.findByRole('button', { name: '重试日结预览' })
    expect(screen.getByRole('button', { name: '计算日结' })).toBeDisabled()
    expect(api.billing.calculateCashierClose).not.toHaveBeenCalled()
  })

  it('includes declared receipts that have no book transaction', async () => {
    const api = makeApi()
    api.billing.cashierClosePreview.mockResolvedValue({ currencyCode: 'CNY', transactionCount: 0, lines: [] })
    renderQuery(calculator(api))
    await userEvent.click(await screen.findByRole('button', { name: '补录账面外收退' }))
    await waitFor(() => expect(screen.getByLabelText('补录支付方式')).toBeEnabled())
    await userEvent.click(screen.getByLabelText('补录支付方式'))
    await userEvent.click(await screen.findByRole('option', { name: /现金/ }))
    await userEvent.click(screen.getByRole('button', { name: '加入核对' }))
    await userEvent.type(screen.getByLabelText('CASH 收款核对金额'), '3')
    await userEvent.click(screen.getByRole('button', { name: '计算日结' }))
    await waitFor(() => expect(api.billing.calculateCashierClose).toHaveBeenCalledWith(expect.objectContaining({
      actualAmounts: [{ paymentMethodCode: 'CASH', paymentType: 'PAYMENT', amount: 3 }],
    })))
  })

  it('clears declared amounts when the closing range changes', async () => {
    const api = makeApi()
    renderQuery(<CashierCloseWorkspace api={api as unknown as RhnApi} clinicalContext={context} />)
    await userEvent.type(await screen.findByLabelText('WECHAT 收款核对金额'), '90')
    const endInput = screen.getByLabelText('结束时间') as HTMLInputElement
    fireEvent.change(endInput, { target: { value: `${endInput.value.slice(0, 10)}T22:59` } })
    expect(await screen.findByLabelText('WECHAT 收款核对金额')).toHaveValue(null)
    expect(screen.getByRole('button', { name: '计算日结' })).toBeDisabled()
  })

  it('requires a reason for offsetting channel differences', async () => {
    const api = makeApi()
    api.billing.cashierCloses.mockResolvedValue([close])
    renderQuery(<CashierCloseWorkspace api={api as unknown as RhnApi} clinicalContext={context} />)
    expect(await screen.findByRole('button', { name: '确认结账' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('差异原因（必填）'), '渠道归属待核查')
    await userEvent.click(screen.getByRole('button', { name: '确认结账' }))
    await waitFor(() => expect(api.billing.confirmCashierClose).toHaveBeenCalledWith(close.id, expect.objectContaining({
      differenceReason: '渠道归属待核查',
    })))
  })

  it.each([false, true])('does not present failed or malformed accounting as empty or balanced: %s', async (malformed) => {
    const api = makeApi()
    api.billing.cashierCloses.mockRejectedValue(new Error('日结查询失败'))
    api.billing.dailyReconciliation.mockRejectedValue(new Error('核对查询失败'))
    if (malformed) {
      api.billing.cashierCloses.mockResolvedValue([{ id: 'broken' }])
      api.billing.dailyReconciliation.mockResolvedValue({ lines: [] })
    }
    renderQuery(<CashierCloseWorkspace api={api as unknown as RhnApi} clinicalContext={context} />)
    await screen.findByText(/日结记录查询失败/)
    expect(screen.queryByText('暂无日结记录')).not.toBeInTheDocument()
    expect(screen.queryByText('当日暂无账务来源')).not.toBeInTheDocument()
    expect(screen.getByText('待确认 / 已结账').parentElement).toHaveTextContent('尚未核验')
  })
})
