import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkTask } from '../../shared/api/portalApi'
import type { RhnApi } from '../../shared/rhnApi'
import { TasksWorkspace } from './TasksWorkspace'

const sampleTasks: WorkTask[] = [
  {
    id: 'task-1',
    taskType: 'CLINICAL_DOCUMENT_SIGN',
    title: '待签署门诊病历',
    summary: '待签署：门诊病历',
    priority: 'HIGH',
    status: 'READY',
    assigneeType: 'USER',
    routePath: '/outpatient/doctor',
    dueAt: '2026-09-28T15:36:00Z',
    createdAt: '2026-09-28T11:36:00Z',
    revision: 1,
  },
  {
    id: 'task-2',
    taskType: 'PRESCRIBE_REVIEW',
    title: '处方审核待办',
    summary: '急诊处方待前置审核',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    assigneeType: 'DEPARTMENT',
    routePath: '/pharmacy/review',
    dueAt: null,
    createdAt: '2026-09-28T12:00:00Z',
    revision: 1,
  },
]

function createMockApi(overrides: Partial<RhnApi['portal']['tasks']> = {}) {
  return {
    portal: {
      tasks: {
        list: vi.fn().mockResolvedValue(sampleTasks),
        claim: vi.fn().mockResolvedValue(sampleTasks[0]),
        complete: vi.fn().mockResolvedValue(sampleTasks[0]),
        ...overrides,
      },
    },
  } as unknown as RhnApi
}

function renderWorkspace(api: RhnApi, onNavigate = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <TasksWorkspace api={api} contextKey="CLINICAL:org:dept" onNavigate={onNavigate} />
    </QueryClientProvider>,
  )
  return { ...rendered, queryClient }
}

describe('TasksWorkspace', () => {
  it('hides old tasks and actions while refreshing', async () => {
    const list = vi.fn().mockResolvedValue(sampleTasks)
    const { queryClient } = renderWorkspace(createMockApi({ list }))
    await screen.findByText('处方审核待办')
    let resolve!: (tasks: WorkTask[]) => void
    list.mockReturnValue(new Promise((done) => { resolve = done }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['work-tasks'] }) })
    await screen.findByText('正在加载任务队列…')
    expect(screen.queryByText('处方审核待办')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
    await act(async () => resolve([]))
    expect(await screen.findByText('当前没有待办任务')).toBeInTheDocument()
  })

  it('does not reuse another departments task cache or actions', async () => {
    const original = createMockApi()
    const { queryClient, rerender } = renderWorkspace(original)
    await screen.findByText('处方审核待办')
    let resolve!: (tasks: WorkTask[]) => void
    const next = createMockApi({ list: vi.fn().mockReturnValue(new Promise((done) => { resolve = done })) })
    rerender(<QueryClientProvider client={queryClient}>
      <TasksWorkspace api={next} contextKey="CLINICAL:org:next" onNavigate={vi.fn()} />
    </QueryClientProvider>)
    await screen.findByText('正在加载任务队列…')
    expect(screen.queryByText('处方审核待办')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '认领' })).not.toBeInTheDocument()
    await act(async () => resolve([]))
    expect(await screen.findByText('当前没有待办任务')).toBeInTheDocument()
    expect(original.portal.tasks.claim).not.toHaveBeenCalled()
  })

  it.each(['CLINICAL_DOCUMENT_SIGN', 'CRITICAL_VALUE_ACKNOWLEDGE', 'CONTINUOUS_CARE', 'OUTPATIENT_ENCOUNTER'])(
    'requires the actual business action for %s', async (taskType) => {
      const api = createMockApi({ list: vi.fn().mockResolvedValue([{ ...sampleTasks[0], taskType }]) })
      const navigate = vi.fn()
      renderWorkspace(api, navigate)
      await screen.findByRole('button', { name: '查看业务' })
      expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '查看业务' }))
      expect(navigate).toHaveBeenCalledWith(sampleTasks[0].routePath)
      expect(api.portal.tasks.complete).not.toHaveBeenCalled()
    })

  it('removes stale actions after a failed refresh and distinguishes failure from an empty queue', async () => {
    const list = vi.fn().mockResolvedValue(sampleTasks)
    const api = createMockApi({ list })
    const { queryClient } = renderWorkspace(api)
    await screen.findByText('处方审核待办')
    list.mockRejectedValue(new Error('任务服务不可用'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['work-tasks'] }) })
    expect(await screen.findByText('任务队列加载失败')).toBeInTheDocument()
    expect(screen.queryByText('处方审核待办')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
    expect(screen.queryByText('当前没有待办任务')).not.toBeInTheDocument()
    list.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: '重新加载任务' }))
    expect(await screen.findByText('当前没有待办任务')).toBeInTheDocument()
  })

  it.each([null, {}, [null]])('rejects malformed task lists: %j', async (value) => {
    renderWorkspace(createMockApi({ list: vi.fn().mockResolvedValue(value) }))
    expect(await screen.findByText('任务队列加载失败')).toBeInTheDocument()
    expect(screen.queryByText('当前没有待办任务')).not.toBeInTheDocument()
  })

  it('does not disguise unknown status or priority as ready and normal', async () => {
    const api = createMockApi({ list: vi.fn().mockResolvedValue([{ ...sampleTasks[1], status: 'NEW_STATUS', priority: undefined }]) })
    renderWorkspace(api)
    expect(await screen.findByText('任务状态未知')).toBeInTheDocument()
    expect(screen.getByText('优先级未知')).toBeInTheDocument()
    expect(screen.queryByText('待认领')).not.toBeInTheDocument()
    expect(screen.queryByText('普通')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
  })

  it('renders empty state when there are no tasks', async () => {
    const api = createMockApi({ list: vi.fn().mockResolvedValue([]) })
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByText('当前没有待办任务')).toBeInTheDocument()
    })
  })

  it('renders task queue and task cards with badges and actions', async () => {
    const api = createMockApi()
    const onNavigate = vi.fn()
    renderWorkspace(api, onNavigate)

    await waitFor(() => {
      expect(screen.getByText('待签署门诊病历')).toBeInTheDocument()
      expect(screen.getByText('处方审核待办')).toBeInTheDocument()
    })

    expect(screen.getByText(/未提供截止时间/)).toBeInTheDocument()
    expect(screen.getByText('高优先级')).toBeInTheDocument()
    expect(screen.getByText('紧急')).toBeInTheDocument()
    expect(screen.getByText('待认领')).toBeInTheDocument()
    expect(screen.getByText('处理中')).toBeInTheDocument()

    // Navigation action
    const viewButtons = screen.getAllByRole('button', { name: '查看业务' })
    expect(viewButtons).toHaveLength(2)
    fireEvent.click(viewButtons[0])
    expect(onNavigate).toHaveBeenCalledWith('/outpatient/doctor')

    // Claim action for READY task
    const claimButton = screen.getByRole('button', { name: '认领' })
    fireEvent.click(claimButton)
    await waitFor(() => {
      expect(api.portal.tasks.claim).toHaveBeenCalledWith('task-1', expect.anything())
    })

    // Complete action for non CLINICAL_DOCUMENT_SIGN task
    const completeButton = screen.getByRole('button', { name: '完成' })
    fireEvent.click(completeButton)
    await waitFor(() => {
      expect(api.portal.tasks.complete).toHaveBeenCalledWith('task-2')
    })
  })
})
