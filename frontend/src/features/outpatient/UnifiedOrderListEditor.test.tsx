import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnifiedOrderListEditor, calculatePackageQuantity, type ServicePlanDraft } from './UnifiedOrderListEditor'
import type { MedicationPlanDraft } from './PrescriptionListEditor'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'

describe('UnifiedOrderListEditor', () => {
  const mockApi = {
    encounters: {
      orderableMedications: vi.fn().mockResolvedValue([]),
    },
    masterData: {
      activeOrderFrequencies: vi.fn().mockResolvedValue([{
        code: 'QD', name: '每日一次', executionTimes: ['08:00'], shortName: '每日一次',
      }]),
      activeMedicationRoutes: vi.fn().mockResolvedValue([{
        code: 'ORAL', name: '口服', executionType: 'NONE',
      }]),
      services: vi.fn().mockResolvedValue([]),
      itemGroups: vi.fn().mockResolvedValue([]),
    },
  } as unknown as RhnApi

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValue([])
    vi.mocked(mockApi.masterData.services).mockResolvedValue([])
    vi.mocked(mockApi.masterData.itemGroups).mockResolvedValue([])
    vi.mocked(mockApi.masterData.activeOrderFrequencies).mockResolvedValue([{
      code: 'QD', name: '每日一次', executionTimes: ['08:00'], shortName: '每日一次',
    }] as never)
    vi.mocked(mockApi.masterData.activeMedicationRoutes).mockResolvedValue([{
      code: 'ORAL', name: '口服', executionType: 'NONE',
    }] as never)
  })

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
    preparationSpec: '0.25g',
    productName: '阿莫西林胶囊（示范产品）',
    productSpec: '0.25g*24粒/盒',
    manufacturerName: '示范制药有限公司',
    unitPrice: 18.8,
    currencyCode: 'CNY',
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
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
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

  it('renders medication product details in separate readable columns', () => {
    renderComponent({ medicationDrafts: [mockMedicationDraft] })

    const row = screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' })
    expect(within(row).getByText('阿莫西林胶囊（示范产品）')).toBeInTheDocument()
    expect(within(row).getByText('0.25g*24粒/盒')).toBeInTheDocument()
    expect(within(row).getByText('示范制药有限公司')).toBeInTheDocument()
    expect(within(row).getByText('¥18.80')).toBeInTheDocument()
    expect(within(row).getByText('0.5g')).toBeInTheDocument()
    expect(within(row).getByText('口服')).toBeInTheDocument()
    expect(within(row).getByText('TID')).toBeInTheDocument()
    expect(within(row).getByText('3天')).toBeInTheDocument()
    expect(within(row).getByText('待确认')).toBeInTheDocument()
  })

  it('renders persisted medication product snapshots without inventory text', () => {
    renderComponent({ medications: [{
      id: 'med-request-1', status: 'ACTIVE', medicationType: 'WESTERN',
      itemName: '阿莫西林胶囊（已开立产品）', itemCode: 'P001',
      medicationName: '阿莫西林胶囊', preparationSpec: '0.25g', packageSpec: '0.25g*24粒/盒',
      manufacturerName: '示范制药有限公司', unitPrice: 18.8, currencyCode: 'CNY',
      doseValue: 0.5, doseUnit: 'g', routeName: '口服', frequencyCode: 'TID',
      durationValue: 3, durationUnit: '天', quantity: 1, quantityUnit: 'BOX',
      skinTestRequired: false, authoredAt: '2026-09-02T10:00:00Z',
    } as never] })

    const row = screen.getByRole('row', { name: /阿莫西林胶囊（已开立产品）/ })
    expect(within(row).getByText('0.25g*24粒/盒')).toBeInTheDocument()
    expect(within(row).queryByText('0.25g')).not.toBeInTheDocument()
    expect(within(row).getByText('示范制药有限公司')).toBeInTheDocument()
    expect(within(row).getByText('¥18.80')).toBeInTheDocument()
    expect(within(row).getByText('已开立')).toBeInTheDocument()
    expect(within(row).queryByText(/库存|可用|余量/)).not.toBeInTheDocument()
  })

  it('renders read row for service orders properly without itemCode and with price', () => {
    renderComponent({
      serviceDrafts: [{ ...mockServiceDraft, unitPrice: 25, currencyCode: 'CNY' }],
      services: [{
        id: 'srv-persisted-1',
        status: 'ACTIVE',
        serviceType: 'LABORATORY',
        itemName: 'C反应蛋白测定',
        itemCode: 'DEMO-LAB-CRP',
        unitPrice: 25,
        currencyCode: 'CNY',
        quantity: 1,
        unitCode: '次',
      } as never],
    })

    expect(screen.getByText('血常规五分类')).toBeInTheDocument()
    expect(screen.getByText('C反应蛋白测定')).toBeInTheDocument()
    expect(screen.queryByText('DEMO-LAB-CRP')).not.toBeInTheDocument()
    expect(screen.queryByText('LAB001')).not.toBeInTheDocument()
    expect(screen.getAllByText('¥25.00').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the composer friendly while idle and opens it with one click', async () => {
    renderComponent()

    expect(screen.getByRole('button', { name: '新增医嘱' })).toBeInTheDocument()
    expect(screen.queryByLabelText('加入医嘱')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '新增医嘱' }))
    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()
    expect(screen.getByText('搜索药品/项目名称或拼音')).toBeInTheDocument()
  })

  it('keeps reading mode focused on persisted order content', () => {
    renderComponent({ readOnly: true })

    expect(screen.getByText('暂无已开立医嘱')).toBeInTheDocument()
    expect(screen.queryByText('操作')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('加入医嘱')).not.toBeInTheDocument()
  })

  it('renders a single-line continuous composer with keyboard flow', async () => {
    renderComponent()

    expect(screen.getByRole('table', { name: '本次医嘱连续录入列表' })).toBeInTheDocument()
    const addOrderLauncher = screen.getByRole('button', { name: '新增医嘱' })
    expect(addOrderLauncher.closest('.doctor-unified-order-row')).toHaveClass('is-launcher')
    await userEvent.click(addOrderLauncher)
    expect(screen.getByLabelText('医嘱类型')).toBeInTheDocument()
    expect(screen.getByLabelText('总量')).toBeInTheDocument()
    // 医嘱项目未调入时，其它编辑框不允许操作
    expect(screen.getByLabelText('单次剂量')).toBeDisabled()
    expect(screen.getByLabelText('给药途径')).toBeDisabled()
    expect(screen.getByLabelText('频次')).toBeDisabled()
    expect(screen.getByLabelText('疗程')).toBeDisabled()
    expect(screen.getByLabelText('用药嘱托')).toBeDisabled()
    expect(screen.getByLabelText('总量')).toBeDisabled()
    expect(screen.getByRole('button', { name: '加入医嘱' })).toBeDisabled()
    expect(screen.getByTitle('加入待确认列表 (Enter / Ctrl+Enter)')).toBeInTheDocument()
    expect(screen.getByLabelText('退出医嘱录入')).toBeInTheDocument()
    // 剂量单位不允许编辑：不存在 doctor-unified-dose-unit 输入框
    expect(screen.queryByLabelText('剂量单位')).not.toBeInTheDocument()
  })

  it('uses one shared grid track for the header, read rows and composer', async () => {
    renderComponent({ medicationDrafts: [mockMedicationDraft] })
    expect(screen.getByText('用法用量 / 执行要求').parentElement).toHaveClass('doctor-unified-order-head')
    expect(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' })).toHaveClass('doctor-unified-order-row')

    await userEvent.click(screen.getByRole('button', { name: '新增医嘱' }))
    expect(screen.getByRole('combobox', { name: '医嘱类型' }).closest('.doctor-unified-inline-composer'))
      .toHaveClass('doctor-unified-inline-composer')
  })

  it('moves through medication fields with Enter and creates a new row from total quantity', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
    const medication = {
      id: 'm-1', code: 'MED001', name: '阿莫西林胶囊', preparationSpec: '0.25g', preparationUnit: '粒',
      defaultDose: 1, defaultDoseUnit: '粒', defaultRoute: 'ORAL', defaultFrequency: 'QD',
      sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药', products: [{
        id: 'product-1', code: 'P001', name: '阿莫西林胶囊（示范产品）', manufacturerName: '示范制药有限公司',
        unitCode: '粒', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-1', unitCode: 'BOX', unitName: '盒', packageSpec: '0.25g*24粒/盒',
          quantityFactor: 24, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-1', packageId: 'package-1', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 18.8, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValueOnce([medication] as never)
    renderComponent({ setMedicationDrafts })

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '阿莫')
    await user.click(await screen.findByRole('option', { name: /阿莫西林胶囊/ }))

    // 产品规格为静态只读展示，不可修改
    expect(screen.queryByRole('combobox', { name: '产品规格' })).not.toBeInTheDocument()
    expect(screen.getByText('0.25g*24粒/盒')).toBeInTheDocument()

    // 焦点直接自动落入单次剂量输入框，且检索弹层必须处于关闭收起状态
    await waitFor(() => expect(screen.getByLabelText('单次剂量')).toHaveFocus())
    expect(screen.queryByPlaceholderText('输入通用名、编码或别名')).not.toBeInTheDocument()

    await user.keyboard('{Enter}')
    // 给药途径支持 openOnFocus，进入时自动展开并高亮默认选项
    expect(await screen.findByRole('listbox')).toBeInTheDocument()

    // 下拉选项只需按单次回车即可确认进入下一个字段（频次）
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()

    // 频次同样只需按单次回车即可确认并进入疗程
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('疗程')).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('总量')).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('用药嘱托')).toHaveFocus())
    await user.keyboard('{Enter}')

    expect(setMedicationDrafts).toHaveBeenCalledTimes(1)
    const updater = setMedicationDrafts.mock.calls[0][0]
    expect(updater([])[0]).toMatchObject({
      productSpec: '0.25g*24粒/盒', manufacturerName: '示范制药有限公司', unitPrice: 18.8,
      request: { quantityUnit: 'BOX' },
    })
    // 验证：回车新增行后，药品检索弹窗直接自动展开，且搜索框直接获得焦点，支持医生直接盲打输入
    await waitFor(() => expect(screen.getByPlaceholderText('输入通用名、编码或别名')).toHaveFocus())
  })

  it('jumps directly to frequency instead of infusion group when pressing Enter on infusion route', async () => {
    const user = userEvent.setup()
    const medication = {
      id: 'm-iv-jump', code: 'IV002', name: '葡萄糖注射液', preparationSpec: '250ml', preparationUnit: '瓶',
      defaultDose: 250, defaultDoseUnit: 'ml', defaultRoute: 'IV', defaultFrequency: 'QD',
      sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药', products: [{
        id: 'product-iv-jump', code: 'PIV002', name: '葡萄糖注射液', manufacturerName: '示范制药有限公司',
        unitCode: '瓶', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-iv-jump', unitCode: 'BOTTLE', unitName: '瓶', packageSpec: '250ml/瓶',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-iv-jump', packageId: 'package-iv-jump', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 6.0, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.masterData.activeMedicationRoutes).mockResolvedValueOnce([
      { code: 'IV', name: '静脉滴注', executionType: 'INFUSION' },
    ] as never)
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValue([medication] as never)
    renderComponent()

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '葡萄糖')
    await user.click(await screen.findByRole('option', { name: /葡萄糖注射液/ }))

    // 焦点落入单次剂量，按 Enter 跳入给药途径（自动展开）
    await waitFor(() => expect(screen.getByLabelText('单次剂量')).toHaveFocus())
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()

    // 在输液途径上敲回车确认，直接跳转到频次，而不是跳到输液分组
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '输液分组' })).not.toHaveFocus()

    // 再次回车跳到疗程
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('疗程')).toHaveFocus())
  })

  it('shows an explicit infusion group selector and defaults a new infusion to its own group', async () => {
    const user = userEvent.setup()
    const medication = {
      id: 'm-iv', code: 'IV001', name: '氯化钠注射液', preparationSpec: '100ml', preparationUnit: '瓶',
      defaultDose: 100, defaultDoseUnit: 'ml', defaultRoute: 'IV', defaultFrequency: 'QD',
      sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药', products: [{
        id: 'product-iv', code: 'PIV001', name: '氯化钠注射液', manufacturerName: '示范制药有限公司',
        unitCode: '瓶', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-iv', unitCode: 'BOTTLE', unitName: '瓶', packageSpec: '100ml/瓶',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-iv', packageId: 'package-iv', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 4.5, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.masterData.activeMedicationRoutes).mockResolvedValueOnce([
      { code: 'IV', name: '静脉滴注', executionType: 'INFUSION' },
    ] as never)
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValue([medication] as never)
    renderComponent()

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '氯化钠')
    await user.click(await screen.findByRole('option', { name: /氯化钠注射液/ }))

    expect(await screen.findByRole('combobox', { name: '输液分组' })).toBeInTheDocument()
    expect(screen.getByText(/当前 IV-01/)).toBeInTheDocument()
  })

  it('retains herbal formula settings while clearing the ingredient-specific fields', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
    const herb = {
      id: 'm-herb', code: 'HERB001', name: '黄芪', preparationSpec: '饮片', preparationUnit: 'g',
      defaultDose: 10, defaultDoseUnit: 'g', defaultRoute: 'ORAL', defaultFrequency: 'BID',
      sdMedicationType: 'HERBAL', sdMedicationTypeText: '草药', products: [{
        id: 'product-herb', code: 'PH001', name: '黄芪饮片', manufacturerName: '中药饮片有限公司',
        unitCode: 'g', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-herb', unitCode: 'g', unitName: 'g', packageSpec: '500g/袋',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-herb', packageId: 'package-herb', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 0.12, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.masterData.activeOrderFrequencies).mockResolvedValueOnce([{
      code: 'BID', name: '每日两次', executionTimes: ['08:00', '16:00'], shortName: '每日两次',
    }] as never)
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValue([herb] as never)
    renderComponent({ setMedicationDrafts })

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '医嘱类型' }))
    await user.click(await screen.findByRole('option', { name: '草药' }))
    await user.click(screen.getByRole('combobox', { name: '搜索中草药名称/拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '黄芪')
    await user.click(await screen.findByRole('option', { name: /黄芪/ }))
    await user.clear(screen.getByLabelText('剂数'))
    await user.type(screen.getByLabelText('剂数'), '5')
    await user.clear(screen.getByLabelText('服法'))
    await user.type(screen.getByLabelText('服法'), '冲服')
    await user.type(screen.getByLabelText('特殊煎法'), '后下')
    expect(screen.getByLabelText('每付剂量')).toHaveValue(10)
    expect(screen.getByLabelText('剂数')).toHaveValue(5)
    expect(screen.getByLabelText('服法')).toHaveValue('冲服')
    expect(screen.getByRole('combobox', { name: '频次' })).toHaveTextContent('每日两次')
    await user.click(screen.getByLabelText('加入医嘱'))
    await waitFor(() => expect(setMedicationDrafts).toHaveBeenCalledTimes(1))

    const updater = setMedicationDrafts.mock.calls[0][0]
    expect(updater([])[0]).toMatchObject({
      request: { durationValue: 5, durationUnit: '剂', quantity: 50, medicationInstruction: '冲服；后下' },
    })
    expect(screen.getByLabelText('剂数')).toHaveValue(5)
    expect(screen.getByLabelText('服法')).toHaveValue('冲服')
    expect(screen.getByText(/5剂 · 冲服 · BID/)).toBeInTheDocument()
    await waitFor(() => {
      const input = screen.queryByPlaceholderText('输入通用名、编码或别名')
      const trigger = screen.queryByRole('combobox', { name: '搜索中草药名称/拼音' })
      expect(document.activeElement === input || document.activeElement === trigger).toBe(true)
    })
  })

  it('opens a pending medication row for editing and saves it back on blur or enter', async () => {
    const setMedicationDrafts = vi.fn()
    renderComponent({ medicationDrafts: [mockMedicationDraft], setMedicationDrafts })

    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }))
    expect(screen.getByLabelText('编辑单次剂量')).toHaveValue(0.5)
    expect(screen.getByLabelText('编辑用药嘱托')).toHaveValue('饭后服用')
    expect(screen.queryByLabelText('保存医嘱修改')).not.toBeInTheDocument()

    // 失去焦点或回车自动保存回写待确认列表
    const instructionInput = screen.getByLabelText('编辑用药嘱托')
    await userEvent.type(instructionInput, '{enter}')
    expect(setMedicationDrafts).toHaveBeenCalledTimes(1)
  })

  it('cancels pending medication row edit on Escape and reverts to read-only mode', async () => {
    const setMedicationDrafts = vi.fn()
    renderComponent({ medicationDrafts: [mockMedicationDraft], setMedicationDrafts })

    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }))
    expect(screen.getByLabelText('编辑单次剂量')).toBeInTheDocument()

    // 按 Escape 键取消编辑
    fireEvent.keyDown(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }), { key: 'Escape' })
    expect(setMedicationDrafts).not.toHaveBeenCalled()
    // 恢复为只读行
    expect(screen.queryByLabelText('编辑单次剂量')).not.toBeInTheDocument()
    expect(screen.getByText('阿莫西林胶囊（示范产品）')).toBeInTheDocument()
  })

  it('auto-saves medication draft on blur when clicking outside', async () => {
    const setMedicationDrafts = vi.fn()
    renderComponent({ medicationDrafts: [mockMedicationDraft], setMedicationDrafts })

    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }))
    const editorRow = screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' })
    expect(screen.getByLabelText('编辑单次剂量')).toBeInTheDocument()

    // 模拟编辑行失去焦点移出外部
    fireEvent.blur(editorRow, { relatedTarget: document.body })
    expect(setMedicationDrafts).toHaveBeenCalledTimes(1)
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

  it('does not expose stock quantity in either summary or edit mode', async () => {
    const draftWithStock: MedicationPlanDraft = {
      ...mockMedicationDraft,
      stockSiteName: '门诊西药房',
      availablePackageQuantity: 75,
      packageUnitName: '盒',
    }
    renderComponent({ medicationDrafts: [draftWithStock] })

    expect(screen.queryByText(/门诊西药房/)).not.toBeInTheDocument()
    expect(screen.queryByText(/75盒/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }))
    expect(screen.queryByText(/门诊西药房/)).not.toBeInTheDocument()
    expect(screen.queryByText(/75盒/)).not.toBeInTheDocument()
  })

  it('collapses unentered order composer back to launcher on outside blur', async () => {
    renderComponent()

    await userEvent.click(screen.getByRole('button', { name: '新增医嘱' }))
    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.getByRole('button', { name: '新增医嘱' })).toBeInTheDocument()
    expect(screen.queryByLabelText('加入医嘱')).not.toBeInTheDocument()
  })

  it('switches between smart mode and prefix mode in popover and persists user choice to localStorage', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    renderComponent()

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))

    // Popover 展开后默认智能模式
    const smartTab = screen.getByRole('tab', { name: /智能模式/ })
    const prefixTab = screen.getByRole('tab', { name: /前缀模式/ })
    expect(smartTab).toHaveAttribute('aria-selected', 'true')
    expect(prefixTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText(/全库混搜/)).toBeInTheDocument()

    // 切换至前缀模式
    await user.click(prefixTab)
    expect(await screen.findByRole('tab', { name: /前缀模式/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /智能模式/ })).toHaveAttribute('aria-selected', 'false')
    expect(localStorage.getItem('rhn_order_search_mode')).toBe('prefix')
    expect(screen.getByText('项目', { selector: '.doctor-order-hint-text' })).toBeInTheDocument()

    // 切回智能模式
    await user.click(screen.getByRole('tab', { name: /智能模式/ }))
    expect(await screen.findByRole('tab', { name: /智能模式/ })).toHaveAttribute('aria-selected', 'true')
    expect(localStorage.getItem('rhn_order_search_mode')).toBe('smart')
  })

  it('supports smart mode auto-detecting service items and adapting row layout to laboratory fields', async () => {
    const user = userEvent.setup()
    const setServiceDrafts = vi.fn()
    const labItem = {
      id: 'srv-lab-1', code: 'LAB001', name: '血常规五分类', sdServiceType: 'LABORATORY',
      sdServiceTypeText: '检验', unitCode: '次', orderable: true,
      prices: [{ id: 'p-1', price: 20, currencyCode: 'CNY', sdStatus: 'ACTIVE' }],
    }
    vi.mocked(mockApi.masterData.services).mockResolvedValue([labItem] as never)
    renderComponent({ setServiceDrafts })

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '血常规')
    await user.click(await screen.findByRole('option', { name: /血常规五分类/ }))

    // 自动识别为检验类型，展示临床说明并落入焦点
    await waitFor(() => expect(screen.getByLabelText('临床说明')).toHaveFocus())
    expect(screen.getByRole('combobox', { name: '医嘱类型' })).toHaveTextContent('检验')
    expect(screen.queryByLabelText('单次剂量')).not.toBeInTheDocument()

    // 填写说明并回车添加
    await user.type(screen.getByLabelText('临床说明'), '空腹')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('项目数量')).toHaveFocus())
    await user.keyboard('{Enter}')

    expect(setServiceDrafts).toHaveBeenCalledTimes(1)
    const updater = setServiceDrafts.mock.calls[0][0]
    expect(updater([])[0]).toMatchObject({
      itemName: '血常规五分类',
      serviceType: 'LABORATORY',
      clinicalDescription: '空腹',
      quantity: 1,
    })
  })

  it('supports prefix mode with slash prefix and imports entire order set members in batch', async () => {
    const user = userEvent.setup()
    const setServiceDrafts = vi.fn()
    const orderSet = {
      id: 'set-1', code: 'SET001', name: '高血压常规检查组套', groupType: 'ORDER_SET', status: 'ACTIVE',
      members: [
        { id: 'm-1', catalogItemId: 'srv-1', itemCode: 'LAB001', itemName: '血常规五分类', serviceType: 'LABORATORY', quantity: 1, unitCode: '次' },
        { id: 'm-2', catalogItemId: 'srv-2', itemCode: 'EXAM001', itemName: '十二导联心电图', serviceType: 'EXAMINATION', quantity: 1, unitCode: '次' },
      ],
    }
    vi.mocked(mockApi.masterData.itemGroups).mockResolvedValue([orderSet] as never)
    renderComponent({ setServiceDrafts })

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    // 在 popover 切换至前缀模式
    await user.click(screen.getByRole('tab', { name: /前缀模式/ }))
    // 输入 / 开头检索组套
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '/高血压')
    await user.click(await screen.findByRole('option', { name: /高血压常规检查组套/ }))

    // 验证批量调入组套子项
    expect(setServiceDrafts).toHaveBeenCalledTimes(1)
    const updater = setServiceDrafts.mock.calls[0][0]
    const drafts = updater([])
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ itemName: '血常规五分类', serviceType: 'LABORATORY' })
    expect(drafts[1]).toMatchObject({ itemName: '十二导联心电图', serviceType: 'EXAMINATION' })

    // 验证界面显示一键调入成功的 Toast 提示
    expect(screen.getByRole('status')).toHaveTextContent(/已成功调入组套【高血压常规检查组套】共 2 项项目/)
  })

  it('closes medication search popover when pressing Enter to select a medication and moves focus to dose', async () => {
    const user = userEvent.setup()
    const medication = {
      id: 'm-2', code: 'MED002', name: '头孢曲松钠', preparationSpec: '1g', preparationUnit: '瓶',
      defaultDose: 1, defaultDoseUnit: 'g', defaultRoute: 'INTRAVENOUS_DRIP', defaultFrequency: 'QD',
      sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药', products: [{
        id: 'product-2', code: 'P002', name: '头孢曲松钠注射剂', manufacturerName: '安康制药有限公司',
        unitCode: '瓶', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-2', unitCode: 'VIAL', unitName: '瓶', packageSpec: '1g/瓶',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-2', packageId: 'package-2', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 8.6, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValueOnce([medication] as never)
    renderComponent({})

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    const input = screen.getByPlaceholderText('输入通用名、编码或别名')
    await user.type(input, '头孢')
    await screen.findByRole('option', { name: /头孢曲松钠/ })

    // 在检索输入框中直接按下 Enter 键进行选择
    await user.keyboard('{Enter}')

    // 验证：焦点成功进入单次剂量字段，且搜索弹层彻底关闭
    await waitFor(() => expect(screen.getByLabelText('单次剂量')).toHaveFocus())
    expect(screen.queryByPlaceholderText('输入通用名、编码或别名')).not.toBeInTheDocument()
    expect(screen.getByText('头孢曲松钠 (1g)')).toBeInTheDocument()
  })
  it('removes manual compatibility safety checkbox and allows adding high-risk medications directly without blocking', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
    const skintestMed = {
      id: 'm-skin', code: 'SKIN001', name: '青霉素V钾片', preparationSpec: '0.25g', preparationUnit: '片',
      defaultDose: 0.25, defaultDoseUnit: 'g', defaultRoute: 'ORAL', defaultFrequency: 'TID',
      skinTestRequired: true,
      sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药', products: [{
        id: 'product-skin', code: 'PSKIN', name: '青霉素V钾片', manufacturerName: '华北制药',
        unitCode: '盒', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-skin', unitCode: 'BOX', unitName: '盒', packageSpec: '0.25g*24片/盒',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-skin', packageId: 'package-skin', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 15.0, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValueOnce([skintestMed] as never)
    renderComponent({ setMedicationDrafts })

    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '青霉素')
    await user.click(await screen.findByRole('option', { name: /青霉素V钾片/ }))

    // 验证：用药风险提示展示，但手动勾选框已彻底移除
    expect(screen.getByText(/需皮试药品/)).toBeInTheDocument()
    expect(screen.queryByText(/已完成用药禁忌与配伍安全核对/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /已完成用药禁忌与配伍安全核对/ })).not.toBeInTheDocument()

    // 医生无需手动打勾，点击加入医嘱按钮即可顺利入单
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))
    expect(setMedicationDrafts).toHaveBeenCalledTimes(1)
  })

  it('provides intuitive pill buttons for infusion grouping and tags subsequent members as same group', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
    const existingDraft = {
      id: 'draft-iv-1',
      medicationId: 'm-nacl',
      medicationName: '0.9%氯化钠注射液',
      productName: '0.9%氯化钠注射液 100ml',
      productSpec: '100ml/瓶',
      categoryCode: 'WESTERN',
      routeExecutionType: 'INFUSION' as const,
      routeName: '静脉滴注',
      administrationGroupKey: 'group-iv-01',
      unitPrice: 4.5,
      request: {
        doseValue: 100,
        doseUnit: 'ml',
        routeCode: 'IV',
        frequencyCode: 'QD',
        durationValue: 3,
        quantity: 3,
        quantityUnit: 'BOTTLE',
      },
    }

    const ceftriaxone = {
      id: 'm-cef', code: 'CEF001', name: '注射用头孢曲松钠', preparationSpec: '1g', preparationUnit: '支',
      defaultDose: 1, defaultDoseUnit: 'g', defaultRoute: 'IV', defaultFrequency: 'QD',
      sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药', products: [{
        id: 'product-cef', code: 'PCEF', name: '注射用头孢曲松钠', manufacturerName: '安康制药',
        unitCode: '支', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-cef', unitCode: 'VIAL', unitName: '支', packageSpec: '1g/支',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-cef', packageId: 'package-cef', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 8.6, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }

    vi.mocked(mockApi.masterData.activeMedicationRoutes).mockResolvedValue([
      { code: 'IV', name: '静脉滴注', executionType: 'INFUSION' },
    ] as never)
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValue([ceftriaxone] as never)

    renderComponent({
      medicationDrafts: [existingDraft as never],
      setMedicationDrafts,
    })

    // 验证列表中第一味输液药的组标识正常显示
    expect(screen.getByText('IV-01')).toBeInTheDocument()

    // 录入第二味输液药
    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '头孢')
    await user.click(await screen.findByRole('option', { name: /注射用头孢曲松钠/ }))

    // 验证输液成组设置中展示了直观的成组选项按钮
    expect(screen.getByText('输液成组设置：')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /并入此组/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /新建独立输液组/ })).toBeInTheDocument()

    // 点击加入医嘱
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))

    expect(setMedicationDrafts).toHaveBeenCalled()
    const updater = setMedicationDrafts.mock.calls[0][0]
    const nextDrafts = updater([existingDraft])
    expect(nextDrafts).toHaveLength(2)
    // 验证第二味输液药成功继承同属于 group-iv-01
    expect(nextDrafts[1].administrationGroupKey).toBe('group-iv-01')
  })

});
