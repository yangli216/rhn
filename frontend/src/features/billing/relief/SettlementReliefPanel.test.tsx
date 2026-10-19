import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SettlementRelief } from '../../../shared/api/reliefApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { SettlementReliefPanel, type ReliefSettlementTarget } from './SettlementReliefPanel'

const target: ReliefSettlementTarget = { id: 'stl-1', settlementNo: 'STL001', currencyCode: 'CNY', insuranceSettled: false }
const preview: SettlementRelief = {
  settlementId: 'stl-1', discountAmount: 10, reliefAmount: 0, outstandingAmount: 90,
  applications: [{ id: 'app-1', policyName: '签约居民诊查费减免', timing: 'PRE_INSURANCE', timingText: '医保前减免',
    reliefAmount: 10, status: 'APPLIED', statusText: '已减免' }],
  pending: [
    { policyId: 'p-civil', policyName: '民政救助', timing: 'POST_INSURANCE', timingText: '医保后减免', status: 'APPLIED',
      statusText: '已减免', baseAmount: 90, reliefAmount: 45 },
    { policyId: 'p-hardship', policyName: '困难患者核定', timing: 'POST_INSURANCE', status: 'AWAITING_MANUAL',
      statusText: '可人工核定', baseAmount: 45, manualMaxAmount: 40, manualApprovalAmount: 20 },
    { policyId: 'p-aged', policyName: '老年人优惠', status: 'SKIPPED', statusText: '不适用', message: '年龄未达到 65 岁' },
  ],
}

function renderPanel(props: Partial<Parameters<typeof SettlementReliefPanel>[0]> = {}, relief = preview) {
  const api = { relief: {
    settlementRelief: vi.fn().mockResolvedValue(relief),
    confirmSettlementRelief: vi.fn().mockResolvedValue({ ...relief, pending: [] }),
  } }
  const onChanged = vi.fn().mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <SettlementReliefPanel api={api as unknown as RhnApi} settlements={[target]} settlementMode="SELF_PAY"
      rights={{ canDecide: false, canApprove: false }} onChanged={onChanged} {...props} />
  </QueryClientProvider>)
  return { api, onChanged }
}

describe('SettlementReliefPanel', () => {
  it('lists applied, available, manual and skipped relief and confirms the automatic part', async () => {
    const { api, onChanged } = renderPanel()
    expect(await screen.findByText('签约居民诊查费减免 · 医保前减免')).toBeInTheDocument()
    expect(screen.getByText('民政救助 · 医保后减免')).toBeInTheDocument()
    expect(screen.getByText('需有惠民减免核定权限的人员核定。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '核定' })).not.toBeInTheDocument()
    expect(screen.getByText('年龄未达到 65 岁')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '确认减免' }))

    await waitFor(() => expect(api.relief.confirmSettlementRelief).toHaveBeenCalledWith('stl-1', []))
    expect(onChanged).toHaveBeenCalled()
  })

  it('lets a cashier decide manual relief on demand within the approval threshold', async () => {
    const manualOnly = { ...preview, pending: preview.pending!.filter((value) => value.status === 'AWAITING_MANUAL') }
    const { api } = renderPanel({ rights: { canDecide: true, canApprove: false } }, manualOnly)
    expect(await screen.findByText(/最多可核定/)).toHaveTextContent('超过 ¥20.00 需审批')
    expect(screen.queryByLabelText(/核定金额/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '核定' }))
    const amount = screen.getByLabelText(/核定金额/)
    await userEvent.type(amount, '30')
    expect(screen.getByText('超过审批阈值 20.00 元，需由有审批权限的人员核定')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: '确认核定与减免' })
    expect(confirm).toBeDisabled()
    await userEvent.clear(amount)
    await userEvent.type(amount, '18')
    await userEvent.type(screen.getByLabelText(/核定原因/), '家庭困难')
    await userEvent.type(screen.getByLabelText(/^依据/), '村委会证明')
    await userEvent.click(confirm)
    await waitFor(() => expect(api.relief.confirmSettlementRelief).toHaveBeenCalledWith('stl-1',
      [{ policyId: 'p-hardship', amount: 18, reason: '家庭困难', evidence: '村委会证明' }]))
  })

  it('lets an approver fill the allowed maximum and blocks amounts above it', async () => {
    const manualOnly = { ...preview, pending: preview.pending!.filter((value) => value.status === 'AWAITING_MANUAL') }
    renderPanel({ rights: { canDecide: false, canApprove: true } }, manualOnly)
    await userEvent.click(await screen.findByRole('button', { name: '核定' }))
    await userEvent.click(screen.getByRole('button', { name: '按上限' }))
    expect(screen.getByLabelText(/核定金额/)).toHaveValue('40.00')
    await userEvent.clear(screen.getByLabelText(/核定金额/))
    await userEvent.type(screen.getByLabelText(/核定金额/), '41')
    expect(screen.getByText('不能超过本次可核定金额 40.00 元')).toBeInTheDocument()
  })

  it('only previews post-insurance relief before the insurance settlement completes', async () => {
    const { api } = renderPanel({ settlementMode: 'MEDICAL_INSURANCE', rights: { canDecide: true, canApprove: true } })
    expect(await screen.findByText('医保结算方式下，医保后减免在医保正式结算后自动执行。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认减免' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '核定' })).not.toBeInTheDocument()
    expect(api.relief.confirmSettlementRelief).not.toHaveBeenCalled()
  })

  it('renders nothing when a settlement has no relief', async () => {
    const { api } = renderPanel({}, { settlementId: 'stl-1', applications: [], pending: [] })
    await waitFor(() => expect(api.relief.settlementRelief).toHaveBeenCalled())
    expect(screen.queryByText(/惠民减免 ·/)).not.toBeInTheDocument()
  })
})
