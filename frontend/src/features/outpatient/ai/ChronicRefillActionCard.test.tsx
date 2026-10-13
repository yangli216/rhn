import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChronicRefillActionCard } from './ChronicRefillActionCard'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { HistoricalStablePlan } from '../../../shared/api/outpatientPlanTemplatesApi'

const mockEncounter: Encounter = {
  id: 'enc-1',
  residentId: 'res-1',
  encounterNo: 'E-001',
  organizationId: 'org-1',
  departmentId: 'dept-1',
  registeredAt: '2026-10-13T09:00:00Z',
  status: 'IN_PROGRESS',
  diagnoses: [],
}

const mockStablePlan: HistoricalStablePlan = {
  encounterId: 'enc-1',
  sourceEncounterId: 'enc-0',
  conditionTitle: '高血压 历史方案',
  summary: '识别 1 项稳定用药',
  diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
  medications: [
    {
      medicationId: 'med-01',
      medicationName: '苯磺酸氨氯地平片 5mg',
      doseValue: 5,
      doseUnit: 'mg',
      routeCode: 'PO',
      frequencyCode: 'QD',
      medicationInstruction: '口服，每日一次',
      quantity: 1,
      selfProvided: false,
      substitutionAllowed: false,
    },
  ],
  services: [],
  guidanceNotes: [],
  reviewItems: [],
  assessedCategories: ['MEDICATION'],
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('ChronicRefillActionCard', () => {
  it('renders stable plan medications and provides one-click refill action', async () => {
    const mockApi = {
      outpatientPlanTemplates: {
        getHistoricalStablePlan: vi.fn().mockResolvedValue(mockStablePlan),
      },
    } as unknown as RhnApi

    const handleApply = vi.fn()
    const handleOpenHistory = vi.fn()

    renderWithClient(
      <ChronicRefillActionCard
        encounter={mockEncounter}
        api={mockApi}
        sceneAssessment={{
          scene: 'CHRONIC_REFILL',
          sceneLabel: '慢病复诊配药',
          badgeTone: 'info',
          summaryText: '慢病复诊测试',
          matchedConditions: ['高血压'],
          reportHighlights: [],
          selectedReportIds: [],
          chronicEncounterIds: ['enc-0'],
        }}
        diagnosticReports={[]}
        disabled={false}
        busy={false}
        onApply={handleApply}
        onOpenHistory={handleOpenHistory}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('慢病智能续方推荐')).toBeInTheDocument()
      expect(screen.getByText('苯磺酸氨氯地平片 5mg')).toBeInTheDocument()
      expect(screen.getByText('5mg 口服，每日一次')).toBeInTheDocument()
    })

    const applyButton = screen.getByRole('button', { name: /一键安全续方/ })
    fireEvent.click(applyButton)

    expect(handleApply).toHaveBeenCalledWith(
      expect.objectContaining({
        recordDraft: expect.objectContaining({
          chiefComplaint: '高血压复诊配药',
          presentIllness: expect.stringContaining('患者既往明确高血压病史'),
        }),
      })
    )
    expect(handleOpenHistory).toHaveBeenCalled()
  })

  it('triggers onGenerate with synthesized clinical prompt when onGenerate is provided', async () => {
    const mockApi = {
      outpatientPlanTemplates: {
        getHistoricalStablePlan: vi.fn().mockResolvedValue(mockStablePlan),
      },
    } as unknown as RhnApi

    const handleApply = vi.fn()
    const handleGenerate = vi.fn().mockResolvedValue('draft-101')

    renderWithClient(
      <ChronicRefillActionCard
        encounter={mockEncounter}
        api={mockApi}
        sceneAssessment={{
          scene: 'CHRONIC_REFILL',
          sceneLabel: '慢病复诊配药',
          badgeTone: 'info',
          summaryText: '慢病复诊测试',
          matchedConditions: ['高血压'],
          reportHighlights: [],
          selectedReportIds: [],
          chronicEncounterIds: ['enc-0'],
        }}
        diagnosticReports={[]}
        disabled={false}
        busy={false}
        onApply={handleApply}
        onGenerate={handleGenerate}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('慢病智能续方推荐')).toBeInTheDocument()
    })

    const applyButton = screen.getByRole('button', { name: /一键安全续方/ })
    fireEvent.click(applyButton)

    expect(handleGenerate).toHaveBeenCalledWith(
      expect.stringContaining('【慢病复诊规范病历生成指令】')
    )
    expect(handleGenerate).toHaveBeenCalledWith(
      expect.stringContaining('苯磺酸氨氯地平片 5mg')
    )
  })
})
