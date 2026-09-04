import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { RhnApi } from '../../shared/rhnApi'
import { RefundManagementWorkspace } from './RefundManagementWorkspace'

describe('RefundManagementWorkspace', () => {
  const clinicalContext = {
    organization: { id: 'org-1', name: '基层医疗机构' },
    department: { id: 'dept-1', name: '全科医疗科' },
  } as ClinicalContext

  it('does not stay stuck in loading state when refund queue is empty', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([]),
        statement: vi.fn(),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><RefundManagementWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('暂无待退费业务')).toBeInTheDocument()
    expect(screen.queryByText('正在加载原支付记录…')).not.toBeInTheDocument()
    expect(screen.getAllByText('请选择待退费患者').length).toBeGreaterThan(0)
    expect(screen.getByText('请先选择患者')).toBeInTheDocument()
  })

  it('shows no account empty state when selected patient has no account', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([{
          encounterId: 'enc-refund-1',
          residentId: 'res-1',
          residentName: '张退费',
          gender: 'FEMALE',
          birthDate: '1990-01-01',
          encounterNo: 'MZ20260901001',
          status: 'PENDING_REFUND',
          sourceEventCount: 1,
          chargedEventCount: 0,
          accountBalance: -50,
          currencyCode: 'CNY',
          latestOccurredAt: '2026-09-01T01:00:00Z',
        }]),
        statement: vi.fn(),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><RefundManagementWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('暂无费用账户')).toBeInTheDocument()
    expect(screen.queryByText('正在加载原支付记录…')).not.toBeInTheDocument()
  })
})
