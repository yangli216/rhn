import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
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

const settledPage = (content: unknown[], extra: Record<string, unknown> = {}) => ({ content, page: 0, size: 20,
  totalElements: content.length, totalPages: 1, first: true, last: true, ...extra })

function setup(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const billing = { worklist: vi.fn().mockResolvedValue([]),
    settledEncounters: vi.fn().mockResolvedValue(settledPage([workItem])), statement: vi.fn().mockResolvedValue(statement),
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
    expect(screen.queryByText(/^可退$/)).not.toBeInTheDocument()
    expect(screen.queryByText('原收费总额')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认退费/ })).not.toBeInTheDocument()
    expect(billing.directRefund).not.toHaveBeenCalled()
  })

  it.each([null, {}, { ...check, overallDecision: 'UNKNOWN' }, { ...check, encounterId: 'another' },
    { ...check, items: [{ ...allowedItem, allowed: undefined }] },
    { ...check, items: [{ ...allowedItem, allowed: false }] },
    { ...check, refundablePayments: [] }].map((data) => ({ data })))(
    'rejects missing, malformed or mismatched verification: $data', async ({ data }) => {
      setup({ refundPreCheck: vi.fn().mockResolvedValue(data) })
      await screen.findByText('退费资料未核实')
      expect(screen.queryByText(/^可退$/)).not.toBeInTheDocument()
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
    await screen.findByText('部分可退')
    expect(screen.queryByText(/^可退$/)).not.toBeInTheDocument()
    expect(screen.getByText('未提供不可退说明')).toBeInTheDocument()
  })

  it('requires a genuine reason and caps both refund modes at the remaining payment balance', async () => {
    const { billing } = setup()
    await screen.findByText('原收费总额')
    const reason = screen.getByLabelText('退款原因')
    expect(reason).toHaveValue('')
    const direct = screen.getByRole('button', { name: /确认退费/ })
    fireEvent.change(reason, { target: { value: '患者取消未执行项目' } })
    // 默认取 min(选中项 50, 原支付剩余可退 30)，并提示超额
    expect(screen.getByLabelText('退款金额')).toHaveValue(30)
    expect(screen.getByRole('note')).toHaveTextContent('超过该笔支付剩余可退')
    expect(direct).toBeEnabled()
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '31' } })
    expect(direct).toBeDisabled()
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '30' } })
    expect(direct).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /退药后退费/ }))
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '31' } })
    expect(screen.getByRole('button', { name: /确认退费/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /确认退费/ }))
    await waitFor(() => expect(billing.createRefundOrder).toHaveBeenCalledWith('pay-1',
      expect.objectContaining({ amount: 30, reason: '患者取消未执行项目' })))
  })

  it('invalidates cached approval after failure and supports explicit revalidation', async () => {
    const { billing, client } = setup()
    await screen.findByText('原收费总额')
    fireEvent.change(screen.getByLabelText('退款原因'), { target: { value: '患者取消' } })
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '30' } })
    expect(screen.getByRole('button', { name: /确认退费/ })).toBeEnabled()
    billing.refundPreCheck.mockRejectedValue(new Error('重新核验失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['refund-precheck'] }) })
    await screen.findByText('退费资料未核实')
    expect(screen.queryByText(/^可退$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认退费/ })).not.toBeInTheDocument()
    billing.refundPreCheck.mockResolvedValue(check)
    fireEvent.click(screen.getByRole('button', { name: '重新核验退费资料' }))
    await screen.findByText('原收费总额')
    expect(billing.directRefund).not.toHaveBeenCalled()
  })

  it('shows the unmet condition above a disabled submit button and fills reason presets', async () => {
    setup()
    await screen.findByText('原收费总额')
    expect(await screen.findByText('请填写退款原因')).toBeInTheDocument()
    expect(screen.getByLabelText('退款原因')).toHaveAttribute('placeholder')
    fireEvent.click(screen.getByRole('button', { name: '误收费' }))
    expect(screen.getByLabelText('退款原因')).toHaveValue('误收费')
    expect(screen.getByRole('button', { name: /确认退费/ })).toBeEnabled()
  })

  it('selects and clears every refundable item from the header checkbox, never blocked ones', async () => {
    setup({ refundPreCheck: vi.fn().mockResolvedValue({ ...check, overallDecision: 'PARTIAL',
      items: [allowedItem, { ...allowedItem, chargeItemId: 'charge-2', itemName: '另一项目' },
        { ...allowedItem, chargeItemId: 'reg', itemName: '挂号费', allowed: false, blockReason: '已接诊不可退' }] }) })
    await screen.findByText('原收费总额')
    const all = screen.getByLabelText('全选可退项') as HTMLInputElement
    expect(all.checked).toBe(true)
    expect(screen.getByLabelText('选择 挂号费')).toBeDisabled()
    expect(screen.getByLabelText('选择 挂号费')).not.toBeChecked()
    fireEvent.click(screen.getByLabelText('选择 另一项目'))
    expect(all.indeterminate).toBe(true)
    fireEvent.click(all)
    expect(screen.getByLabelText('选择 未执行项目')).toBeChecked()
    expect(screen.getByLabelText('选择 另一项目')).toBeChecked()
    expect(screen.getByLabelText('选择 挂号费')).not.toBeChecked()
    fireEvent.click(all)
    expect(screen.getByLabelText('选择 未执行项目')).not.toBeChecked()
    expect(screen.getByText('已接诊不可退')).toBeInTheDocument()
  })

  it('queries settled encounters server-side with paging, debounced keyword and linked encounter lookup', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ ...workItem, encounterId: `enc-${i}`, accountId: undefined,
      residentName: `患者${String(i).padStart(2, '0')}` }))
    const settledEncounters = vi.fn().mockImplementation(async (params: { encounterId?: string; page?: number }) => {
      if (params.encounterId) return settledPage([workItem])
      return settledPage(params.page === 1 ? [{ ...rows[0], encounterId: 'enc-p2', residentName: '第二页患者' }] : rows,
        { page: params.page ?? 0, totalElements: 45, totalPages: 3 })
    })
    const { billing } = setup({ settledEncounters, refundPreCheck: vi.fn().mockResolvedValue({ ...check, items: [] }) })
    // 带 encounterId 跳转：待退费里没有，用 encounterId 参数精确定位并切到已收费 tab
    await waitFor(() => expect(billing.settledEncounters).toHaveBeenCalledWith({ encounterId: 'enc-1', page: 0, size: 1 }))
    await screen.findByText(/患者 退费患者/)
    await waitFor(() => expect(billing.settledEncounters).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, size: 20, dateFrom: expect.any(String), dateTo: expect.any(String) })))
    await screen.findByLabelText('患者05，SETTLED')
    expect(screen.getByText('共 45 条记录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /已收费就诊 \(45\)/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(billing.settledEncounters).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 20 })))
    await screen.findByLabelText('第二页患者，SETTLED')

    // 关键字防抖：输入后 300ms 内不请求，停顿后带 query 回到第 1 页
    const callsBefore = billing.settledEncounters.mock.calls.length
    vi.useFakeTimers()
    try {
      fireEvent.change(screen.getByPlaceholderText(/搜索姓名/), { target: { value: '张' } })
      fireEvent.change(screen.getByPlaceholderText(/搜索姓名/), { target: { value: '张三' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(200) })
      expect(billing.settledEncounters.mock.calls.length).toBe(callsBefore)
      await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    } finally {
      vi.useRealTimers()
    }
    await waitFor(() => expect(billing.settledEncounters).toHaveBeenCalledWith(
      expect.objectContaining({ query: '张三', page: 0, size: 20 })))
  })

  it('keeps the selected encounter detail when it is not on the paged result', async () => {
    const settledEncounters = vi.fn().mockImplementation(async (params: { encounterId?: string; page?: number }) =>
      params.encounterId || !params.page ? settledPage([workItem], { totalElements: 40, totalPages: 2 })
        : settledPage([{ ...workItem, encounterId: 'enc-other', residentName: '另一患者' }], { page: 1, totalElements: 40, totalPages: 2 }))
    const { billing } = setup({ settledEncounters })
    await screen.findByLabelText('退费患者，SETTLED')
    await waitFor(() => expect(billing.refundPreCheck).toHaveBeenCalledWith('enc-1', 'acc-1'))
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await screen.findByLabelText('另一患者，SETTLED')
    expect(screen.getByText(/患者 退费患者/)).toBeInTheDocument()
    expect(billing.refundPreCheck).not.toHaveBeenCalledWith('enc-other', expect.anything())
  })
})
