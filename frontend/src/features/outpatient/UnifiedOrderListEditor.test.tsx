import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnifiedOrderListEditor, type ServicePlanDraft } from './UnifiedOrderListEditor'
import type { MedicationPlanDraft } from './PrescriptionListEditor'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'

describe('UnifiedOrderListEditor', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const mockApi = {
    clinicalResources: {
      search: vi.fn().mockResolvedValue([]),
    },
    masterData: {
      activeOrderFrequencies: vi.fn().mockResolvedValue([]),
      activeMedicationRoutes: vi.fn().mockResolvedValue([]),
    },
  } as unknown as RhnApi

  const mockEncounter: Encounter = {
    id: 'enc-1',
    residentId: 'res-1',
    encounterNo: 'ENC001',
    organizationId: 'org-1',
    departmentId: 'dept-1',
    status: 'IN_PROGRESS',
    registeredAt: '2026-09-02T10:00:00Z',
    diagnoses: [],
  }

  const mockMedicationDraft: MedicationPlanDraft = {
    id: 'draft-med-1',
    editorMode: 'regular',
    categoryCode: 'WESTERN',
    medicationName: '阿莫西林胶囊',
    medicationCode: 'MED001',
    preparationSpec: '0.25g*24粒/盒',
    productName: '阿莫西林胶囊',
    request: {
      medicationId: 'm-1',
      doseValue: 0.5,
      doseUnit: 'g',
      routeCode: '口服',
      frequencyCode: 'TID',
      durationValue: 3,
      durationUnit: '天',
      quantity: 1,
      quantityUnit: '盒',
      substitutionAllowed: false,
      selfProvided: false,
      medicationInstruction: '饭后服用',
    },
  }

  const mockServiceDraft: ServicePlanDraft = {
    id: 'draft-srv-1',
    serviceType: 'LABORATORY',
    catalogItemId: 'srv-1',
    itemCode: 'LAB001',
    itemName: '血常规五分类',
    quantity: 1,
    unitCode: '次',
    clinicalDescription: '空腹抽血',
  }

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <UnifiedOrderListEditor
          encounter={mockEncounter}
          api={mockApi}
          medicationDrafts={[]}
          setMedicationDrafts={vi.fn()}
          serviceDrafts={[]}
          setServiceDrafts={vi.fn()}
          allergies={[]}
          {...props}
        />
      </QueryClientProvider>,
    )
  }

  it('renders read row with clear structured tags and usage pills for medication', () => {
    renderComponent({ medicationDrafts: [mockMedicationDraft] })

    // Check medication name and specification tag
    expect(screen.getByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(screen.getByText('0.25g*24粒/盒')).toBeInTheDocument()

    // Check usage pill
    expect(screen.getByText(/0.5g · 口服 · TID · 3天/)).toBeInTheDocument()

    // Check quantity and actions
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('盒')).toBeInTheDocument()
    expect(screen.getByText('待确认')).toBeInTheDocument()
  })

  it('renders read row for service orders properly', () => {
    renderComponent({ serviceDrafts: [mockServiceDraft] })

    expect(screen.getByText('血常规五分类')).toBeInTheDocument()
    expect(screen.getAllByText('检验').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('空腹抽血')).toBeInTheDocument()
  })

  it('renders stream entry box with keyboard shortcut hint', () => {
    renderComponent()

    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()
    expect(screen.getByText('搜索药品名称/拼音/编码')).toBeInTheDocument()
  })

  it('keeps reading mode focused on persisted order content', () => {
    renderComponent({ readOnly: true })

    expect(screen.getByText('暂无已开立医嘱')).toBeInTheDocument()
    expect(screen.queryByText('操作')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('加入医嘱')).not.toBeInTheDocument()
  })
})
