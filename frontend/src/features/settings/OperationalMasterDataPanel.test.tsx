import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalConfiguration, OrderFrequency, RhnApi, ServiceCatalogItem } from '../../shared/rhnApi'
import { ClinicalServiceConfigurationDialog, OperationalMasterDataPanel } from './OperationalMasterDataPanel'

const mockOrganization = {
  id: 'org-1',
  code: 'TH01',
  name: '青禾镇中心卫生院',
}

const mockServices: ServiceCatalogItem[] = [
  {
    id: 'srv-lab-1',
    revision: 1,
    code: 'LAB001',
    name: '全血细胞分析+CRP',
    sdServiceType: 'LABORATORY',
    sdServiceTypeText: '检验',
    sdUsageType: 'OUTPATIENT',
    sdUsageTypeText: '门诊',
    orderable: true,
    chargeable: true,
    singleOrder: true,
    prices: [{ id: 'p-1', price: 25, sdPriceType: 'STANDARD', sdStatus: 'ACTIVE' } as any],
    sdStatus: 'ACTIVE',
    sdStatusText: '启用',
  },
  {
    id: 'srv-lab-2',
    revision: 1,
    code: 'LAB002',
    name: '谷丙转氨酶(ALT)',
    sdServiceType: 'LABORATORY',
    sdServiceTypeText: '检验',
    sdUsageType: 'OUTPATIENT',
    sdUsageTypeText: '门诊',
    orderable: true,
    chargeable: true,
    singleOrder: true,
    prices: [{ id: 'p-2', price: 10, sdPriceType: 'STANDARD', sdStatus: 'ACTIVE' } as any],
    sdStatus: 'ACTIVE',
    sdStatusText: '启用',
  },
  {
    id: 'srv-tube-1',
    revision: 1,
    code: 'MAT001',
    name: '一次性真空采血管',
    sdServiceType: 'MATERIAL',
    sdServiceTypeText: '耗材',
    sdUsageType: 'OUTPATIENT',
    sdUsageTypeText: '门诊',
    orderable: false,
    chargeable: true,
    singleOrder: false,
    prices: [{ id: 'p-3', price: 3, sdPriceType: 'STANDARD', sdStatus: 'ACTIVE' } as any],
    sdStatus: 'ACTIVE',
    sdStatusText: '启用',
  },
  {
    id: 'srv-exam-1',
    revision: 1,
    code: 'EXAM001',
    name: '胸部多层螺旋CT平扫',
    sdServiceType: 'EXAMINATION',
    sdServiceTypeText: '检查',
    sdUsageType: 'OUTPATIENT',
    sdUsageTypeText: '门诊',
    orderable: true,
    chargeable: true,
    singleOrder: true,
    prices: [{ id: 'p-4', price: 180, sdPriceType: 'STANDARD', sdStatus: 'ACTIVE' } as any],
    sdStatus: 'ACTIVE',
    sdStatusText: '启用',
  },
] as unknown as ServiceCatalogItem[]

const mockLabConfiguration: ClinicalConfiguration = {
  serviceId: 'srv-lab-1',
  serviceCode: 'LAB001',
  serviceName: '全血细胞分析+CRP',
  serviceType: 'LABORATORY',
  specimenOptions: [
    { id: 'spec-1', code: 'WHOLE_BLOOD', name: '全血', sortOrder: 1 },
    { id: 'spec-2', code: 'SERUM', name: '血清', sortOrder: 2 },
  ],
  containerOptions: [
    { id: 'cont-1', code: 'EDTA_PURPLE', name: 'EDTA抗凝采血管(紫色)', sortOrder: 1 },
    { id: 'cont-2', code: 'SERUM_YELLOW', name: '促凝胶分离采血管(黄色)', sortOrder: 2 },
  ],
  laboratory: {
    serviceId: 'srv-lab-1',
    revision: 1,
    laboratoryMethod: 'IMPEDANCE',
    reportDuration: 0.5,
    reportDurationUnit: 'H',
    fastingRequired: false,
    pointOfCare: false,
    collectionDescription: 'EDTA抗凝全血，采血后轻柔颠倒5-8次混匀',
    specimens: [
      {
        id: 'sc-1',
        revision: 1,
        specimenItemId: 'spec-1',
        specimenCode: 'WHOLE_BLOOD',
        specimenName: '全血',
        containerItemId: 'cont-1',
        containerCode: 'EDTA_PURPLE',
        containerName: 'EDTA抗凝采血管(紫色)',
        minimumQuantity: 2,
        minimumQuantityUnit: 'ML',
        defaultSpecimen: true,
        requiredSpecimen: true,
        sortOrder: 10,
        status: 'ACTIVE',
        tubeGroupCode: 'EDTA_HEMATOLOGY',
        tubeSharingMode: 'SEPARATE',
        baseTubeCount: 1,
        tubeChargeMode: 'PER_TUBE',
        tubeChargeItemId: 'srv-tube-1',
        tubeChargeItemCode: 'MAT001',
        tubeChargeItemName: '一次性真空采血管',
        includedTubeCount: 0,
        tubeChargeQuantity: 1,
      },
    ],
  },
}

