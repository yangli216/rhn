import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnifiedOrderListEditor, calculatePackageQuantity, type ServicePlanDraft } from './UnifiedOrderListEditor'
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
    expect(screen.getByText('搜索药品名称/拼音')).toBeInTheDocument()
  })

  it('keeps reading mode focused on persisted order content', () => {
    renderComponent({ readOnly: true })

    expect(screen.getByText('暂无已开立医嘱')).toBeInTheDocument()
    expect(screen.queryByText('操作')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('加入医嘱')).not.toBeInTheDocument()
  })

  it('renders embedded inline composer row with active status and keyboard continuous flow', () => {
    renderComponent()

    expect(screen.getByRole('table', { name: '本次医嘱连续录入列表' })).toBeInTheDocument()
    expect(screen.getByText('录入中')).toBeInTheDocument()
    expect(screen.getByLabelText('医嘱类型')).toBeInTheDocument()
    expect(screen.getByLabelText('发药数量')).toBeInTheDocument()
    expect(screen.getByTitle('加入待确认列表 (Enter / Ctrl+Enter)')).toBeInTheDocument()
    // 剂量单位不允许编辑：不存在 doctor-unified-dose-unit 输入框
    expect(screen.queryByLabelText('剂量单位')).not.toBeInTheDocument()
  })

  it('formats english unit code such as BOX to friendly chinese unit', () => {
    const draftWithEnglishUnit: MedicationPlanDraft = {
      ...mockMedicationDraft,
      request: {
        ...mockMedicationDraft.request,
        quantityUnit: 'BOX',
      },
    }
    renderComponent({ medicationDrafts: [draftWithEnglishUnit] })

    // 'BOX' 自动转为 '盒'
    expect(screen.getByText('盒')).toBeInTheDocument()
    expect(screen.queryByText('BOX')).not.toBeInTheDocument()
  })

  it('calculates package quantity accurately based on dose, frequency and duration', () => {
    // 场景 1：30mg * QD * 7天 = 210mg；制剂含量 30mg/片（7片）；包装系数 7片/盒 -> 1 盒
    const res1 = calculatePackageQuantity({
      medication: {
        preparationSpec: '30mg',
        preparationUnit: '片',
      } as any,
      doseValue: 30,
      doseUnit: 'mg',
      frequencyCode: 'QD',
      durationValue: 7,
      selectedPackage: {
        packageFactor: 7,
        unitName: '盒',
        unitCode: 'BOX',
      } as any,
    })
    expect(res1?.quantity).toBe(1)
    expect(res1?.totalBaseUnits).toBe(7)

    // 场景 2：20mg * BID * 5天 = 200mg；制剂含量 10mg/片（20片）；包装系数 10片/盒 -> 2 盒
    const res2 = calculatePackageQuantity({
      medication: {
        preparationSpec: '10mg',
        preparationUnit: '片',
      } as any,
      doseValue: 20,
      doseUnit: 'mg',
      frequencyCode: 'BID',
      durationValue: 5,
      selectedPackage: {
        packageFactor: 10,
        unitName: '盒',
        unitCode: 'BOX',
      } as any,
    })
    expect(res2?.quantity).toBe(2)
    expect(res2?.totalBaseUnits).toBe(20)

    // 场景 3：未整除向上取整：15片 / 10片每盒 -> 2 盒
    const res3 = calculatePackageQuantity({
      medication: {
        preparationSpec: '10mg',
        preparationUnit: '片',
      } as any,
      doseValue: 15,
      doseUnit: 'mg',
      frequencyCode: 'QD',
      durationValue: 10, // 150mg = 15片
      selectedPackage: {
        packageFactor: 10,
        unitName: '盒',
        unitCode: 'BOX',
      } as any,
    })
    expect(res3?.quantity).toBe(2)
    expect(res3?.totalBaseUnits).toBe(15)
  })

  it('renders pharmacy information and available stock for medication draft row', () => {
    const draftWithStock: MedicationPlanDraft = {
      ...mockMedicationDraft,
      stockSiteName: '门诊西药房',
      availablePackageQuantity: 75,
      packageUnitName: '盒',
    }
    renderComponent({ medicationDrafts: [draftWithStock] })

    expect(screen.getByText(/门诊西药房/)).toBeInTheDocument()
    expect(screen.getByText(/余量: 75盒/)).toBeInTheDocument()
  })
})

