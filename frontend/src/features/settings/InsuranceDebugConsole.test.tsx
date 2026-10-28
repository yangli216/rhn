import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InsuranceDebugClaim, InsuranceDebugExchangePage, InsuranceDebugSettings } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InsuranceDebugConsole } from './InsuranceDebugConsole'

const knownInfnos = [{ code: '2207', name: '结算', important: true }, { code: '2208', name: '结算撤销', important: true }, { code: '1101', name: '人员信息', important: false }]
const settings = (patch: Partial<InsuranceDebugSettings> = {}): InsuranceDebugSettings => ({
  enabled: false, effectivelyEnabled: false, scope: 'IMPORTANT', selectedInfnos: [], retention: 'REDACTED', keepDays: 7, revision: 0,
  knownInfnos, rawAllowed: false, ...patch })
const page: InsuranceDebugExchangePage = { totalElements: 2, totalPages: 1, page: 0, size: 20, content: [
  { id: '11', infno: '2207', infnoName: '结算', startedAt: '2026-10-28T02:00:00Z', durationMs: 120, httpStatus: 200, infcode: '0', outcome: 'OK', outcomeText: '成功',
    actor: 'tester', retention: 'REDACTED' },
  { id: '12', infno: '1101', infnoName: '人员信息', startedAt: '2026-10-28T02:01:00Z', durationMs: 3000, outcome: 'TIMEOUT', outcomeText: '超时（结果未知）',
    errMsg: '调用医保网关超时', actor: 'tester', retention: 'SUMMARY' },
] }

const claim = (patch: Partial<InsuranceDebugClaim> = {}): InsuranceDebugClaim => ({
  claimId: '501', claimNo: 'CLM-001', settlementNo: 'STL-001', status: 'SETTLEMENT_PENDING', statusText: '结算结果未定',
  reason: '结算请求已发出但结果未确认', grossAmount: 100, insuranceFundAmount: 60, personalAccountAmount: 10, patientCashAmount: 30,
  canQuery: true, canReverse: true, ...patch })

function setup(options: { settings?: InsuranceDebugSettings; canConfigure?: boolean; canViewRaw?: boolean; canReverse?: boolean; view?: string; claims?: InsuranceDebugClaim[] } = {}) {
  const insuranceDebugSettings = vi.fn(() => Promise.resolve(options.settings ?? settings()))
  const updateInsuranceDebugSettings = vi.fn((input) => Promise.resolve(settings({ ...input, revision: 1, effectivelyEnabled: input.enabled })))
  const insuranceDebugExchanges = vi.fn(() => Promise.resolve(page))
  const insuranceDebugExchange = vi.fn(() => Promise.resolve({ summary: page.content[0], correlationId: 'corr-9', request: '{"mdtrt_cert_no":"****"}',
    response: '{"infcode":0}', rawVisible: false }))
  const insuranceDebugAttention = vi.fn(() => Promise.resolve(options.claims ?? [claim(), claim({ claimId: '502', claimNo: 'CLM-002', status: 'PRE_SETTLEMENT_PENDING',
    statusText: '预结算结果未定', canReverse: false })]))
  const insuranceDebugQueryClaim = vi.fn((claimId: string) => Promise.resolve({ outcome: 'QUERIED' as const, message: '已向医保平台查询，申请状态：已结算',
    claim: claim({ claimId, status: 'SETTLED', statusText: '已结算' }) }))
  const insuranceDebugReverseClaim = vi.fn(() => Promise.resolve({ outcome: 'REVERSED' as const, message: '冲正成功。',
    claim: claim({ status: 'REVERSED', statusText: '已冲正', canQuery: false, canReverse: false }) }))
  const api = { billing: { insuranceDebugSettings, updateInsuranceDebugSettings, insuranceDebugExchanges, insuranceDebugExchange,
    insuranceDebugAttention, insuranceDebugQueryClaim, insuranceDebugReverseClaim } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <InsuranceDebugConsole api={api} canConfigure={options.canConfigure ?? true} canViewRaw={options.canViewRaw ?? false}
      canReverse={options.canReverse ?? true} /></QueryClientProvider>)
  return { updateInsuranceDebugSettings, insuranceDebugExchanges, insuranceDebugExchange, insuranceDebugAttention, insuranceDebugQueryClaim, insuranceDebugReverseClaim }
}

async function openTab(name: string) { await userEvent.click(await screen.findByRole('tab', { name })) }

