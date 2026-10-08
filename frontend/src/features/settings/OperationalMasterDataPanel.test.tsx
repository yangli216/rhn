import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      serviceAliases: vi.fn().mockResolvedValue([]),
      replaceServiceAliases: vi.fn().mockResolvedValue([]),
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
      previewOrderFrequency: vi.fn().mockResolvedValue({
        explanation: '根据全院规则自动计算执行时间',
        plannedTimes: ['2026-09-10T08:00:00', '2026-09-10T20:00:00'],
      }),
    } as unknown as RhnApi['masterData'],
    organization: {
      departments: vi.fn().mockResolvedValue([]),
    } as unknown as RhnApi['organization'],
  } as unknown as RhnApi
}

describe('OperationalMasterDataPanel & ClinicalServiceConfigurationDialog', () => {
  it('keeps examination preview tied to current inputs across late responses, failures and clearing', async () => {
    const api = createMockApi()
    const plan = (name: string) => ({ serviceId: 'srv-exam-1', siteCount: 2, sitePricingMode: 'SINGLE' as const,
      includedSiteCount: 1, extraSiteCount: 1, lines: [{ catalogItemId: 'srv-exam-1', itemCode: 'EXAM001',
        itemName: name, quantity: 1, sourceType: 'BASE_SERVICE', separatelyChargeable: true }] })
    let finishOld!: (value: ReturnType<typeof plan>) => void
    vi.mocked(api.masterData.examinationChargePlan)
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValue(plan('当前输入的收费项目'))
    renderClinical(api, mockServices[3])
    const region = await screen.findByRole('region', { name: '检查收费规则试算' })
    fireEvent.click(within(region).getByRole('checkbox', { name: '双肺 (LUNG)' }))
    expect(await within(region).findByText('当前输入的收费项目')).toBeInTheDocument()
    await act(async () => { finishOld(plan('旧输入的收费项目')) })
    expect(within(region).queryByText('旧输入的收费项目')).not.toBeInTheDocument()
    expect(within(region).getByText('部分项目尚未计价，当前无法确认费用合计。')).toBeInTheDocument()
    vi.mocked(api.masterData.examinationChargePlan).mockRejectedValueOnce(new Error('收费试算失败'))
    fireEvent.click(within(region).getByRole('button', { name: '刷新试算' }))
    expect(await screen.findByText('收费试算失败')).toBeInTheDocument()
    expect(within(region).queryByText('当前输入的收费项目')).not.toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: '刷新试算' }))
    expect(await within(region).findByText('当前输入的收费项目')).toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: '清空' }))
    expect(within(region).queryByText('当前输入的收费项目')).not.toBeInTheDocument()
    expect(within(region).getByRole('button', { name: '刷新试算' })).toBeDisabled()
  })

  it('does not use late tube results or replace a blank quantity with one', async () => {
    const api = createMockApi()
    const plan = (name: string) => ({ groups: [], chargeLines: [{ catalogItemId: 'tube', itemCode: 'TUBE',
      itemName: name, quantity: 1, sourceType: 'TUBE_SURCHARGE', separatelyChargeable: true }] })
    let finishOld!: (value: ReturnType<typeof plan>) => void
    vi.mocked(api.masterData.laboratoryTubePlan)
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValue(plan('当前数量的分管加收'))
    renderClinical(api)
    const quantity = await screen.findByLabelText('全血细胞分析+CRP数量')
    fireEvent.change(quantity, { target: { value: '2' } })
    expect(await screen.findByText('当前数量的分管加收')).toBeInTheDocument()
    await act(async () => { finishOld(plan('旧数量的分管加收')) })
    expect(screen.queryByText('旧数量的分管加收')).not.toBeInTheDocument()
    fireEvent.change(quantity, { target: { value: '' } })
    expect(await screen.findByText('试算数量必须填写大于零的有效数字。')).toBeInTheDocument()
    expect(api.masterData.laboratoryTubePlan).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('当前数量的分管加收')).not.toBeInTheDocument()
  })

  it('does not report unpriced group tube charges as zero and clears a failed refresh', async () => {
    const api = createMockApi()
    vi.mocked(api.masterData.laboratoryTubePlan).mockResolvedValue({
      groups: [{ groupCode: 'TEST', specimenItemId: 'spec', specimenCode: 'WHOLE_BLOOD', specimenName: '全血',
        sharingMode: 'SEPARATE', tubeCount: 1, serviceIds: ['srv-lab-1'], chargeLines: [] }],
      chargeLines: [{ catalogItemId: 'tube', itemCode: 'TUBE', itemName: '实际试管加收', quantity: 1,
        sourceType: 'TUBE_SURCHARGE', separatelyChargeable: true }],
    })
    renderOperational(api)
    fireEvent.click(await screen.findByRole('button', { name: '新增组套' }))
    fireEvent.click(screen.getAllByRole('button', { name: '加入' })[0])
    expect(await screen.findByText('金额待计价')).toBeInTheDocument()
    expect(screen.queryByText('¥ 0.00')).not.toBeInTheDocument()
    vi.mocked(api.masterData.laboratoryTubePlan).mockRejectedValueOnce(new Error('组套分管试算失败'))
    fireEvent.click(screen.getByRole('button', { name: '重新试算分管' }))
    expect(await screen.findByText('组套分管试算失败')).toBeInTheDocument()
    expect(screen.queryByText('金额待计价')).not.toBeInTheDocument()
    expect(screen.queryByText('预计生成采血管')).not.toBeInTheDocument()
  })

  it('invalidates unit conversion results on input changes and refresh failure, while accepting actual zero', async () => {
    const api = createMockApi()
    api.masterData.units = vi.fn().mockResolvedValue([
      { id: 'ml', code: 'ML', name: '毫升', dimension: 'VOLUME', status: 'ACTIVE' },
      { id: 'l', code: 'L', name: '升', dimension: 'VOLUME', status: 'ACTIVE' },
    ])
    let finishOld!: (value: unknown) => void
    api.masterData.convertUnit = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockImplementation((input, from, to, catalogItemId, effectiveDate) => Promise.resolve({
        input, fromUnitCode: from, result: input / 1000, toUnitCode: to, catalogItemId, effectiveDate, path: [from, to],
      }))
    renderOperational(api)
    fireEvent.click(screen.getByText('计量与换算'))
    await screen.findByText('换算试算')
    const user = userEvent.setup()
    const region = document.querySelector('.unit-converter') as HTMLElement
    await user.click(within(region).getByRole('combobox', { name: '来源单位' }))
    await user.click(screen.getByRole('option', { name: /毫升/ }))
    await user.click(within(region).getByRole('combobox', { name: '目标单位' }))
    await user.click(screen.getByRole('option', { name: /^升/ }))
    fireEvent.click(within(region).getByRole('button', { name: '试算' }))
    fireEvent.change(screen.getByLabelText('换算数量'), { target: { value: '2' } })
    fireEvent.click(within(region).getByRole('button', { name: '试算' }))
    expect(await within(region).findByText('2 毫升 = 0.002 升 · 毫升 → 升')).toBeInTheDocument()
    await act(async () => { finishOld({ input: 1, fromUnitCode: 'ML', result: 0.001, toUnitCode: 'L', effectiveDate: new Date().toISOString().slice(0, 10), path: ['ML', 'L'] }) })
    expect(within(region).queryByText('1 毫升 = 0.001 升 · 毫升 → 升')).not.toBeInTheDocument()
    vi.mocked(api.masterData.convertUnit).mockRejectedValueOnce(new Error('单位换算失败'))
    fireEvent.click(within(region).getByRole('button', { name: '试算' }))
    expect(await screen.findByText('单位换算失败')).toBeInTheDocument()
    expect(within(region).queryByRole('status')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('换算数量'), { target: { value: '' } })
    expect(within(region).getByRole('button', { name: '试算' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('换算数量'), { target: { value: '0' } })
    fireEvent.click(within(region).getByRole('button', { name: '试算' }))
    expect(await within(region).findByText('0 毫升 = 0 升 · 毫升 → 升')).toBeInTheDocument()
  })

  it.each([
    ['itemGroups', '项目组套'], ['services', '项目组套'], ['units', '项目组套'],
    ['supplies', '耗材与器械'], ['unitConversions', '计量与换算'],
    ['orderFrequencies', '医嘱频次'], ['departments', '医嘱频次'],
  ] as const)('shows %s query failure instead of an empty operational list', async (source, tab) => {
    const api = createMockApi()
    const query = source === 'departments' ? api.organization.departments : api.masterData[source]
    vi.mocked(query).mockRejectedValue(new Error('业务数据读取失败'))
    renderOperational(api)
    fireEvent.click(screen.getByText(tab))
    expect(await screen.findByText('运营主数据加载失败')).toBeInTheDocument()
    expect(screen.getByText('业务数据读取失败')).toBeInTheDocument()
    expect(screen.queryByText(/暂无项目组套|暂无耗材\/器械资料|暂无医嘱频次/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新增组套|新增耗材|新增频次|新增单位|新增换算/ })).not.toBeInTheDocument()
    vi.mocked(query).mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    await waitFor(() => expect(screen.queryByText('运营主数据加载失败')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /新增组套|新增耗材|新增频次|新增单位/ })).toBeEnabled()
  })

  it('does not display stale groups when reloading them fails', async () => {
    const api = createMockApi()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['master-data-operational-groups'], [{ id: 'old', name: '缓存组套', groupType: 'LIS', members: [], status: 'ACTIVE' }])
    vi.mocked(api.masterData.itemGroups).mockRejectedValue(new Error('刷新失败'))
    renderOperational(api, client)
    expect(await screen.findByText('运营主数据加载失败')).toBeInTheDocument()
    expect(screen.queryByText('缓存组套')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
  })

  it('rejects malformed list responses instead of treating them as empty lists', async () => {
    const api = createMockApi()
    vi.mocked(api.masterData.itemGroups).mockResolvedValue({} as never)
    renderOperational(api)
    expect(await screen.findByText('项目组套返回的数据格式不正确，请重新加载。')).toBeInTheDocument()
    expect(screen.queryByText('暂无项目组套')).not.toBeInTheDocument()
  })

  it('loads required units before offering group maintenance and preserves real empty results', async () => {
    const api = createMockApi()
    let finish!: (value: []) => void
    vi.mocked(api.masterData.units).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    renderOperational(api)
    expect(screen.getByText('正在加载运营主数据…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新增组套' })).not.toBeInTheDocument()
    finish([])
    expect(await screen.findByText('暂无项目组套')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增组套' })).toBeEnabled()
  })

  it('keeps unit form input on failure and prevents duplicate submit or dismissal while saving', async () => {
    const api = createMockApi()
    let rejectSave!: (error: Error) => void
    api.masterData.createUnit = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject }))
      .mockResolvedValue({ id: 'unit-new', revision: 0, code: 'TEST', name: '实际单位', dimension: 'COUNT', decimalScale: 0, status: 'ACTIVE' })
    renderOperational(api)
    fireEvent.click(screen.getByText('计量与换算'))
    fireEvent.click(await screen.findByRole('button', { name: '新增单位' }))
    const code = screen.getByLabelText(/单位编码/)
    fireEvent.change(code, { target: { value: 'TEST' } })
    fireEvent.change(screen.getByLabelText(/单位名称/), { target: { value: '实际单位' } })
    const form = code.closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(api.masterData.createUnit).toHaveBeenCalledTimes(1)
    expect(code).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    rejectSave(new Error('单位保存失败'))
    expect(await screen.findByText('单位保存失败')).toBeInTheDocument()
    expect(code).toHaveValue('TEST')
    expect(code).toBeEnabled()
    expect(screen.queryByText('计量单位已新增')).not.toBeInTheDocument()
    fireEvent.submit(form)
    expect(await screen.findByText('计量单位已新增')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('propagates group save failures into the open form', async () => {
    const api = createMockApi()
    api.masterData.createItemGroup = vi.fn().mockRejectedValue(new Error('组套保存失败'))
    renderOperational(api)
    fireEvent.click(await screen.findByRole('button', { name: '新增组套' }))
    const code = screen.getByLabelText(/组套编码/)
    fireEvent.change(code, { target: { value: 'TEST_GROUP' } })
    fireEvent.change(screen.getByLabelText(/组套名称/), { target: { value: '实际组套' } })
    fireEvent.submit(code.closest('form')!)
    expect(await screen.findByText('组套保存失败')).toBeInTheDocument()
    expect(code).toHaveValue('TEST_GROUP')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('项目组套已新增')).not.toBeInTheDocument()
  })

  function renderOperational(api: RhnApi, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
    return render(<QueryClientProvider client={client}>
      <OperationalMasterDataPanel api={api} organization={mockOrganization as any} manufacturers={[]} />
    </QueryClientProvider>)
  }

  it.each([
    { service: mockServices[0], configuration: { ...mockLabConfiguration, laboratory: undefined }, label: '检验' },
    { service: mockServices[3], configuration: { ...mockExamConfiguration, examination: undefined }, label: '检查' },
  ])('shows missing $label configuration without fabricating defaults or a simulator', async ({ service, configuration, label }) => {
    const api = createMockApi()
    vi.mocked(api.masterData.clinicalConfiguration).mockResolvedValue(configuration)
    renderClinical(api, service)
    expect(await screen.findByText(`${label}执行与收费配置缺失，请先维护项目主档；当前无法编辑或试算。`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑项目基本配置' })).not.toBeInTheDocument()
    expect(screen.queryByText('常规')).not.toBeInTheDocument()
    expect(api.masterData.examinationChargePlan).not.toHaveBeenCalled()
    expect(api.masterData.laboratoryTubePlan).not.toHaveBeenCalled()
    vi.mocked(api.masterData.clinicalConfiguration).mockResolvedValue(service === mockServices[0] ? mockLabConfiguration : mockExamConfiguration)
    fireEvent.click(screen.getByRole('button', { name: '重新加载配置' }))
    expect(await screen.findByRole('button', { name: '编辑项目基本配置' })).toBeInTheDocument()
  })

  it.each([
    { name: 'missing revision', configuration: { ...mockLabConfiguration, laboratory: { ...mockLabConfiguration.laboratory, revision: undefined } } },
    { name: 'unknown fasting requirement', configuration: { ...mockLabConfiguration, laboratory: { ...mockLabConfiguration.laboratory, fastingRequired: undefined } } },
    { name: 'wrong service', configuration: { ...mockLabConfiguration, serviceId: 'another-service' } },
    { name: 'mixed profiles', configuration: { ...mockLabConfiguration, examination: mockExamConfiguration.examination } },
  ])('rejects malformed configuration: $name', async ({ configuration }) => {
    const api = createMockApi()
    vi.mocked(api.masterData.clinicalConfiguration).mockResolvedValue(configuration as ClinicalConfiguration)
    renderClinical(api)
    expect(await screen.findByText('执行与收费配置不可用')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑项目基本配置' })).not.toBeInTheDocument()
    expect(api.masterData.laboratoryTubePlan).not.toHaveBeenCalled()
  })

  it.each(['clinicalConfiguration', 'services', 'units'] as const)('blocks stale editing and calculation after %s fails', async (query) => {
    const api = createMockApi()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['master-data-clinical-configuration', mockServices[0].id], mockLabConfiguration)
    client.setQueryData(['master-data-services-project-configuration', mockOrganization.id], mockServices)
    client.setQueryData(['master-data-operational-units'], [])
    vi.mocked(api.masterData[query]).mockRejectedValue(new Error('读取配置失败'))
    renderClinical(api, mockServices[0], client)
    expect(await screen.findByText('执行与收费配置不可用')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑项目基本配置' })).not.toBeInTheDocument()
    expect(screen.queryByText('⚡ 同次采血分管沙盒')).not.toBeInTheDocument()
  })

  it('uses the actual service status instead of displaying every service as active', async () => {
    const api = createMockApi()
    renderClinical(api, { ...mockServices[0], sdStatus: 'RETIRED', sdStatusText: '已停用' })
    await screen.findByRole('button', { name: '编辑项目基本配置' })
    const header = document.querySelector('.clinical-header-card') as HTMLElement
    expect(within(header).getByText('已停用')).toBeInTheDocument()
    expect(within(header).queryByText('启用')).not.toBeInTheDocument()
  })

  it.each(['laboratory', 'examination'] as const)('keeps %s edits until a confirmed successful save', async (type) => {
    const api = createMockApi()
    const lab = type === 'laboratory'
    const method = lab ? api.masterData.updateLaboratoryProfile : api.masterData.updateExaminationProfile
    let rejectSave!: (error: Error) => void
    vi.mocked(method).mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject }))
    renderClinical(api, lab ? mockServices[0] : mockServices[3])
    fireEvent.click(await screen.findByRole('button', { name: '编辑项目基本配置' }))
    const note = screen.getByPlaceholderText(lab
      ? '说明标本采集前准备、送检时限、特殊保存条件或临床禁忌…'
      : '说明检查前是否需要禁食禁水、憋尿、摘除金属饰品或停用特殊药物…')
    fireEvent.change(note, { target: { value: '需要保存的实际配置' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    expect(await screen.findByText('正在保存项目配置…')).toBeInTheDocument()
    expect(note).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
    expect(screen.queryByText(/项目基本配置已更新/)).not.toBeInTheDocument()
    rejectSave(new Error('配置保存失败'))
    expect(await screen.findByText('配置保存失败')).toBeInTheDocument()
    expect(note).toHaveValue('需要保存的实际配置')
    expect(note).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    expect(await screen.findByText(`${lab ? '检验' : '检查'}项目基本配置已更新`)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: '保存配置' })).not.toBeInTheDocument())
    expect(method).toHaveBeenCalledTimes(2)
  })

  function renderClinical(api: RhnApi, service = mockServices[0], client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
    return render(<QueryClientProvider client={client}>
      <ClinicalServiceConfigurationDialog api={api} service={service} organizationId={mockOrganization.id}
        dictionaries={{}} onClose={vi.fn()} />
    </QueryClientProvider>)
  }

  it('does not save a blank fixed surcharge as zero, but accepts an explicit zero', async () => {
    const api = createMockApi()
    renderClinical(api, mockServices[3])
    fireEvent.click(await screen.findByRole('button', { name: '编辑项目基本配置' }))
    const price = screen.getByLabelText(/每超出部位加收金额/)
    fireEvent.change(price, { target: { value: '' } })
    fireEvent.submit(price.closest('form')!)
    expect(await screen.findByText('请填写每超出部位加收金额。')).toBeInTheDocument()
    expect(screen.getByText(/配置尚未完整/)).toBeInTheDocument()
    expect(api.masterData.updateExaminationProfile).not.toHaveBeenCalled()
    fireEvent.change(price, { target: { value: '0' } })
    fireEvent.submit(price.closest('form')!)
    await waitFor(() => expect(api.masterData.updateExaminationProfile).toHaveBeenCalledWith(
      'srv-exam-1', 1, expect.objectContaining({ additionalSitePrice: 0 })))
  })

  it('does not invent a one-site limit while editing an unlimited examination', async () => {
    const api = createMockApi()
    vi.mocked(api.masterData.clinicalConfiguration).mockResolvedValue({ ...mockExamConfiguration,
      examination: { ...mockExamConfiguration.examination!, maxBodySiteCount: undefined, maxChargeableSiteCount: undefined } })
    renderClinical(api, mockServices[3])
    fireEvent.click(await screen.findByRole('button', { name: '编辑项目基本配置' }))
    expect(screen.getByLabelText('最多可选部位数')).toHaveValue(null)
    expect(screen.getByLabelText('最大计费部位数')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(api.masterData.updateExaminationProfile).toHaveBeenCalledWith(
      'srv-exam-1', 1, expect.objectContaining({ maxBodySiteCount: undefined, maxChargeableSiteCount: undefined })))
  })

  it.each([
    { additionalSitePrice: undefined }, { additionalSitePrice: -1 }, { additionalSiteQuantity: undefined },
    { includedSiteCount: undefined }, { maxBodySiteCount: 0 },
  ])('blocks invalid persisted pricing instead of fabricating defaults: %j', async (invalid) => {
    const api = createMockApi()
    vi.mocked(api.masterData.clinicalConfiguration).mockResolvedValue({ ...mockExamConfiguration,
      examination: { ...mockExamConfiguration.examination!, ...invalid } } as ClinicalConfiguration)
    renderClinical(api, mockServices[3])
    expect(await screen.findByText('检查收费规则缺失或数值无效，无法确认费用，请联系管理员修复配置。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑项目基本配置' })).not.toBeInTheDocument()
    expect(api.masterData.examinationChargePlan).not.toHaveBeenCalled()
  })

  it('prevents saving before aliases load and retains input when saving fails', async () => {
    const api = createMockApi()
    let resolveAliases!: (value: []) => void
    vi.mocked(api.masterData.serviceAliases).mockImplementationOnce(() => new Promise((resolve) => { resolveAliases = resolve }))
    vi.mocked(api.masterData.replaceServiceAliases).mockRejectedValueOnce(new Error('保存失败，请重试')).mockResolvedValue([])
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ClinicalServiceConfigurationDialog api={api} service={mockServices[0]} organizationId={mockOrganization.id}
        dictionaries={{}} onClose={vi.fn()} />
    </QueryClientProvider>)
    const save = screen.getByRole('button', { name: '保存别名' })
    expect(save).toBeDisabled()
    resolveAliases([])
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.change(screen.getByLabelText('新增项目别名'), { target: { value: '血常规，血常规' } })
    fireEvent.click(screen.getByRole('button', { name: '加入列表' }))
    fireEvent.click(save)
    expect(await screen.findByText('保存失败，请重试')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除别名血常规' })).toBeInTheDocument()
    expect(api.masterData.replaceServiceAliases).toHaveBeenCalledWith('srv-lab-1', [
      { aliasType: 'SYNONYM', aliasName: '血常规', primaryAlias: true, status: 'ACTIVE' },
    ])
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    expect(await screen.findByText('项目别名已更新')).toBeInTheDocument()
  })

  it('does not present failed alias loading as an empty alias list', async () => {
    const api = createMockApi()
    vi.mocked(api.masterData.serviceAliases).mockRejectedValue(new Error('别名读取失败'))
    renderClinical(api)
    expect(await screen.findByText('项目别名加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂未配置别名')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存别名' })).toBeDisabled()
    expect(api.masterData.replaceServiceAliases).not.toHaveBeenCalled()
    vi.mocked(api.masterData.serviceAliases).mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: '重新加载别名' }))
    expect(await screen.findByText('暂未配置别名')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存别名' })).toBeEnabled()
  })

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

    expect(screen.getByText('全血细胞分析+CRP · 执行与收费')).toBeInTheDocument()
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

    expect(screen.getByText('胸部多层螺旋CT平扫 · 执行与收费')).toBeInTheDocument()
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

  it('requires real specimen, container, group and charge selections without template guesses', async () => {
    const api = createMockApi()
    api.masterData.createSpecimenConfiguration = vi.fn().mockResolvedValue(mockLabConfiguration)
    renderClinical(api)
    fireEvent.click(await screen.findByRole('button', { name: '新增标本规则' }))
    expect(screen.getByText('当前选择摘要')).toBeInTheDocument()
    expect(screen.queryByText('常用采血管预设方案')).not.toBeInTheDocument()
    expect(screen.queryByText(/黄色促凝管 · 生化共管/)).not.toBeInTheDocument()
    await chooseSpecimen('送检标本类型', '血清')
    await chooseSpecimen('标准采血管容器', '促凝胶分离采血管(黄色)')
    await chooseSpecimen('分管模式', '同组共管（按确认的分组与基础管数）')
    await chooseSpecimen('试管耗材加收模式', '按管加收（管数 × 每管加收数量）')
    expect(screen.getByRole('textbox', { name: /合管分组编码/ })).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '保存标本与分管规则' }))
    expect(await screen.findByText('请填写经确认的合管分组编码。')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /合管分组编码/ }), { target: { value: 'LOCAL_SERUM_GROUP' } })
    fireEvent.click(screen.getByRole('button', { name: '保存标本与分管规则' }))
    expect(await screen.findByText('请选择实际采血管收费项目。')).toBeInTheDocument()
    expect(api.masterData.createSpecimenConfiguration).not.toHaveBeenCalled()
    await chooseSpecimen('关联采血管收费项目', '一次性真空采血管')
    const count = screen.getByLabelText(/基础试管数/)
    fireEvent.change(count, { target: { value: '' } })
    fireEvent.submit(count.closest('form')!)
    expect(await screen.findByText('请填写基础试管数。')).toBeInTheDocument()
    expect(api.masterData.createSpecimenConfiguration).not.toHaveBeenCalled()
    fireEvent.change(count, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存标本与分管规则' }))
    await waitFor(() => expect(api.masterData.createSpecimenConfiguration).toHaveBeenCalledWith('srv-lab-1', expect.objectContaining({
      specimenItemId: 'spec-2', containerItemId: 'cont-2', tubeGroupCode: 'LOCAL_SERUM_GROUP',
      tubeChargeItemId: 'srv-tube-1', baseTubeCount: 2, tubeSharingMode: 'SHARE', tubeChargeMode: 'PER_TUBE',
    })))
  })

  async function chooseSpecimen(label: string, option: string) {
    await userEvent.click(screen.getByLabelText(new RegExp(label)))
    await userEvent.click(screen.getByRole('option', { name: option }))
  }

  it('keeps specimen inputs and reports failure while preventing duplicate saves and closure during saving', async () => {
    const api = createMockApi()
    let rejectSave!: (error: Error) => void
    api.masterData.createSpecimenConfiguration = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject }))
      .mockResolvedValue(mockLabConfiguration)
    renderClinical(api)
    fireEvent.click(await screen.findByRole('button', { name: '新增标本规则' }))
    await chooseSpecimen('送检标本类型', '血清')
    await chooseSpecimen('分管模式', '独立专管（按基础管数单独计算）')
    await chooseSpecimen('试管耗材加收模式', '不加收')
    const dialog = screen.getByRole('dialog', { name: '新增标本与分管规则' })
    const save = within(dialog).getByRole('button', { name: '保存标本与分管规则' })
    const form = save.closest('form')!
    fireEvent.submit(form); fireEvent.submit(form)
    expect(api.masterData.createSpecimenConfiguration).toHaveBeenCalledTimes(1)
    expect(save).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dialog).toBeInTheDocument()
    await act(async () => { rejectSave(new Error('标本规则保存失败')) })
    expect(await screen.findByText('标本规则保存失败')).toBeInTheDocument()
    expect(screen.getByLabelText(/送检标本类型/)).toHaveTextContent('血清')
    expect(save).toBeEnabled()
    fireEvent.click(save)
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(api.masterData.createSpecimenConfiguration).toHaveBeenCalledTimes(2)
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

  it('opens frequency configuration workbench dialog in single-modal split workspace mode without stacked dialogs', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const mockFrequency: OrderFrequency = {
      id: 'freq-1',
      revision: 1,
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
          revision: 1,
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
    api.masterData.previewOrderFrequencyConfiguration = vi.fn().mockResolvedValue({
      explanation: '当前未保存时点预演', plannedTimes: ['2026-09-21T17:00:00'],
      capability: { version: 'v1', status: 'SUPPORTED', reason: null, explanation: '当前未保存时点预演' },
    })
    api.masterData.orderFrequencies = vi.fn().mockResolvedValue([mockFrequency])
    api.organization.departments = vi.fn().mockResolvedValue([
      { id: 'dept-1', code: 'IM', name: '内科', sdOrgStatus: 'ACTIVE' } as any,
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

    // 验证直接弹出方案A分栏单弹窗工作台（零嵌套弹窗）
    await waitFor(() => {
      expect(screen.getByText('每日两次 · 执行配置工作台')).toBeInTheDocument()
      expect(screen.getByText('作用范围管理')).toBeInTheDocument()
      expect(screen.getByText('全院统一配置')).toBeInTheDocument()
      expect(screen.getByText('青禾镇中心卫生院 · 全院统一标准时点')).toBeInTheDocument()
      expect(screen.getByText('标准执行时点')).toBeInTheDocument()
      expect(screen.getByText('⚡ 执行排程实时推演')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '保存当前范围配置' })).toBeInTheDocument()
    })
    expect(api.masterData.previewOrderFrequencyConfiguration).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('执行时点 2'), { target: { value: '17:00' } })
    await user.click(screen.getByRole('button', { name: '预演当前内容（最多 8 个时点）' }))
    await waitFor(() => expect(api.masterData.previewOrderFrequencyConfiguration).toHaveBeenCalledWith(
      mockFrequency, expect.objectContaining({ organizationId: 'org-1', executionTimes: '08:00,17:00', firstDayPolicy: 'REMAINING_SLOTS' }), expect.any(String), 8,
    ))
    expect(await screen.findByText('当前未保存时点预演')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('执行时点 2'), { target: { value: '18:00' } })
    expect(screen.queryByText('当前未保存时点预演')).not.toBeInTheDocument()
  })

  it('renders SupplyDialog with PC widescreen 4-section layout and attributes grid', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    api.masterData.supplies = vi.fn().mockResolvedValue([])
    api.masterData.units = vi.fn().mockResolvedValue([
      { code: 'EA', name: '个', dimension: 'COUNT', status: 'ACTIVE' },
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

    // 切换到“耗材与器械”卡片
    await waitFor(() => {
      expect(screen.getByText('耗材与器械')).toBeInTheDocument()
    })
    await user.click(screen.getByText('耗材与器械'))

    // 点击“新增耗材/器械”
    const addSupplyBtn = await screen.findByRole('button', { name: /新增耗材\/器械/ })
    await user.click(addSupplyBtn)

    // 验证弹窗按 4 个结构化业务区块渲染，杜绝单列堆叠
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '新增耗材/器械' })).toBeInTheDocument()
      expect(screen.getByText('1. 基础身份与规格型号')).toBeInTheDocument()
      expect(screen.getByText('2. 资质认证与注册信息')).toBeInTheDocument()
      expect(screen.getByText('3. 经营与管控属性')).toBeInTheDocument()
      expect(screen.getByText('4. 临床应用与说明')).toBeInTheDocument()
    })

    // 验证经营属性网格与表单项正常可用
    expect(screen.getByLabelText('可开立（临床医嘱）')).toBeChecked()
    expect(screen.getByLabelText('可收费（费用清单）')).toBeChecked()
    expect(screen.getByLabelText('高值耗材')).not.toBeChecked()
    expect(screen.getByPlaceholderText('如 一次性使用采血管 EDTA-K2 2ml')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('06900000000000')).toBeInTheDocument()
  })

  it('shows group types and unit conversions with Chinese names', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    api.masterData.itemGroups = vi.fn().mockResolvedValue([{
      id: 'group-1', code: 'LAB_SET', name: '常规检验组套', groupType: 'LIS',
      members: [], status: 'ACTIVE',
    }])
    api.masterData.units = vi.fn().mockResolvedValue([
      { id: 'u-1', code: 'ML', name: '毫升', symbol: 'ml', dimension: 'VOLUME', status: 'ACTIVE' },
      { id: 'u-2', code: 'L', name: '升', symbol: 'L', dimension: 'VOLUME', status: 'ACTIVE' },
    ])
    api.masterData.unitConversions = vi.fn().mockResolvedValue([{
      id: 'conversion-1', fromUnitCode: 'ML', toUnitCode: 'L', factor: 0.001,
      validFrom: '2026-01-01', status: 'ACTIVE',
    }])
    render(<QueryClientProvider client={new QueryClient()}>
      <OperationalMasterDataPanel api={api} organization={mockOrganization as any} manufacturers={[]} />
    </QueryClientProvider>)

    expect(await screen.findByText('检验组套')).toBeInTheDocument()
    expect(screen.queryByText('LIS')).not.toBeInTheDocument()
    expect(screen.getByTitle('组套编码：LAB_SET')).toHaveTextContent('常规检验组套')
    await user.click(screen.getByText('计量与换算'))
    expect(await screen.findByText('1 毫升 = 0.001 升')).toBeInTheDocument()
    expect(screen.getByTitle('单位编码：ML')).toHaveTextContent('毫升')
  })

  it('renders FrequencyDialog with PC widescreen dual-pane split workbench and clinical rule linkage guide', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    api.masterData.orderFrequencies = vi.fn().mockResolvedValue([])
    api.organization.departments = vi.fn().mockResolvedValue([])
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

    // 点击“新增频次”
    const addFreqBtn = await screen.findByRole('button', { name: /新增频次/ })
    await user.click(addFreqBtn)

    // 验证左栏：模板选择卡片 + 频次身份与规则 + 适用范围
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '新增医嘱频次' })).toBeInTheDocument()
      expect(screen.getByText('1. 选择业务模板')).toBeInTheDocument()
      expect(screen.getByText('每日定时')).toBeInTheDocument()
      expect(screen.getByText('固定间隔')).toBeInTheDocument()
      expect(screen.getByText('2. 频次身份与规则定义')).toBeInTheDocument()
      expect(screen.getByLabelText('门诊适用')).toBeChecked()
      expect(screen.getByLabelText('药品医嘱')).toBeChecked()
    })

    // 验证右栏 sidecar：规则语义解读 + 沙盒预演 + 临床用药规则联动指引
    expect(screen.getByText('规则实时语义解读')).toBeInTheDocument()
    expect(screen.getByText('频次结构与时点沙盘预演')).toBeInTheDocument()
    const hintCard = screen.getByText('临床用药规则联动指引').closest('.frequency-sidecar-card')
    expect(hintCard).toBeInTheDocument()
    expect(hintCard).toHaveTextContent('门诊适用')
    expect(hintCard).toHaveTextContent('药品医嘱')
    expect(hintCard).toHaveTextContent('频次标准')
  })
})
