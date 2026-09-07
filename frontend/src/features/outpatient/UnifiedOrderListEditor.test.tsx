import { describe, expect, it, vi } from 'vitest'
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
    expect(screen.getByText('搜索药品名称/拼音')).toBeInTheDocument()
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
    expect(screen.getByText('产品规格').parentElement).toHaveClass('doctor-unified-order-head')
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
    await user.click(screen.getByRole('combobox', { name: '搜索药品名称/拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '阿莫')
    await user.click(await screen.findByRole('option', { name: /阿莫西林胶囊/ }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: '产品规格' })).toHaveFocus())

    await user.keyboard('{Enter}{Enter}')
    await waitFor(() => expect(screen.getByLabelText('单次剂量')).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('combobox', { name: '给药途径' })).toHaveFocus())

    await user.keyboard('{Enter}{Enter}')
    await waitFor(() => expect(screen.getByRole('combobox', { name: '频次' })).toHaveFocus())
    await user.keyboard('{Enter}{Enter}')
    await waitFor(() => expect(screen.getByLabelText('疗程')).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('用药嘱托')).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('总量')).toHaveFocus())
    await user.keyboard('{Enter}')

    expect(setMedicationDrafts).toHaveBeenCalledTimes(1)
    const updater = setMedicationDrafts.mock.calls[0][0]
    expect(updater([])[0]).toMatchObject({
      productSpec: '0.25g*24粒/盒', manufacturerName: '示范制药有限公司', unitPrice: 18.8,
      request: { quantityUnit: 'BOX' },
    })
    await waitFor(() => expect(screen.getByRole('combobox', { name: '搜索药品名称/拼音' })).toHaveFocus())
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
    await user.click(screen.getByRole('combobox', { name: '搜索药品名称/拼音' }))
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
    await waitFor(() => expect(screen.getByRole('combobox', { name: '搜索中草药名称/拼音' })).toHaveFocus())
  })

  it('opens a pending medication row for editing and saves it back to the draft list', async () => {
    const setMedicationDrafts = vi.fn()
    renderComponent({ medicationDrafts: [mockMedicationDraft], setMedicationDrafts })

    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }))
    expect(screen.getByLabelText('编辑单次剂量')).toHaveValue(0.5)
    expect(screen.getByLabelText('编辑用药嘱托')).toHaveValue('饭后服用')

    await userEvent.click(screen.getByLabelText('保存医嘱修改'))
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
})
