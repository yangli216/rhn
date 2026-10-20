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
  it('lists applied, automatic and manual relief as single name/amount rows and confirms the automatic part', async () => {
    const { api, onChanged } = renderPanel()
    expect(await screen.findByText('签约居民诊查费减免')).toBeInTheDocument()
    expect(screen.queryByText('惠民减免')).not.toBeInTheDocument()
    expect(screen.queryByText(/STL001/)).not.toBeInTheDocument()
    expect(screen.getByText('签约居民诊查费减免')).toBeInTheDocument()
    expect(screen.getByText('-¥10.00')).toBeInTheDocument()
    expect(screen.getByText('民政救助')).toBeInTheDocument()
    expect(screen.getByText('-¥45.00')).toBeInTheDocument()
    expect(screen.queryByText('预估')).not.toBeInTheDocument()
    expect(screen.getByText('无核定权限')).toBeInTheDocument()
    expect(screen.queryByLabelText('困难患者核定')).not.toBeInTheDocument()
    // 不适用的政策不展示
    expect(screen.queryByText('老年人优惠')).not.toBeInTheDocument()
    expect(screen.queryByText('年龄未达到 65 岁')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '确认减免' }))

    await waitFor(() => expect(api.relief.confirmSettlementRelief).toHaveBeenCalledWith('stl-1', []))
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows the settlement number only when several settlements are payable', async () => {
    renderPanel({ settlements: [target, { ...target, id: 'stl-2', settlementNo: 'STL002' }] })
    expect(await screen.findAllByText('STL001')).toHaveLength(1)
    expect(await screen.findByText('STL002')).toBeInTheDocument()
  })

  it('treats a typed amount as a manual decision and validates it against the approval threshold', async () => {
    const manualOnly = { ...preview, pending: preview.pending!.filter((value) => value.status === 'AWAITING_MANUAL') }
    const { api } = renderPanel({ rights: { canDecide: true, canApprove: false } }, manualOnly)
    const amount = await screen.findByLabelText('困难患者核定')
    expect(amount).toHaveAttribute('placeholder', '≤40.00')
    expect(screen.queryByRole('button', { name: /核定|提交|取消|按上限/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/核定原因|依据/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认减免' })).not.toBeInTheDocument()

    await userEvent.type(amount, '30')
    expect(screen.getByText('超过审批阈值 20.00 元，需由有审批权限的人员核定')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认减免' })).toBeDisabled()
    await userEvent.clear(amount)
    await userEvent.type(amount, '18')
    await userEvent.click(screen.getByRole('button', { name: '确认减免' }))
    await waitFor(() => expect(api.relief.confirmSettlementRelief).toHaveBeenCalledWith('stl-1',
      [{ policyId: 'p-hardship', amount: 18, reason: '收费窗口人工核定' }]))
  })

  it('fills the manual amount with 上限 and 减半 chips and highlights the matching chip', async () => {
    const manualOnly = { ...preview, pending: preview.pending!.filter((value) => value.status === 'AWAITING_MANUAL') }
    renderPanel({ rights: { canDecide: true, canApprove: true } }, manualOnly)
    const amount = await screen.findByLabelText('困难患者核定')
    await userEvent.click(screen.getByRole('button', { name: '上限' }))
    expect(amount).toHaveValue(40)
    expect(screen.getByRole('button', { name: '上限' })).toHaveClass('is-active')
    await userEvent.click(screen.getByRole('button', { name: '减半' }))
    expect(amount).toHaveValue(20)
    expect(screen.getByRole('button', { name: '减半' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '上限' })).not.toHaveClass('is-active')
    await userEvent.click(screen.getByRole('button', { name: '减半' }))
    expect(amount).toHaveValue(20)
    expect(screen.getByRole('button', { name: '减半' })).toHaveClass('is-active')
  })

  it('lets an approver go up to the maximum and blocks amounts above it; zero means no decision', async () => {
    const manualOnly = { ...preview, pending: preview.pending!.filter((value) => value.status === 'AWAITING_MANUAL') }
    renderPanel({ rights: { canDecide: false, canApprove: true } }, manualOnly)
    const amount = await screen.findByLabelText('困难患者核定')
    await userEvent.type(amount, '41')
    expect(screen.getByText('不能超过本次可核定金额 40.00 元')).toBeInTheDocument()
    await userEvent.clear(amount)
    await userEvent.type(amount, '0')
    expect(screen.queryByText(/请输入大于零/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认减免' })).not.toBeInTheDocument()
  })

  it('only previews post-insurance relief before the insurance settlement completes', async () => {
    const { api } = renderPanel({ settlementMode: 'MEDICAL_INSURANCE', rights: { canDecide: true, canApprove: true } })
    expect(await screen.findByText('医保结算后核定')).toBeInTheDocument()
    expect(screen.getByText('预估')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认减免' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('困难患者核定')).not.toBeInTheDocument()
    expect(api.relief.confirmSettlementRelief).not.toHaveBeenCalled()
  })

  it('renders nothing when every policy is not applicable', async () => {
    const { api } = renderPanel({}, { settlementId: 'stl-1', discountAmount: 0, reliefAmount: 0, outstandingAmount: 90, applications: [],
      pending: [{ policyId: 'p-low', policyName: '低保特困医疗救助', status: 'SKIPPED', statusText: '不适用', message: '不在名单中' }] })
    await waitFor(() => expect(api.relief.settlementRelief).toHaveBeenCalled())
    expect(screen.queryByText('惠民减免')).not.toBeInTheDocument()
    expect(screen.queryByText('低保特困医疗救助')).not.toBeInTheDocument()
  })

  it('renders nothing when a settlement has no relief', async () => {
    const { api } = renderPanel({}, { settlementId: 'stl-1', applications: [], pending: [] })
    await waitFor(() => expect(api.relief.settlementRelief).toHaveBeenCalled())
    expect(screen.queryByText('惠民减免')).not.toBeInTheDocument()
  })

  it('after insurance pre-settlement shows the estimate and plans manual relief by typing, without calling the API', async () => {
    const onPlanChange = vi.fn()
    const { api } = renderPanel({
      settlementMode: 'MEDICAL_INSURANCE', rights: { canDecide: true, canApprove: false }, onPlanChange,
      settlements: [{ ...target, insurancePreSettled: true }],
    })
    expect(await screen.findByText('预估')).toBeInTheDocument()
    expect(screen.getByText('-¥45.00')).toBeInTheDocument()
    expect(screen.queryByText('医保结算后核定')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认减免' })).not.toBeInTheDocument()
    await waitFor(() => expect(onPlanChange).toHaveBeenLastCalledWith('stl-1', { manual: [], autoEstimate: 45, manualEstimate: 0 }))

    await userEvent.type(screen.getByLabelText('困难患者核定'), '15')
    expect(api.relief.confirmSettlementRelief).not.toHaveBeenCalled()
    await waitFor(() => expect(onPlanChange).toHaveBeenLastCalledWith('stl-1', {
      manual: [{ policyId: 'p-hardship', amount: 15, reason: '收费窗口人工核定' }], autoEstimate: 45, manualEstimate: 15,
    }))
    // 超过审批阈值的输入不计入计划
    await userEvent.clear(screen.getByLabelText('困难患者核定'))
    await userEvent.type(screen.getByLabelText('困难患者核定'), '30')
    await waitFor(() => expect(onPlanChange).toHaveBeenLastCalledWith('stl-1', { manual: [], autoEstimate: 45, manualEstimate: 0 }))
  })
})
