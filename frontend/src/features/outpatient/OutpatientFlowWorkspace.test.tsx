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
})