describe('InsuranceDebugConsole', () => {
  it('shows the switch state, defaults to today and lists exchanges with outcome and retention', async () => {
    const { insuranceDebugExchanges } = setup()
    await openTab('交易执行记录')
    expect(await screen.findByText('2207 结算')).toBeInTheDocument()
    expect(screen.getByText('超时（结果未知）')).toBeInTheDocument()
    expect(insuranceDebugExchanges).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }), 0, 20)
    expect(screen.getAllByRole('button', { name: '查看报文' })[1]).toBeDisabled()
  })

  it('saves the enabled switch with the current revision', async () => {
    const { updateInsuranceDebugSettings } = setup()
    await openTab('调试开关与范围')
    expect(await screen.findByText('调试未开启')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('switch', { name: '开启医保调试记录' }))
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(updateInsuranceDebugSettings).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true, scope: 'IMPORTANT', retention: 'REDACTED', keepDays: 7, expectedRevision: 0, selectedInfnos: [], confirmRaw: false })))
    expect(await screen.findByText('调试配置已保存')).toBeInTheDocument()
  })

  it('requires at least one transaction when the scope is specified', async () => {
    const { updateInsuranceDebugSettings } = setup({ settings: settings({ scope: 'SELECTED', selectedInfnos: [] }) })
    await openTab('调试开关与范围')
    expect(await screen.findByText('指定交易范围至少选择一个交易号')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /2208 结算撤销/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(updateInsuranceDebugSettings).toHaveBeenCalledWith(expect.objectContaining({ scope: 'SELECTED', selectedInfnos: ['2208'] })))
  })

  it('only offers raw retention to holders of the raw permission and demands confirmation plus auto-disable', async () => {
    setup({ settings: settings({ retention: 'RAW', rawAllowed: true, enabled: true, effectivelyEnabled: true }), canViewRaw: true })
    await openTab('调试开关与范围')
    expect(await screen.findByText('开启原始报文留存须确认风险，并设置 24 小时内自动关闭')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
  })

  it('is read-only without the configure permission', async () => {
    setup({ canConfigure: false })
    await openTab('调试开关与范围')
    expect(await screen.findByText('当前账号没有配置权限，仅可查看。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: '开启医保调试记录' })).toBeDisabled()
  })

  it('loads the redacted payload only when a row is expanded', async () => {
    const { insuranceDebugExchange } = setup()
    await openTab('交易执行记录')
    await screen.findByText('2207 结算')
    expect(insuranceDebugExchange).not.toHaveBeenCalled()
    await userEvent.click(screen.getAllByRole('button', { name: '查看报文' })[0])
    expect(await screen.findByText('请求（已脱敏）')).toBeInTheDocument()
    expect(insuranceDebugExchange).toHaveBeenCalledWith('11')
    expect(screen.getByText('请求关联号：corr-9')).toBeInTheDocument()
  })

  it('lists claims needing attention and lets an operator query the insurer result', async () => {
    const { insuranceDebugQueryClaim } = setup()
    expect(await screen.findByText('结算结果未定')).toBeInTheDocument()
    expect(screen.getByText('预结算结果未定')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: '查询结果' })[0])
    await waitFor(() => expect(insuranceDebugQueryClaim).toHaveBeenCalledWith('501'))
    expect(await screen.findByText(/CLM-001：已向医保平台查询/)).toBeInTheDocument()
  })

  it('only enables reversal for claims that can be reversed', async () => {
    setup()
    await screen.findByText('预结算结果未定')
    const reverse = screen.getAllByRole('button', { name: '冲正' })
    expect(reverse[0]).toBeEnabled()
    expect(reverse[1]).toBeDisabled()
  })

  it('requires a reason and the retyped claim number before reversing', async () => {
    const { insuranceDebugReverseClaim } = setup()
    await userEvent.click((await screen.findAllByRole('button', { name: '冲正' }))[0])
    const confirm = await screen.findByRole('button', { name: '确认冲正' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/冲正原因/), '医保已扣费，结算回执丢失')
    await userEvent.type(screen.getByLabelText(/重新输入申请号/), 'CLM-999')
    expect(confirm).toBeDisabled()
    await userEvent.clear(screen.getByLabelText(/重新输入申请号/))
    await userEvent.type(screen.getByLabelText(/重新输入申请号/), 'CLM-001')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await waitFor(() => expect(insuranceDebugReverseClaim).toHaveBeenCalledWith('501', { reason: '医保已扣费，结算回执丢失', confirmClaimNo: 'CLM-001' }))
    expect(await screen.findByText(/CLM-001：冲正成功。/)).toBeInTheDocument()
  })

  it('hides query and reversal actions without the reversal permission', async () => {
    setup({ canReverse: false })
    await screen.findByText('结算结果未定')
    expect(screen.queryByRole('button', { name: '冲正' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查询结果' })).not.toBeInTheDocument()
  })

  it('jumps from a claim to its exchange records filtered by claim id', async () => {
    const { insuranceDebugExchanges } = setup()
    await userEvent.click((await screen.findAllByRole('button', { name: '交易记录' }))[0])
    expect(await screen.findByText('仅显示申请 CLM-001 的交易记录。')).toBeInTheDocument()
    await waitFor(() => expect(insuranceDebugExchanges).toHaveBeenCalledWith({ claimId: '501' }, 0, 20))
  })
})
