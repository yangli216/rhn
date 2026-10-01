import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  return render(
    <QueryClientProvider client={queryClient}>
      <TasksWorkspace api={api} onNavigate={onNavigate} />
    </QueryClientProvider>,
  )
}

describe('TasksWorkspace', () => {
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
