import type { ReactNode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi, ReconciliationItem } from '../../shared/rhnApi'
import { PaymentReconciliationWorkspace } from './PaymentReconciliationWorkspace'
import { ReconciliationPolicyDialog } from '../../shared/billing/ReconciliationPolicyDialog'
import { ReconciliationActionDialog } from './reconciliation/ReconciliationActionDialog'

const authorities = ['READ', 'RUN', 'HANDLE', 'REVIEW', 'EXPORT'].map(value => `PAYMENT_RECONCILIATION.${value}`)
const channel = { configured: true, maskedMerchant: 'MER***', capability: { paymentMethodCode: 'NEW_PROVIDER', name: '新增渠道', zoneId: 'Asia/Shanghai', availableAfter: '10:00', historyDays: 90 } }
const task = { id: 'task-1', revision: 3, businessDate: '2026-10-17', paymentMethodCode: 'NEW_PROVIDER', paymentMethodCodeText: '新增渠道', status: 'QUEUED', statusText: '排队中', attempt: 0, merchantAllocationComplete: false }
const page = { content: [task], totalElements: 1, totalPages: 1, number: 0, size: 25 }
const policy = { organizationId: 'selected-org', revision: 4, autoEnabled: false, fetchTime: '10:30', backfillDays: 7, maximumBackfillDays: 90, zoneId: 'Asia/Shanghai', availableAfter: '10:00' }
function setup(extraAuthorities = authorities) {
  const billing = {
    reconciliationChannels: vi.fn().mockResolvedValue([channel]), reconciliationTasks: vi.fn().mockResolvedValue(page),
    createReconciliationTask: vi.fn().mockResolvedValue(task), reconciliationTask: vi.fn().mockResolvedValue({ task, versions: [], files: [], attempts: [] }),
    reconciliationPolicy: vi.fn().mockResolvedValue(policy), saveReconciliationPolicy: vi.fn().mockResolvedValue({ ...policy, revision: 5, autoEnabled: true }),
    queryReconciliationItem: vi.fn().mockResolvedValue({ outcome: 'PENDING', outcomeText: '待确认', message: '未重新发起资金指令' }),
    proposeReconciliationItem: vi.fn().mockResolvedValue(undefined),
  }
  const dictionaries = { systemEnum: vi.fn().mockResolvedValue({ items: [{ code: 'QUEUED', name: '排队中', sortOrder: 1 }, { code: 'FAILED', name: '失败', sortOrder: 2 }] }) }
  const api = { billing, dictionaries } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const props = { api, contextKey: 'tenant:org', organizationId: 'org', organizationName: '当前医院', authorities: extraAuthorities }
  const wrap = (node: ReactNode) => <QueryClientProvider client={client}>{node}</QueryClientProvider>
  const user = userEvent.setup()
  return { billing, api, props, client, wrap, user }
}
describe('交易对账工作台', () => {
  it('does not load reconciliation data without read permission', async () => {
    const { props, wrap, billing } = setup([])
    render(wrap(<PaymentReconciliationWorkspace {...props} />))
    expect(screen.getByText('无权查看支付对账')).toBeInTheDocument()
    expect(billing.reconciliationChannels).not.toHaveBeenCalled(); expect(billing.reconciliationTasks).not.toHaveBeenCalled()
  })
  it('uses provider capabilities and server enum options, then creates an asynchronous task', async () => {
    const { props, wrap, billing, user } = setup()
    render(wrap(<PaymentReconciliationWorkspace {...props} />))
    expect(await screen.findByRole('button', { name: '查看核对' })).toBeInTheDocument()
    expect(screen.getAllByText('排队中').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '拉取并核对' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('新增渠道交易账单')
    await user.click(screen.getByRole('button', { name: '确认拉取并核对' }))
    await waitFor(() => expect(billing.createReconciliationTask).toHaveBeenCalledWith('NEW_PROVIDER', expect.any(String), expect.any(String)))
    expect(await screen.findByText('尚无可用核对版本')).toBeInTheDocument()
  })
  it('keeps a missing configuration separate from an empty matched report', async () => {
    const { props, wrap, billing } = setup()
    billing.reconciliationChannels.mockResolvedValue([{ ...channel, configured: false }])
    render(wrap(<PaymentReconciliationWorkspace {...props} />))
    expect(await screen.findByText('当前机构尚未配置对账商户')).toBeInTheDocument()
    expect(billing.reconciliationTasks).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: '拉取并核对' })).toBeDisabled()
  })
  it('ignores a task response after the institution context changes', async () => {
    const { props, wrap, billing, user } = setup()
    let resolve!: (value: unknown) => void
    billing.createReconciliationTask.mockReturnValue(new Promise(value => { resolve = value }))
    const view = render(wrap(<PaymentReconciliationWorkspace {...props} />))
    await screen.findByRole('button', { name: '查看核对' }); await user.click(screen.getByRole('button', { name: '拉取并核对' })); await user.click(screen.getByRole('button', { name: '确认拉取并核对' }))
    view.rerender(wrap(<PaymentReconciliationWorkspace {...props} contextKey="tenant:other-org" />))
    await act(async () => resolve({ ...task, id: 'old-context-task' }))
    expect(billing.reconciliationTask).not.toHaveBeenCalledWith('old-context-task')
    expect(screen.queryByText('尚无可用核对版本')).not.toBeInTheDocument()
  })
})
describe('对账策略和差异处理', () => {
  it('saves the explicitly selected institution and warns before discarding a draft', async () => {
    const { api, wrap, billing, user } = setup()
    render(wrap(<ReconciliationPolicyDialog api={api} contextKey="tenant:org" organizationId="selected-org" method="NEW_PROVIDER" channelName="新增渠道" configured canRead canRun />))
    await user.click(screen.getByRole('button', { name: '对账策略' }))
    await user.click(await screen.findByRole('switch', { name: '自动拉取并核对历史交易账单' }))
    await user.click(screen.getByRole('button', { name: '关闭' })); expect(screen.getByText('关闭将丢弃尚未保存的对账策略。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续编辑' })); await user.click(screen.getByRole('button', { name: '保存策略' }))
    await waitFor(() => expect(billing.saveReconciliationPolicy).toHaveBeenCalledWith('NEW_PROVIDER', { expectedRevision: 4, autoEnabled: true, fetchTime: '10:30', backfillDays: 7 }, 'selected-org'))
    expect(billing.reconciliationPolicy).toHaveBeenCalledWith('NEW_PROVIDER', 'selected-org')
  })
  it('submits only a query against the original instruction with an expected revision', async () => {
    const { api, wrap, billing, user } = setup(); const done = vi.fn()
    const item = { id: 'item-1', revision: 8, paymentOrderId: 'order-1', comparisonResult: 'LOCAL_NOT_POSTED', comparisonResultText: '本地未入账' } as unknown as ReconciliationItem
    render(wrap(<ReconciliationActionDialog api={api} action={{ kind: 'query', item }} current onClose={() => {}} onCompleted={done} />))
    expect(screen.getByRole('dialog')).toHaveTextContent('不会重新下单')
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(billing.queryReconciliationItem).toHaveBeenCalledWith('item-1', { expectedRevision: 8, commandCode: expect.any(String) }))
    expect(billing.proposeReconciliationItem).not.toHaveBeenCalled(); expect(done).toHaveBeenCalledWith('待确认：未重新发起资金指令')
  })
  it('requires a reason and keeps a superseded version read only', async () => {
    const { api, wrap, billing, user } = setup()
    const item = { id: 'item-1', revision: 8, comparisonResult: 'AMOUNT_DIFFERENCE' } as ReconciliationItem
    render(wrap(<ReconciliationActionDialog api={api} action={{ kind: 'propose', item }} current={false} onClose={() => {}} onCompleted={() => {}} />))
    await user.type(screen.getByLabelText(/核查／复核依据/), '已核实，但此版已被替代')
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled(); expect(billing.proposeReconciliationItem).not.toHaveBeenCalled()
  })
})
