import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { Dashboard } from './Dashboard'

describe('Dashboard quick access and navigation', () => {
  const mockSummary = {
    tasks: { ready: 3, inProgress: 2, overdue: 1, totalOpen: 6 },
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

  function renderDashboard(props?: {
    onStart?: () => void
    onOpenTasks?: () => void
    onNavigate?: (path: string) => void
  }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard
          api={mockApi}
          onStart={props?.onStart ?? vi.fn()}
          onOpenTasks={props?.onOpenTasks ?? vi.fn()}
          onNavigate={props?.onNavigate ?? vi.fn()}
        />
      </QueryClientProvider>
    )
  }

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