const mockExamConfiguration: ClinicalConfiguration = {
  serviceId: 'srv-exam-1',
  serviceCode: 'EXAM001',
  serviceName: '胸部多层螺旋CT平扫',
  serviceType: 'EXAMINATION',
  specimenOptions: [],
  containerOptions: [],
  examination: {
    serviceId: 'srv-exam-1',
    revision: 1,
    examinationType: 'CT',
    bodySiteRequired: true,
    multiBodySite: true,
    maxBodySiteCount: 3,
    preparationDescription: '检查前去除胸部金属异物',
    sitePricingMode: 'BASE_PLUS_FIXED',
    includedSiteCount: 1,
    additionalSitePrice: 80,
    additionalSiteQuantity: 1,
    maxChargeableSiteCount: 3,
    variants: [
      {
        id: 'var-1',
        revision: 1,
        code: 'CHEST',
        name: '胸部',
        methodType: 'PLAIN',
        bodySiteRequired: true,
        sortOrder: 10,
        status: 'ACTIVE',
      },
      {
        id: 'var-2',
        revision: 1,
        code: 'LUNG',
        name: '双肺',
        methodType: 'PLAIN',
        bodySiteRequired: true,
        sortOrder: 20,
        status: 'ACTIVE',
      },
    ],
    attachments: [
      {
        id: 'att-1',
        revision: 1,
        attachmentCatalogItemId: 'srv-tube-1',
        attachmentItemCode: 'MAT001',
        attachmentItemName: '一次性医用胶片',
        triggerType: 'ALWAYS',
        quantityBasis: 'PER_SITE',
        quantity: 1,
        requiredAttachment: true,
        separatelyChargeable: true,
        sortOrder: 10,
        status: 'ACTIVE',
      },
    ],
  },
}

function createMockApi(): RhnApi {
  return {
    masterData: {
      services: vi.fn().mockResolvedValue(mockServices),
      supplies: vi.fn().mockResolvedValue([]),
      itemGroups: vi.fn().mockResolvedValue([]),
      units: vi.fn().mockResolvedValue([{ id: 'u-1', code: 'ML', name: '毫升', symbol: 'ml', dimension: 'VOLUME', status: 'ACTIVE' }]),
      unitConversions: vi.fn().mockResolvedValue([]),
      orderFrequencies: vi.fn().mockResolvedValue([]),
      clinicalConfiguration: vi.fn().mockImplementation((id) => {
        if (id === 'srv-exam-1') return Promise.resolve(mockExamConfiguration)
        return Promise.resolve(mockLabConfiguration)
      }),
      laboratoryTubePlan: vi.fn().mockResolvedValue({
        groups: [
          {
            groupCode: 'EDTA_HEMATOLOGY',
            specimenName: '全血',
            containerName: 'EDTA抗凝采血管(紫色)',
            sharingMode: 'SEPARATE',
            tubeCount: 1,
            serviceIds: ['srv-lab-1'],
            chargeLines: [],
          },
        ],
        chargeLines: [
          {
            catalogItemId: 'srv-tube-1',
            itemCode: 'MAT001',
            itemName: '一次性真空采血管',
            quantity: 1,
            unitCode: '支',
            fixedAmount: 3,
            sourceType: 'TUBE_SURCHARGE',
            separatelyChargeable: true,
          },
        ],
      }),
      examinationChargePlan: vi.fn().mockResolvedValue({
        serviceId: 'srv-exam-1',
        siteCount: 2,
        sitePricingMode: 'BASE_PLUS_FIXED',
        includedSiteCount: 1,
        extraSiteCount: 1,
        lines: [
          { catalogItemId: 'srv-exam-1', itemCode: 'EXAM001', itemName: '胸部多层螺旋CT平扫', quantity: 1, sourceType: 'BASE_SERVICE', separatelyChargeable: true },
          { catalogItemId: 'srv-exam-1', itemCode: 'EXAM001', itemName: '多部位固定加收', quantity: 1, fixedAmount: 80, sourceType: 'MULTI_SITE_FIXED', separatelyChargeable: true },
        ],
      }),
      updateExaminationProfile: vi.fn().mockResolvedValue(mockExamConfiguration),
      updateLaboratoryProfile: vi.fn().mockResolvedValue(mockLabConfiguration),
    } as unknown as RhnApi['masterData'],
    organization: {
      departments: vi.fn().mockResolvedValue([]),
    } as unknown as RhnApi['organization'],
  } as unknown as RhnApi
}

