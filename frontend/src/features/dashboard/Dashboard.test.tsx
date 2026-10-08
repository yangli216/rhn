import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { Dashboard } from './Dashboard'

describe('Dashboard quick access and navigation', () => {
  const mockSummary = {
    tasks: { ready: 3, inProgress: 2, overdue: 1, totalOpen: 5 },
    notifications: { unread: 4, total: 10 },
    registeredToday: 15,
    inProgress: 5,
    completedToday: 10,
    activeResidents: 120,
  }

  const mockApi = {
    portal: {
      summary: vi.fn().mockResolvedValue(mockSummary),
    },
  } as unknown as RhnApi

  beforeEach(() => { vi.mocked(mockApi.portal.summary).mockReset().mockResolvedValue(mockSummary) })

  function renderDashboard(props?: {
    onStart?: () => void
    onOpenTasks?: () => void
    onNavigate?: (path: string) => void
  }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <Dashboard
          api={mockApi}
          contextKey="CLINICAL:org:dept"
          onStart={props?.onStart ?? vi.fn()}
          onOpenTasks={props?.onOpenTasks ?? vi.fn()}
          onNavigate={props?.onNavigate ?? vi.fn()}
        />
      </QueryClientProvider>
    )
    return { ...rendered, queryClient }
  }

  it('shows actual counts without fabricated version, health or integration status', async () => {
    renderDashboard()
    await screen.findByRole('region', { name: '今日业务摘要' })
    expect(screen.getByText('统计范围')).toBeInTheDocument()
    expect(screen.queryByText('Active v1.2')).not.toBeInTheDocument()
    expect(screen.queryByText('已贯通')).not.toBeInTheDocument()
    expect(screen.queryByText('核心系统底座状态')).not.toBeInTheDocument()
    expect(screen.queryByText('可靠事件与幂等')).not.toBeInTheDocument()
  })

  it('hides stale counts while refreshing', async () => {
    const { queryClient } = renderDashboard()
    await screen.findByRole('region', { name: '今日业务摘要' })
    let resolve!: (value: typeof mockSummary) => void
    vi.mocked(mockApi.portal.summary).mockReturnValue(new Promise((done) => { resolve = done }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['portal-summary'] }) })
    await screen.findByText('正在汇总工作台数据…')
    expect(screen.queryByRole('region', { name: '今日业务摘要' })).not.toBeInTheDocument()
    expect(screen.queryByText('今日工作队列')).not.toBeInTheDocument()
    await act(async () => resolve(mockSummary))
    expect(await screen.findByRole('region', { name: '今日业务摘要' })).toBeInTheDocument()
  })

  it('does not reuse statistics from another department', async () => {
    const { queryClient, rerender } = renderDashboard()
    await screen.findByRole('region', { name: '今日业务摘要' })
    const next = { portal: { summary: vi.fn().mockRejectedValue(new Error('新科室摘要不可用')) } } as unknown as RhnApi
    rerender(<QueryClientProvider client={queryClient}>
      <Dashboard api={next} contextKey="CLINICAL:org:next" onStart={vi.fn()} onOpenTasks={vi.fn()} />
    </QueryClientProvider>)
    await screen.findByText('工作台摘要加载失败')
    expect(screen.queryByRole('region', { name: '今日业务摘要' })).not.toBeInTheDocument()
    expect(queryClient.getQueryData(['portal-summary', 'CLINICAL:org:dept'])).toEqual(mockSummary)
  })

  it('hides stale statistics on refresh failure, keeps navigation, and recovers real zero counts', async () => {
    const { queryClient } = renderDashboard()
    await screen.findByRole('region', { name: '今日业务摘要' })
    vi.mocked(mockApi.portal.summary).mockRejectedValue(new Error('统计服务不可用'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['portal-summary'] }) })
    expect(await screen.findByText('工作台摘要加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '今日业务摘要' })).not.toBeInTheDocument()
    expect(screen.queryByText('今日工作队列')).not.toBeInTheDocument()
    expect(screen.queryByText('当前暂无逾期任务')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /门诊全科工作站/ })).toBeEnabled()
    vi.mocked(mockApi.portal.summary).mockResolvedValue({ activeResidents: 0, registeredToday: 0, inProgress: 0,
      completedToday: 0, tasks: { ready: 0, inProgress: 0, overdue: 0, totalOpen: 0 }, notifications: { unread: 0, total: 0 } })
    fireEvent.click(screen.getByRole('button', { name: '重新加载摘要' }))
    await waitFor(() => expect(screen.queryByText('工作台摘要加载失败')).not.toBeInTheDocument())
    expect(screen.getByText('当前暂无逾期任务')).toBeInTheDocument()
  })

  it.each([
    null, {}, { ...mockSummary, activeResidents: -1 }, { ...mockSummary, registeredToday: '15' },
    { ...mockSummary, tasks: { ...mockSummary.tasks, overdue: undefined } },
    { ...mockSummary, tasks: { ...mockSummary.tasks, totalOpen: 6 } },
    { ...mockSummary, notifications: { unread: 11, total: 10 } },
  ])('rejects incomplete or inconsistent summaries: %j', async (value) => {
    vi.mocked(mockApi.portal.summary).mockResolvedValue(value as typeof mockSummary)
    renderDashboard()
    expect(await screen.findByText('工作台摘要加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '今日业务摘要' })).not.toBeInTheDocument()
    expect(screen.queryByText('无逾期滞留任务')).not.toBeInTheDocument()
  })

  it('navigates to outpatient reception when clicking outpatient workstation card without triggering onStart', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    const onNavigate = vi.fn()

    renderDashboard({ onStart, onNavigate })

    const outpatientCard = await screen.findByRole('button', { name: /门诊全科工作站/ })
    await user.click(outpatientCard)

    expect(onNavigate).toHaveBeenCalledWith('/outpatient/reception')
    expect(onStart).not.toHaveBeenCalled()
  })

  it('navigates to inpatient doctor station when clicking inpatient workstation card', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    renderDashboard({ onNavigate })

    const inpatientCard = await screen.findByRole('button', { name: /住院病区工作站/ })
    await user.click(inpatientCard)

    expect(onNavigate).toHaveBeenCalledWith('/inpatient/doctor-station')
  })

  it('navigates to pharmacy, residents, and billing when clicking respective quick access cards', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    renderDashboard({ onNavigate })

    const pharmacyCard = await screen.findByRole('button', { name: /药房调配与库存/ })
    await user.click(pharmacyCard)
    expect(onNavigate).toHaveBeenCalledWith('/pharmacy')

    const residentsCard = await screen.findByRole('button', { name: /居民健康档案/ })
    await user.click(residentsCard)
    expect(onNavigate).toHaveBeenCalledWith('/residents')

    const billingCard = await screen.findByRole('button', { name: /结算与预交金/ })
    await user.click(billingCard)
    expect(onNavigate).toHaveBeenCalledWith('/billing')
  })

  it('triggers onStart when clicking registration banner action button', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()

    renderDashboard({ onStart })

    const registerBtn = await screen.findByRole('button', { name: /办理门诊挂号/ })
    await user.click(registerBtn)

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('triggers onOpenTasks when clicking view tasks banner action button', async () => {
    const user = userEvent.setup()
    const onOpenTasks = vi.fn()

    renderDashboard({ onOpenTasks })

    const tasksBtn = await screen.findByRole('button', { name: /查看待办任务/ })
    await user.click(tasksBtn)

    expect(onOpenTasks).toHaveBeenCalledTimes(1)
  })
})
