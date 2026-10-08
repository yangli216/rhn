import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { RhnApi } from '../../shared/rhnApi'
import { RefundManagementWorkspace } from './RefundManagementWorkspace'

const context = { organization: { id: 'org-1', name: '测试机构' }, department: { id: 'dept-1', name: '门诊' } } as ClinicalContext
const workItem = { encounterId: 'enc-1', accountId: 'acc-1', residentName: '退费患者', status: 'SETTLED', currencyCode: 'CNY' }
const payment = { id: 'pay-1', paymentNo: 'PAY-1', paymentType: 'PAYMENT', paymentMethodCode: 'CASH',
  amount: 100, currencyCode: 'CNY', paidAt: '2026-10-03T01:00:00Z', status: 'COMPLETED' }
const statement = { accountId: 'acc-1', encounterId: 'enc-1', currencyCode: 'CNY', chargeAmount: 100,
  paymentAmount: 100, refundAmount: 70, accountBalance: -30, invoices: [], payments: [payment] }
const allowedItem = { chargeItemId: 'charge-1', itemName: '未执行项目', sourceType: 'SERVICE_REQUEST',
  totalAmount: 50, quantity: 1, allowed: true, statusBadgeText: '未执行', statusTone: 'success' }
const check = { accountId: 'acc-1', encounterId: 'enc-1', currencyCode: 'CNY', eligibleForRefund: true,
  overallDecision: 'ALLOWED', totalPaidAmount: 100, refundableAmount: 50, items: [allowedItem],
  refundablePayments: [{ paymentId: 'pay-1', amount: 100, refundedAmount: 70, refundableAmount: 30, currencyCode: 'CNY' }] }

function setup(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const billing = { worklist: vi.fn().mockResolvedValue([workItem]), statement: vi.fn().mockResolvedValue(statement),
    refundPreCheck: vi.fn().mockResolvedValue(check), directRefund: vi.fn().mockResolvedValue({ status: 'SUCCEEDED' }),
    createRefundOrder: vi.fn().mockResolvedValue({ status: 'SUCCEEDED' }), ...overrides }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/billing/refunds?encounterId=enc-1']}>
      <RefundManagementWorkspace api={{ billing } as unknown as RhnApi} clinicalContext={context} />
    </MemoryRouter>
  </QueryClientProvider>)
  return { billing, client }
}

describe('refund evidence and failure states', () => {
  it.each(['refundPreCheck', 'statement'])('never reports passed verification when %s fails', async (query) => {
    const { billing } = setup({ [query]: vi.fn().mockRejectedValue(new Error('服务不可用')) })
    await screen.findByText('退费资料未核实')
    expect(screen.queryByText(/协同校验通过/)).not.toBeInTheDocument()
    expect(screen.queryByText('原收费总额')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认未发药直接退款/ })).not.toBeInTheDocument()
    expect(billing.directRefund).not.toHaveBeenCalled()
  })

  it.each([null, {}, { ...check, overallDecision: 'UNKNOWN' }, { ...check, encounterId: 'another' },
    { ...check, items: [{ ...allowedItem, allowed: undefined }] },
    { ...check, items: [{ ...allowedItem, allowed: false }] },
    { ...check, refundablePayments: [] }].map((data) => ({ data })))(
    'rejects missing, malformed or mismatched verification: $data', async ({ data }) => {
      setup({ refundPreCheck: vi.fn().mockResolvedValue(data) })
      await screen.findByText('退费资料未核实')
      expect(screen.queryByText(/协同校验通过/)).not.toBeInTheDocument()
    },
  )

  it('does not treat a queue failure as an empty queue', async () => {
    setup({ worklist: vi.fn().mockRejectedValue(new Error('队列不可用')) })
    await screen.findByText('退费队列加载失败')
    expect(screen.queryByText('暂无符合就诊')).not.toBeInTheDocument()
  })

  it('keeps partial approval distinct and does not invent a reason for blocked items', async () => {
    setup({ refundPreCheck: vi.fn().mockResolvedValue({ ...check, overallDecision: 'PARTIAL',
      items: [allowedItem, { ...allowedItem, chargeItemId: 'blocked', itemName: '已执行项目', allowed: false,
        statusBadgeText: '已执行', statusTone: 'danger' }] }) })
    await screen.findByText('部分项目可退 · 请逐项核对')
    expect(screen.queryByText(/协同校验通过/)).not.toBeInTheDocument()
    expect(screen.getByText('不允许直接退费，未提供阻断说明')).toBeInTheDocument()
  })

  it('requires a genuine reason and caps both refund modes at the remaining payment balance', async () => {
    const { billing } = setup()
    await screen.findByText('协同审批防损门禁')
    const reason = screen.getByLabelText('退款原因')
    expect(reason).toHaveValue('')
    const direct = screen.getByRole('button', { name: /确认未发药直接退款/ })
    fireEvent.change(reason, { target: { value: '患者取消未执行项目' } })
    expect(screen.getByLabelText('退款金额')).toHaveValue(50)
    expect(direct).toBeDisabled()
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '30' } })
    expect(direct).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /常规负余额冲退/ }))
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '31' } })
    expect(screen.getByRole('button', { name: /确认常规退款/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /确认常规退款/ }))
    await waitFor(() => expect(billing.createRefundOrder).toHaveBeenCalledWith('pay-1',
      expect.objectContaining({ amount: 30, reason: '患者取消未执行项目' })))
  })

  it('invalidates cached approval after failure and supports explicit revalidation', async () => {
    const { billing, client } = setup()
    await screen.findByText('协同审批防损门禁')
    fireEvent.change(screen.getByLabelText('退款原因'), { target: { value: '患者取消' } })
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '30' } })
    expect(screen.getByRole('button', { name: /确认未发药直接退款/ })).toBeEnabled()
    billing.refundPreCheck.mockRejectedValue(new Error('重新核验失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['refund-precheck'] }) })
    await screen.findByText('退费资料未核实')
    expect(screen.queryByText(/协同校验通过/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认未发药直接退款/ })).not.toBeInTheDocument()
    billing.refundPreCheck.mockResolvedValue(check)
    fireEvent.click(screen.getByRole('button', { name: '重新核验退费资料' }))
    await screen.findByText('协同审批防损门禁')
    expect(billing.directRefund).not.toHaveBeenCalled()
  })
})