describe('OperationalMasterDataPanel & ClinicalServiceConfigurationDialog', () => {
  it('renders laboratory clinical configuration with tube presets and live sidecar sandbox', async () => {
    const api = createMockApi()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ClinicalServiceConfigurationDialog
          api={api}
          service={mockServices[0]}
          organizationId={mockOrganization.id}
          dictionaries={{ BD_LAB_METHOD: [{ code: 'IMPEDANCE', name: '电阻抗法', sortOrder: 1 }] }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    // 等待项目配置与标本表格加载完成
    await waitFor(() => {
      expect(screen.getByText('可用标本、采血管与同次分管规则')).toBeInTheDocument()
    })

    expect(screen.getByText('全血细胞分析+CRP · 项目配置')).toBeInTheDocument()
    expect(screen.getByText('EDTA抗凝采血管(紫色)')).toBeInTheDocument()
    expect(screen.getByText('⚡ 同次采血分管沙盒')).toBeInTheDocument()

    // 检查右侧实时沙盒调用
    await waitFor(() => {
      expect(api.masterData.laboratoryTubePlan).toHaveBeenCalled()
    })
  })

  it('renders examination clinical configuration with multi-site pricing matrix and charge simulator', async () => {
    const api = createMockApi()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ClinicalServiceConfigurationDialog
          api={api}
          service={mockServices[3]}
          organizationId={mockOrganization.id}
          dictionaries={{
            BD_EXAM_TYPE: [{ code: 'CT', name: '计算机断层扫描(CT)', sortOrder: 1 }],
            BD_SERVICE_VARIANT_METHOD: [{ code: 'PLAIN', name: '平扫', sortOrder: 1 }],
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    // 等待检查项目配置与阶梯计费矩阵加载完成
    await waitFor(() => {
      expect(screen.getByText('多部位阶梯计费矩阵')).toBeInTheDocument()
    })

    expect(screen.getByText('胸部多层螺旋CT平扫 · 项目配置')).toBeInTheDocument()
    expect(screen.getByText(/阶梯 1 · 首部位/)).toBeInTheDocument()
    expect(screen.getByText(/阶梯 2 · 超出部位加收规则/)).toBeInTheDocument()

    // 检查右侧阶梯收费实时试算沙盒
    expect(screen.getByText('⚡ 阶梯收费实时试算沙盒')).toBeInTheDocument()

    await waitFor(() => {
      expect(api.masterData.examinationChargePlan).toHaveBeenCalled()
    })
  })

  it('opens item group dialog with dual-pane transfer picker and live tube perspective for LIS', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <OperationalMasterDataPanel
          api={api}
          organization={mockOrganization as any}
          manufacturers={[]}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('新增组套')).toBeInTheDocument()
    })

    await user.click(screen.getByText('新增组套'))

    // 确认弹窗弹出且展示双栏穿梭选择器
    await waitFor(() => {
      expect(screen.getByText('新增项目组套')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('输入项目名称或编码过滤…')).toBeInTheDocument()
    })

    // 点击加入全血细胞分析+CRP
    const addButtons = screen.getAllByRole('button', { name: '加入' })
    expect(addButtons.length).toBeGreaterThan(0)
    await user.click(addButtons[0])

    // 验证实时试算透视挂件已出现并触发调用
    await waitFor(() => {
      expect(screen.getByText('组套采血与试管加收实时透视')).toBeInTheDocument()
    })
  })

  it('supports in-place inline profile editing with pricing mode cards and direct save', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ClinicalServiceConfigurationDialog
          api={api}
          service={mockServices[3]}
          organizationId={mockOrganization.id}
          dictionaries={{
            BD_EXAM_TYPE: [{ code: 'CT', name: '计算机断层扫描(CT)', sortOrder: 1 }],
            BD_SERVICE_VARIANT_METHOD: [{ code: 'PLAIN', name: '平扫', sortOrder: 1 }],
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('多部位阶梯计费矩阵')).toBeInTheDocument()
    })

    // 点击“编辑项目基本配置”按钮
    const editBtn = screen.getByRole('button', { name: '编辑项目基本配置' })
    await user.click(editBtn)

    // 验证内联展开卡片出现，且带有4个计费模式卡片
    await waitFor(() => {
      expect(screen.getByText('检查项目执行属性与多部位阶梯计价规则')).toBeInTheDocument()
      expect(screen.getByText(/主项单次计费/)).toBeInTheDocument()
      expect(screen.getByText(/按部位数计主项/)).toBeInTheDocument()
      expect(screen.getByText(/基础部位 \+ 固定加收/)).toBeInTheDocument()
      expect(screen.getByText(/基础部位 \+ 加收项目/)).toBeInTheDocument()
    })

    // 按钮文案变为“收起基本配置”
    expect(screen.getByRole('button', { name: '收起基本配置' })).toBeInTheDocument()

    // 点击“保存配置”
    const saveBtn = screen.getByRole('button', { name: '保存配置' })
    await user.click(saveBtn)

    // 验证调用了 updateExaminationProfile
    await waitFor(() => {
      expect(api.masterData.updateExaminationProfile).toHaveBeenCalled()
    })

    // 验证保存后内联卡片收起
    await waitFor(() => {
      expect(screen.queryByText('检查项目执行属性与多部位阶梯计价规则')).not.toBeInTheDocument()
    })

    // 再次点击阶梯矩阵上的“调整阶梯规则”按钮，验证同样就地展开内联编辑卡片
    const adjustRuleBtn = screen.getByRole('button', { name: '调整阶梯规则' })
    await user.click(adjustRuleBtn)

    await waitFor(() => {
      expect(screen.getByText('检查项目执行属性与多部位阶梯计价规则')).toBeInTheDocument()
    })

    // 点击右上角“收起”按钮，平滑关闭内联卡片
    await user.click(screen.getByRole('button', { name: '收起' }))
    await waitFor(() => {
      expect(screen.queryByText('检查项目执行属性与多部位阶梯计价规则')).not.toBeInTheDocument()
    })
  })

  it('opens specimen dialog with workbench layout and applies tube template preset', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ClinicalServiceConfigurationDialog
          api={api}
          service={mockServices[0]}
          organizationId={mockOrganization.id}
          dictionaries={{ BD_LAB_METHOD: [{ code: 'IMPEDANCE', name: '电阻抗法', sortOrder: 1 }] }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('可用标本、采血管与同次分管规则')).toBeInTheDocument()
    })

    // 点击“新增标本规则”按钮
    const addRuleBtn = screen.getByRole('button', { name: '新增标本规则' })
    await user.click(addRuleBtn)

    // 验证弹窗以工作台双栏排版打开
    await waitFor(() => {
      expect(screen.getByText('新增标本与分管规则')).toBeInTheDocument()
      expect(screen.getByText('常用采血管预设方案')).toBeInTheDocument()
      expect(screen.getByText(/黄色促凝管 · 生化共管/)).toBeInTheDocument()
      expect(screen.getByText('01 标本类型与标准采血管容器')).toBeInTheDocument()
      expect(screen.getByText('02 同次开立分管与合管策略')).toBeInTheDocument()
      expect(screen.getByText('03 采血管耗材加收与送检指引')).toBeInTheDocument()
    })

    // 点击“黄色促凝管 · 生化共管”卡片一键套用
    const yellowTplCard = screen.getByText(/黄色促凝管 · 生化共管/).closest('button')
    expect(yellowTplCard).toBeTruthy()
    await user.click(yellowTplCard!)

    // 验证分管编码输入框已对用户隐式移除，且规则解读条呈现业务化中文解读
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('如 BIOCHEM_SERUM、EDTA_HEMATOLOGY')).not.toBeInTheDocument()
      expect(screen.getByText(/同组共管：同一采血医嘱下/)).toBeInTheDocument()
    })
  })

  it('supports tube sandbox search filtering, quick scenario buttons, and chip removal', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ClinicalServiceConfigurationDialog
          api={api}
          service={mockServices[0]}
          organizationId={mockOrganization.id}
          dictionaries={{ BD_LAB_METHOD: [{ code: 'IMPEDANCE', name: '电阻抗法', sortOrder: 1 }] }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('⚡ 同次采血分管沙盒')).toBeInTheDocument()
    })

    // 搜索过滤框可用
    const searchInput = screen.getByLabelText('搜索检验项目')
    expect(searchInput).toBeInTheDocument()

    // 默认展示已选当前项目胶囊，且未选的项目绝不会在下方列表中展示
    const chipPool = screen.getByLabelText('已选项目胶囊池')
    expect(chipPool).toBeInTheDocument()
    expect(within(chipPool).getByText(/全血细胞分析\+CRP/)).toBeInTheDocument()
    expect(screen.queryByText(/尿常规检查/)).not.toBeInTheDocument()
    expect(screen.queryByText(/谷丙转氨酶\(ALT\)/)).not.toBeInTheDocument()

    // 搜索“谷丙”过滤项目
    await user.type(searchInput, '谷丙')
    await waitFor(() => {
      expect(screen.getByText(/谷丙转氨酶\(ALT\)/)).toBeInTheDocument()
    })

    // 从下拉结果中选择谷丙转氨酶加入沙盒试算
    const altOption = screen.getByLabelText(/谷丙转氨酶\(ALT\)/)
    await user.click(altOption)

    // 已选胶囊池应显示 2 项，并出现可剔除的关闭按钮
    await waitFor(() => {
      expect(screen.getByText('已选 (2)：')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '移除 谷丙转氨酶(ALT)' })).toBeInTheDocument()
    })

    // 点击移除按钮剔除谷丙转氨酶
    const removeAltBtn = screen.getByRole('button', { name: '移除 谷丙转氨酶(ALT)' })
    await user.click(removeAltBtn)

    // 验证已选回退到仅 1 项
    await waitFor(() => {
      expect(screen.getByText('已选 (1)：')).toBeInTheDocument()
    })

    // 清空搜索框
    const clearSearchBtn = screen.getByRole('button', { name: '清空搜索' })
    await user.click(clearSearchBtn)
    expect(searchInput).toHaveValue('')
  })

  it('opens frequency configuration workbench dialog and triggers add config modal without being pushed out of view', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const mockFrequency: OrderFrequency = {
      id: 'freq-1',
      code: 'BID',
      name: '每日两次',
      shortName: 'BID',
      description: '每日两次，间隔约12小时',
      ruleType: 'TIMES_PER_PERIOD',
      frequencyCount: 2,
      periodValue: 1,
      periodUnit: 'D',
      anchorType: 'STANDARD_TIME',
      defaultExecutionTimes: ['08:00', '20:00'],
      outpatientApplicable: true,
      inpatientApplicable: true,
      emergencyApplicable: true,
      medicationApplicable: true,
      treatmentApplicable: true,
      nursingApplicable: false,
      automaticTaskGeneration: true,
      sortOrder: 1,
      status: 'ACTIVE',
      validFrom: '2026-01-01',
      configurations: [
        {
          id: 'cfg-1',
          frequencyId: 'freq-1',
          organizationId: 'org-1',
          localCode: 'BID',
          localName: '每日两次',
          executionTimes: ['08:00', '20:00'],
          firstDayPolicy: 'REMAINING_SLOTS',
          enabled: true,
          status: 'ACTIVE',
          validFrom: '2026-01-01',
        },
      ],
    }
    api.masterData.orderFrequencies = vi.fn().mockResolvedValue([mockFrequency])
    api.organization.departments = vi.fn().mockResolvedValue([
      { id: 'dept-1', code: 'IM', name: '内科', sdOrgStatus: 'ACTIVE' },
    ])
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <OperationalMasterDataPanel
          api={api}
          organization={mockOrganization as any}
          manufacturers={[]}
        />
      </QueryClientProvider>,
    )

    // 切换到“医嘱频次”卡片
    await waitFor(() => {
      expect(screen.getByText('医嘱频次')).toBeInTheDocument()
    })
    await user.click(screen.getByText('医嘱频次'))

    // 验证频次列表加载完成
    await waitFor(() => {
      expect(screen.getByText('每日两次')).toBeInTheDocument()
      expect(screen.getByText('1 条配置')).toBeInTheDocument()
    })

    // 点击“执行配置”
    const configButton = screen.getByRole('button', { name: '执行配置' })
    await user.click(configButton)

    // 验证弹出专属配置管理弹窗
    await waitFor(() => {
      expect(screen.getByText('每日两次 · 机构/科室执行配置')).toBeInTheDocument()
      expect(screen.getByText('执行配置列表 (1)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '新增执行配置' })).toBeInTheDocument()
      expect(screen.getByText('本频次执行排程试算')).toBeInTheDocument()
    })

    // 点击“新增执行配置”
    await user.click(screen.getByRole('button', { name: '新增执行配置' }))

    // 验证调起新增执行配置表单弹窗
    await waitFor(() => {
      expect(screen.getByText('每日两次 · 新增执行配置')).toBeInTheDocument()
      expect(screen.getByText('作用范围')).toBeInTheDocument()
      expect(screen.getByText('在当前范围启用')).toBeInTheDocument()
    })
  })
})
