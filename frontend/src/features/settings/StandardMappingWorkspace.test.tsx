import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StandardMappingWorkspace } from './StandardMappingWorkspace'
import type { Organization } from '../../shared/model'
import type {
  RhnApi,
  ServiceCatalogItem,
  MedicationKnowledge,
  DiseaseConcept,
  ItemTermMappingMaintenance,
} from '../../shared/rhnApi'

const mockServices: ServiceCatalogItem[] = [
  {
    id: 'srv-001',
    revision: 1,
    itemTypeId: 'type-lab',
    code: 'DEMO-LAB-CRP',
    name: 'C反应蛋白测定',
    unitCode: '项',
    accountingCategory: 'LABORATORY',
    orderable: true,
    chargeable: true,
    sdStatus: 'ACTIVE',
    sdStatusText: '有效',
    validFrom: '2026-01-01',
    sdServiceType: 'LABORATORY',
    sdServiceTypeText: '检验',
    serviceSubtype: 'IMMUNOASSAY',
    sdUsageType: 'COMMON',
    sdUsageTypeText: '通用',
    medicalTechnology: true,
    combinationItem: false,
    singleOrder: true,
    pregnancyAlert: false,
    sdDuplicateRule: 'SAME_DAY',
    sdDuplicateRuleText: 'SAME_DAY',
    prices: [],
  },
  {
    id: 'srv-002',
    revision: 1,
    itemTypeId: 'type-exam',
    code: 'DEMO-EXAM-CT',
    name: '胸部多层螺旋CT平扫',
    unitCode: '部位',
    accountingCategory: 'EXAMINATION',
    orderable: true,
    chargeable: true,
    sdStatus: 'ACTIVE',
    sdStatusText: '有效',
    validFrom: '2026-01-01',
    sdServiceType: 'EXAMINATION',
    sdServiceTypeText: '检查',
    serviceSubtype: 'CT',
    sdUsageType: 'COMMON',
    sdUsageTypeText: '通用',
    medicalTechnology: true,
    combinationItem: false,
    singleOrder: true,
    pregnancyAlert: true,
    sdDuplicateRule: 'SAME_DAY',
    sdDuplicateRuleText: 'SAME_DAY',
    prices: [],
  },
]

const mockMedications: MedicationKnowledge[] = [
  {
    id: 'med-001',
    revision: 1,
    code: 'MED-AMOX-CAP',
    name: '阿莫西林胶囊',
    sdMedicationType: 'WESTERN_MEDICINE',
    sdMedicationTypeText: '西药',
    sdStatus: 'ACTIVE',
    sdStatusText: '有效',
    validFrom: '2026-01-01',
    preparationSpec: '0.25g*24粒/盒',
  } as unknown as MedicationKnowledge,
]

const mockDiseases: DiseaseConcept[] = [
  {
    id: 'dis-001',
    revision: 1,
    code: 'I10.x00',
    display: '原发性高血压',
    sdDiagnosisDomain: 'WESTERN_MEDICINE',
    sdDiagnosisDomainText: '西医疾病',
    sdStatus: 'ACTIVE',
    sdStatusText: '有效',
    definition: '以体循环动脉血压增高为主要特征',
  } as unknown as DiseaseConcept,
]

const mockMappingMaintenance: ItemTermMappingMaintenance = {
  subjectId: 'sub-001',
  subjectType: 'CATALOG_ITEM',
  targetId: 'srv-001',
  businessDate: '2026-09-24',
  effectiveMappings: [
    {
      id: 'map-001',
      revision: 1,
      subjectId: 'sub-001',
      subjectType: 'CATALOG_ITEM',
      targetId: 'srv-001',
      conceptId: 'con-001',
      codeSystemId: 'sys-001',
      systemCode: 'CHS-SERVICE-2023',
      systemName: '国家医疗保障服务项目代码',
      systemVersion: '2023版',
      authorityType: 'INSURANCE',
      termCode: 'YB-250101001',
      termDisplay: 'C反应蛋白测定(生化/免疫比浊法)',
      mappingType: 'INSURANCE',
      equivalence: 'EXACT',
      primaryMapping: true,
      validFrom: '2026-01-01',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'admin',
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'admin',
    },
  ],
  history: [
    {
      id: 'map-001',
      revision: 1,
      subjectId: 'sub-001',
      subjectType: 'CATALOG_ITEM',
      targetId: 'srv-001',
      conceptId: 'con-001',
      codeSystemId: 'sys-001',
      systemCode: 'CHS-SERVICE-2023',
      systemName: '国家医疗保障服务项目代码',
      systemVersion: '2023版',
      authorityType: 'INSURANCE',
      termCode: 'YB-250101001',
      termDisplay: 'C反应蛋白测定(生化/免疫比浊法)',
      mappingType: 'INSURANCE',
      equivalence: 'EXACT',
      primaryMapping: true,
      validFrom: '2026-01-01',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'admin',
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'admin',
    },
  ],
}

