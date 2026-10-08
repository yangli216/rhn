import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { OutpatientFlowBoard } from '../../shared/api/outpatientFlowApi'
import type { RhnApi } from '../../shared/rhnApi'
import { getTodayRange } from '../../shared/ui'
import { OutpatientFlowWorkspace } from './OutpatientFlowWorkspace'

const context = { organization: { id: 'org-1', name: '机构一' }, department: { id: 'dept-1', name: '科室一' } } as ClinicalContext
function board(): OutpatientFlowBoard {
  return { businessDate: getTodayRange().from, refreshedAt: '2026-10-03T08:00:00Z',
    summary: { totalCount: 1, waitingConsultationCount: 0, inConsultationCount: 0,
      downstreamPendingCount: 0, exceptionCount: 0, completedCount: 1 },
    visits: [{ encounterId: 'enc-1', encounterNo: 'OP-1', residentId: 'resident-1', residentName: '待核验患者',
      healthRecordNo: 'HR-1', gender: 'FEMALE', clinicalStatus: 'COMPLETED', flowStatus: 'COMPLETED', flowStatusText: '流程完成',
      nextDestination: '可以离院', attentionReason: '接诊及诊后环节均已完成', pendingMinutes: 0, outstandingAmount: 0,
      registeredAt: '2026-10-03T07:00:00Z', stages: [
        { stageCode: 'CLINICAL', stageName: '接诊', status: 'COMPLETED', statusText: '诊毕', totalCount: 1, pendingCount: 0 },
      ] }],
  }
}
function setup(fetch: ReturnType<typeof vi.fn>, selectedContext = context) {
  const api = { outpatientFlow: { board: fetch } } as unknown as RhnApi
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const onNavigate = vi.fn()
  const content = (value: ClinicalContext) => <QueryClientProvider client={queryClient}>
    <OutpatientFlowWorkspace api={api} clinicalContext={value} onNavigate={onNavigate} />
  </QueryClientProvider>
  return { ...render(content(selectedContext)), content, onNavigate }
}
async function showCompleted() {
  await userEvent.click(await screen.findByRole('button', { name: /流程完成.*1/ }))
  expect(await screen.findByRole('row', { name: /待核验患者/ })).toBeInTheDocument()
}

