import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { OutpatientFlowBoard } from '../../shared/api/outpatientFlowApi'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientFlowWorkspace } from './OutpatientFlowWorkspace'

describe('OutpatientFlowWorkspace composite visit', () => {
  it('shows every completed downstream stage before declaring that the patient can leave', async () => {
    const board: OutpatientFlowBoard = {
      businessDate: '2026-08-30', refreshedAt: '2026-08-30T12:50:00Z',
      summary: {
        totalCount: 1, waitingConsultationCount: 0, inConsultationCount: 0,
        downstreamPendingCount: 0, exceptionCount: 0, completedCount: 1,
      },
      visits: [{
        encounterId: 'encounter-composite', encounterNo: 'OP-COMPOSITE', residentId: 'resident-composite',
        residentName: '复合门诊居民', healthRecordNo: 'RHN-COMPOSITE', gender: 'FEMALE',
        clinicalStatus: 'COMPLETED', flowStatus: 'COMPLETED', flowStatusText: '流程完成',
        nextDestination: '可以离院', attentionReason: '接诊及诊后环节均已完成', pendingMinutes: 0,
        outstandingAmount: 0, registeredAt: '2026-08-30T12:00:00Z',
        startedAt: '2026-08-30T12:05:00Z', clinicalCompletedAt: '2026-08-30T12:20:00Z',
        stages: [
          { stageCode: 'CLINICAL', stageName: '接诊', status: 'COMPLETED', statusText: '诊毕', totalCount: 1, pendingCount: 0 },
          { stageCode: 'BILLING', stageName: '费用', status: 'COMPLETED', statusText: '已结算', totalCount: 1, pendingCount: 0 },
          { stageCode: 'PHARMACY', stageName: '取药', status: 'COMPLETED', statusText: '已完成', totalCount: 1, pendingCount: 0 },
          { stageCode: 'DIAGNOSTICS', stageName: '医技', status: 'COMPLETED', statusText: '已完成', totalCount: 2, pendingCount: 0 },
          { stageCode: 'TREATMENT', stageName: '治疗', status: 'COMPLETED', statusText: '已完成', totalCount: 1, pendingCount: 0 },
        ],
      }],
    }
    const api = { outpatientFlow: { board: vi.fn().mockResolvedValue(board) } } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科门诊' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <OutpatientFlowWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </QueryClientProvider>)

    await userEvent.click(await screen.findByRole('button', { name: /流程完成.*1/ }))
    const row = await screen.findByRole('row', { name: /复合门诊居民/ })
    expect(row).toHaveTextContent('接诊诊毕')
    expect(row).toHaveTextContent('费用已结算')
    expect(row).toHaveTextContent('取药已完成')
    expect(row).toHaveTextContent('医技已完成 · 2项')
    expect(row).toHaveTextContent('治疗已完成')
    expect(row).toHaveTextContent('可以离院')
    expect(row).toHaveTextContent('接诊及诊后环节均已完成')
  })

  it('renders standard SearchField and supports list pagination', async () => {
    const user = userEvent.setup()
    const visits = Array.from({ length: 15 }, (_, i) => ({
      encounterId: `encounter-${i + 1}`,
      encounterNo: `OP-${i + 1}`,
      residentId: `res-${i + 1}`,
      residentName: `患者${i + 1}`,
      healthRecordNo: `HR${i + 1}`,
      gender: 'MALE' as const,
      clinicalStatus: 'REGISTERED' as const,
      flowStatus: 'WAITING_CONSULTATION' as const,
      flowStatusText: '候诊中',
      nextDestination: '1号诊室',
      attentionReason: '等待医生接诊',
      pendingMinutes: i * 5,
      outstandingAmount: 0,
      registeredAt: '2026-08-30T08:00:00Z',
      stages: [
        { stageCode: 'CLINICAL' as const, stageName: '接诊', status: 'IN_PROGRESS' as const, statusText: '候诊中', totalCount: 1, pendingCount: 1 },
      ],
    }))

    const board: OutpatientFlowBoard = {
      businessDate: '2026-08-30',
      refreshedAt: '2026-08-30T12:50:00Z',
      summary: {
        totalCount: 15,
        waitingConsultationCount: 15,
        inConsultationCount: 0,
        downstreamPendingCount: 0,
        exceptionCount: 0,
        completedCount: 0,
      },
      visits,
    }

    const api = { outpatientFlow: { board: vi.fn().mockResolvedValue(board) } } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科门诊' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <OutpatientFlowWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </QueryClientProvider>
    )

    // 1. Verify standard SearchField exists with icon and clearable attribute
    const searchField = container.querySelector('.ui-search-field')
    expect(searchField).toBeInTheDocument()
    const searchInput = screen.getByRole('searchbox', { name: '搜索患者' })
    expect(searchInput).toHaveAttribute('placeholder', '姓名 / 档案号 / 就诊号（回车或点击查询）')
    expect(screen.getByRole('button', { name: '查询' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument()

    // 2. Verify Pagination renders with total and page navigation
    expect(await screen.findByText('共 15 条记录')).toBeInTheDocument()
    expect(screen.getByText('患者1')).toBeInTheDocument()
    expect(screen.getByText('患者10')).toBeInTheDocument()
    // Patient 11 should be on page 2
    expect(screen.queryByText('患者11')).not.toBeInTheDocument()

    // 3. Navigate to next page
    const nextBtn = screen.getByRole('button', { name: '下一页' })
    expect(nextBtn).toBeEnabled()
    await user.click(nextBtn)
    expect(screen.getByText('患者11')).toBeInTheDocument()
    expect(screen.getByText('患者15')).toBeInTheDocument()
    expect(screen.queryByText('患者1')).not.toBeInTheDocument()

    // 4. Test page size change
    const pageSizeSelect = screen.getByRole('combobox', { name: '每页显示条数' })
    await user.selectOptions(pageSizeSelect, '20')
    // All 15 items should now be on page 1
    expect(screen.getByText('患者1')).toBeInTheDocument()
    expect(screen.getByText('患者15')).toBeInTheDocument()

    // 5. Test search keyword does not trigger remote call until Enter or Search button is clicked
    const callsBefore = vi.mocked(api.outpatientFlow.board).mock.calls.length
    await user.type(searchInput, '张三')
    expect(vi.mocked(api.outpatientFlow.board).mock.calls.length).toBe(callsBefore)

    await user.click(screen.getByRole('button', { name: '查询' }))
    expect(vi.mocked(api.outpatientFlow.board)).toHaveBeenCalledWith(expect.any(String), expect.any(String), undefined, '张三')
  })
})