describe('StandardMappingWorkspace', () => {
  let queryClient: QueryClient
  let mockApi: Partial<RhnApi>
  const mockOrg: Organization = { id: 'org-001', name: '总院' } as unknown as Organization

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    mockApi = {
      masterData: {
        searchServices: vi.fn().mockResolvedValue({
          content: mockServices,
          totalElements: mockServices.length,
          totalPages: 1,
        }),
        searchMedications: vi.fn().mockResolvedValue({
          content: mockMedications,
          totalElements: mockMedications.length,
          totalPages: 1,
        }),
        searchDiseases: vi.fn().mockResolvedValue({
          content: mockDiseases,
          totalElements: mockDiseases.length,
          totalPages: 1,
        }),
        itemTermMappings: vi.fn().mockResolvedValue(mockMappingMaintenance),
        standardCodeSystems: vi.fn().mockResolvedValue([]),
        standardTerms: vi.fn().mockResolvedValue([]),
        saveItemTermMapping: vi.fn().mockResolvedValue(mockMappingMaintenance),
        changeItemTermMappingStatus: vi.fn().mockResolvedValue({}),
      } as unknown as RhnApi['masterData'],
    }
  })

  it('renders workspace page header and 4-column KPI cards', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StandardMappingWorkspace api={mockApi as RhnApi} organization={mockOrg} />
      </QueryClientProvider>
    )

    // PageHeader 标题与描述
    expect(screen.getByText('标准映射管理')).toBeInTheDocument()
    expect(screen.getByText(/统一维护诊疗服务、药品、疾病诊断等核心主数据/)).toBeInTheDocument()

    // 4 列 KPI 概览卡片
    expect(screen.getByText('当前域主数据总量')).toBeInTheDocument()
    expect(screen.getByText('医保目录对照 (贯标)')).toBeInTheDocument()
    expect(screen.getByText('国家 / 临床标准对照')).toBeInTheDocument()
    expect(screen.getByText('对照治理与版本状态')).toBeInTheDocument()
  })

  it('displays services by default and shows mapping details when item is selected', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StandardMappingWorkspace api={mockApi as RhnApi} organization={mockOrg} />
      </QueryClientProvider>
    )

    // 等待服务列表渲染
    expect(mockApi.masterData?.searchServices).toHaveBeenCalled()
    const elements = await screen.findAllByText('C反应蛋白测定')
    expect(elements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('胸部多层螺旋CT平扫')).toBeInTheDocument()

    // 默认选中第一项，右侧展示其有效映射卡片
    const termCodes = await screen.findAllByText('YB-250101001')
    expect(termCodes.length).toBeGreaterThanOrEqual(1)
    const termDisplays = screen.getAllByText('C反应蛋白测定(生化/免疫比浊法)')
    expect(termDisplays.length).toBeGreaterThanOrEqual(1)
    const systemNames = screen.getAllByText('国家医疗保障服务项目代码 · 2023版')
    expect(systemNames.length).toBeGreaterThanOrEqual(1)

    // 历史追溯表格
    expect(screen.getByText('映射全生命周期追溯')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '建立标准映射对照' })).toBeInTheDocument()
  })

  it('switches to medications domain and fetches medication items', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StandardMappingWorkspace api={mockApi as RhnApi} organization={mockOrg} />
      </QueryClientProvider>
    )

    // 切换到药品主档 Tab
    const medicationTab = screen.getByRole('tab', { name: /药品主档/ })
    fireEvent.click(medicationTab)

    expect(mockApi.masterData?.searchMedications).toHaveBeenCalled()
    const meds = await screen.findAllByText('阿莫西林胶囊')
    expect(meds.length).toBeGreaterThanOrEqual(1)
  })

  it('switches to diagnosis domain and displays ICD-10 & DRG skeleton preview', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StandardMappingWorkspace api={mockApi as RhnApi} organization={mockOrg} />
      </QueryClientProvider>
    )

    // 切换到疾病诊断 Tab
    const diseaseTab = screen.getByRole('tab', { name: /疾病诊断/ })
    fireEvent.click(diseaseTab)

    expect(mockApi.masterData?.searchDiseases).toHaveBeenCalled()
    const diseases = await screen.findAllByText('原发性高血压')
    expect(diseases.length).toBeGreaterThanOrEqual(1)

    // 检查疾病诊断的骨架内容
    expect(screen.getByText('疾病诊断标准映射管理（骨架设计）')).toBeInTheDocument()
    expect(screen.getByText(/国家临床版 ICD-10/)).toBeInTheDocument()
    expect(screen.getByText(/医保疾病诊断代码 \(CHS-DRG\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /建立诊断标准对照/ })).toBeInTheDocument()
  })

  it('switches to consumable domain and displays consumable skeleton notice', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StandardMappingWorkspace api={mockApi as RhnApi} organization={mockOrg} />
      </QueryClientProvider>
    )

    const consumableTab = screen.getByRole('tab', { name: /医用耗材/ })
    fireEvent.click(consumableTab)

    expect(await screen.findByText('医用耗材医保代码贯标对照（骨架设计）')).toBeInTheDocument()
    expect(screen.getByText(/国家医保局“医保医用耗材分类与代码”/)).toBeInTheDocument()
    const syringes = screen.getAllByText('一次性使用无菌注射器 (带针)')
    expect(syringes.length).toBeGreaterThanOrEqual(1)
  })

  it('opens standard mapping dialog on button click', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StandardMappingWorkspace api={mockApi as RhnApi} organization={mockOrg} />
      </QueryClientProvider>
    )

    const items = await screen.findAllByText('C反应蛋白测定')
    expect(items.length).toBeGreaterThanOrEqual(1)

    const createBtn = screen.getByRole('button', { name: '建立标准映射对照' })
    fireEvent.click(createBtn)

    // 弹窗打开
    expect(await screen.findByText('C反应蛋白测定 · 标准映射')).toBeInTheDocument()
    const validSections = await screen.findAllByText('业务日期下的有效映射')
    expect(validSections.length).toBeGreaterThanOrEqual(1)
  })

  it('triggers remote service search only when search button is clicked or Enter is pressed', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <StandardMappingWorkspace api={mockApi as RhnApi} organization={mockOrg} />
      </QueryClientProvider>
    )

    const searchInput = await screen.findByRole('searchbox', { name: '搜索诊疗项目' })
    expect(searchInput).toHaveAttribute('placeholder', '搜索诊疗项目名称或编码（回车或点击查询）')
    const queryBtn = screen.getByRole('button', { name: '查询' })
    const resetBtn = screen.getByRole('button', { name: '重置' })

    const initialCalls = vi.mocked(mockApi.masterData!.searchServices).mock.calls.length

    fireEvent.change(searchInput, { target: { value: 'CT' } })
    expect(vi.mocked(mockApi.masterData!.searchServices).mock.calls.length).toBe(initialCalls)

    fireEvent.click(queryBtn)
    expect(mockApi.masterData!.searchServices).toHaveBeenLastCalledWith('CT', '', '', 'org-001', 0, 20)

    fireEvent.click(resetBtn)
    expect(searchInput).toHaveValue('')
    expect(mockApi.masterData!.searchServices).toHaveBeenLastCalledWith('', '', '', 'org-001', 0, 20)
  })
})