describe('outpatient flow evidence', () => {
  it('does not invent zero patients while loading', () => {
    setup(vi.fn().mockReturnValue(new Promise(() => {})))
    expect(screen.getByText('科室一 · 人数待确认')).toBeInTheDocument()
    expect(screen.getByText('正在汇总门诊各环节状态…')).toBeInTheDocument()
    expect(screen.queryByLabelText('门诊流转摘要')).not.toBeInTheDocument()
    expect(screen.queryByText('当前筛选下暂无患者')).not.toBeInTheDocument()
  })

  it.each([
    ['空响应', () => null],
    ['缺少明细', () => ({ ...board(), visits: undefined })],
    ['缺少异常人数', () => ({ ...board(), summary: { ...board().summary, exceptionCount: undefined } })],
    ['统计不一致', () => ({ ...board(), summary: { ...board().summary, totalCount: 0 } })],
    ['未知流转状态', () => { const value = board(); value.visits[0]!.flowStatus = 'UNKNOWN' as never; return value }],
    ['缺少接诊凭据', () => { const value = board(); value.visits[0]!.stages = []; return value }],
    ['仍有待办却声称完成', () => { const value = board(); value.visits[0]!.stages.push({ stageCode: 'TREATMENT',
      stageName: '治疗', status: 'WAITING', statusText: '待皮试', totalCount: 1, pendingCount: 1 }); return value }],
    ['未清费用却声称完成', () => { const value = board(); value.visits[0]!.outstandingAmount = 10; return value }],
    ['已完成环节仍有待办', () => { const value = board(); value.visits[0]!.stages[0]!.pendingCount = 1; return value }],
    ['重复患者就诊', () => { const value = board(); value.visits.push(value.visits[0]!); return value }],
    ['错误查询日期', () => ({ ...board(), businessDate: '2000-01-01' })],
    ['操作入口串就诊', () => { const value = board(); value.visits[0]!.nextRoute = '/treatments?encounterId=other';
      value.visits[0]!.nextActionText = '去治疗'; return value }],
  ])('rejects %s without presenting a normal empty board', async (_name, create) => {
    setup(vi.fn().mockResolvedValue(create()))
    expect(await screen.findByText('门诊流转资料暂不可用')).toBeInTheDocument()
    expect(screen.queryByLabelText('门诊流转摘要')).not.toBeInTheDocument()
    expect(screen.queryByText('当前筛选下暂无患者')).not.toBeInTheDocument()
    expect(screen.queryByText('可以离院')).not.toBeInTheDocument()
  })

  it('hides previously successful data after a failed refresh and recovers through retry', async () => {
    const empty = board(); empty.visits = []; empty.summary.totalCount = 0; empty.summary.completedCount = 0
    const fetch = vi.fn().mockResolvedValueOnce(board()).mockRejectedValueOnce(new Error('连接中断')).mockResolvedValueOnce(empty)
    setup(fetch)
    await showCompleted()
    await userEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('门诊流转资料暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('待核验患者')).not.toBeInTheDocument()
    expect(screen.queryByText('可以离院')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('门诊流转摘要')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByText('当前筛选下暂无患者')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /流程完成.*0/ })).toBeInTheDocument()
  })

  it('withholds cached completion during refresh and uses newly verified pending work', async () => {
    let resolve!: (value: OutpatientFlowBoard) => void
    const fetch = vi.fn().mockResolvedValueOnce(board()).mockImplementationOnce(() => new Promise<OutpatientFlowBoard>(done => { resolve = done }))
    const { onNavigate } = setup(fetch)
    await showCompleted()
    await userEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(screen.queryByText('可以离院')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('门诊流转摘要')).not.toBeInTheDocument()
    const pending = board(); pending.summary.completedCount = 0; pending.summary.downstreamPendingCount = 1
    Object.assign(pending.visits[0]!, { flowStatus: 'WAITING_TREATMENT', flowStatusText: '待治疗', nextDestination: '治疗执行',
      nextRoute: '/treatments?encounterId=enc-1&residentId=resident-1', nextActionText: '去治疗', attentionReason: '治疗待执行' })
    pending.visits[0]!.stages.push({ stageCode: 'TREATMENT', stageName: '治疗', status: 'WAITING', statusText: '待执行', totalCount: 1, pendingCount: 1 })
    await act(async () => resolve(pending))
    await userEvent.click(await screen.findByRole('button', { name: /诊后待办.*1/ }))
    await userEvent.click(await screen.findByRole('button', { name: '去治疗' }))
    expect(onNavigate).toHaveBeenCalledWith('/treatments?encounterId=enc-1&residentId=resident-1')
  })

  it.each(['department', 'organization'] as const)('does not reuse another %s cache when work context changes', async key => {
    let resolve!: (value: OutpatientFlowBoard) => void
    const fetch = vi.fn().mockResolvedValueOnce(board()).mockImplementationOnce(() => new Promise<OutpatientFlowBoard>(done => { resolve = done }))
    const { rerender, content } = setup(fetch)
    await showCompleted()
    const next = { ...context, [key]: { ...context[key], id: `${key}-2`, name: '新工作范围' } } as ClinicalContext
    rerender(content(next))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('待核验患者')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('门诊流转摘要')).not.toBeInTheDocument()
    const empty = board(); empty.visits = []; empty.summary.totalCount = 0; empty.summary.completedCount = 0
    await act(async () => resolve(empty))
    expect(await screen.findByText('当前筛选下暂无患者')).toBeInTheDocument()
  })
})
