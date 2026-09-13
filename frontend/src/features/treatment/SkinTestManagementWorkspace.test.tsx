import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { SkinTestWorkItem } from '../../shared/api/treatmentApi'
import type { RhnApi } from '../../shared/rhnApi'
import { SkinTestManagementWorkspace } from './SkinTestManagementWorkspace'

const clinicalContext = {
  organization: { id: 'org-1', name: '测试医院' },
  department: { id: 'dept-1', name: '门诊注射室' },
} as ClinicalContext

const dilutedItem: SkinTestWorkItem = {
  medicationRequestId: 'request-1', medicationRequestRevision: 2, requestNo: 'MR001',
  residentId: 'resident-1', residentName: '张测试', healthRecordNo: 'HR001', encounterId: 'encounter-1',
  organizationId: 'org-1', departmentId: 'dept-1', medicationId: 'med-1', medicationCode: 'PEN-G',
  medicationName: '青霉素钠', itemName: '注射用青霉素钠 80万单位', routeCode: 'IVGTT',
  doseValue: 800000, doseUnit: 'U', configuredTestMethod: 'INTRADERMAL',
  configuredSolutionMode: 'DILUTED_SOLUTION', configuredObservationMinutes: 20, resultValidityHours: 24,
  configurationInstructions: '皮试液500 U/ml，皮内注射0.1ml',
  settlementRequiredBeforeStart: false, dispenseRequiredBeforeStart: false,
  status: 'PENDING', originalSolution: false,
}

function renderWorkspace(item: SkinTestWorkItem) {
  const startSkinTest = vi.fn().mockResolvedValue({ ...item, status: 'IN_PROGRESS' })
  const api = {
    treatments: {
      skinTestWorklist: vi.fn().mockResolvedValue([item]),
      startSkinTest,
      completeSkinTest: vi.fn(),
      cancelSkinTest: vi.fn(),
    },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><MemoryRouter>
    <SkinTestManagementWorkspace api={api} clinicalContext={clinicalContext} />
  </MemoryRouter></QueryClientProvider>)
  return { ...view, startSkinTest }
}

describe('SkinTestManagementWorkspace', () => {
  it('uses the snapshotted non-original solution plan and allows skin testing before medication billing', async () => {
    const user = userEvent.setup()
    const { container, startSkinTest } = renderWorkspace(dilutedItem)

    const plan = await screen.findByLabelText('药品主数据皮试方案')
    expect(within(plan).getByText('非原液（配制试液）')).toBeInTheDocument()
    expect(within(plan).getByText('可先皮试')).toBeInTheDocument()
    expect(within(plan).getByText('20 分钟')).toBeInTheDocument()
    expect(screen.getByText(/可在药品结算和发药前进行/)).toBeInTheDocument()
    expect(container.querySelectorAll('select')).toHaveLength(0)

    await user.click(screen.getByRole('checkbox', { name: /已当面核对患者身份/ }))
    await user.click(screen.getByRole('button', { name: '确认开始并计时' }))

    await waitFor(() => expect(startSkinTest).toHaveBeenCalledWith('request-1', expect.objectContaining({
      expectedMedicationRevision: 2,
      testMethod: 'INTRADERMAL',
      originalSolution: false,
      observationMinutes: 20,
      solutionName: '按主数据方案配制的皮试液',
    })))
  })

  it('keeps an original-solution task blocked until medication settlement and dispensing complete', async () => {
    const original = {
      ...dilutedItem,
      configuredSolutionMode: 'ORIGINAL_SOLUTION' as const,
      settlementRequiredBeforeStart: true,
      dispenseRequiredBeforeStart: true,
      status: 'WAITING_SETTLEMENT' as const,
      gateMessage: '当前为原液皮试，药品费用尚未完成结算，暂不能开始皮试',
    }
    renderWorkspace(original)

    const plan = await screen.findByLabelText('药品主数据皮试方案')
    expect(within(plan).getByText('原液')).toBeInTheDocument()
    expect(within(plan).getByText('收费并发药后')).toBeInTheDocument()
    expect(screen.getByText(original.gateMessage)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认开始并计时' })).not.toBeInTheDocument()
  })
})
