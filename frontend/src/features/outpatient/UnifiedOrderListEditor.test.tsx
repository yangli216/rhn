import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnifiedOrderListEditor, calculatePackageQuantity, syncMedicationDraftGroup, type ServicePlanDraft } from './UnifiedOrderListEditor'
import type { MedicationPlanDraft } from './PrescriptionListEditor'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'

describe('UnifiedOrderListEditor', () => {
  const mockApi = {
    encounters: {
      orderableMedications: vi.fn().mockResolvedValue([]),
    },
    treatments: {
      skinTestWorklist: vi.fn().mockResolvedValue([]),
      validNegativeSkinTests: vi.fn().mockResolvedValue([]),
    },
    masterData: {
      activeOrderFrequencies: vi.fn().mockResolvedValue([{
        code: 'QD', name: '每日一次', executionTimes: ['08:00'], shortName: '每日一次',
      }]),
      activeMedicationRoutes: vi.fn().mockResolvedValue([{
        code: 'ORAL', name: '口服', executionType: 'NONE',
      }]),
      services: vi.fn().mockResolvedValue([]),
      searchServices: vi.fn().mockResolvedValue({ content: [] }),
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
    vi.mocked(mockApi.treatments.skinTestWorklist).mockResolvedValue([])
    vi.mocked(mockApi.treatments.validNegativeSkinTests).mockResolvedValue([])
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

  it('rechecks multiple AI catalog selections and converts them directly to pending drafts', async () => {
    const raw = { id: 'lab-1', code: 'LAB001', name: '血常规', sdServiceType: 'LABORATORY', sdUsageType: 'COMMON',
      sdStatus: 'ACTIVE', orderable: true, validFrom: '2020-01-01', prices: [], organizationAdoption: {
        organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, executable: true } }
    vi.mocked(mockApi.masterData.searchServices).mockResolvedValue({ content: [raw] } as never)
    const consumed = vi.fn(), completed = vi.fn(), setServices = vi.fn(), setMedications = vi.fn()
    renderComponent({ aiOrderReview: { id: 'review-1', encounterId: 'enc-1', items: [{
      type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001', name: '模型名称', rationale: '评估病因' }],
      onCompleted: completed },
      onAiOrderReviewConsumed: consumed, setServiceDrafts: setServices, setMedicationDrafts: setMedications })
    await waitFor(() => expect(consumed).toHaveBeenCalled())
    expect(mockApi.masterData.searchServices).toHaveBeenCalledWith('LAB001', 'LABORATORY', 'ACTIVE', 'org-1', 0, 100)
    expect(setServices).toHaveBeenCalledTimes(1)
    expect(setServices.mock.calls[0][0]([])).toEqual([expect.objectContaining({
      catalogItemId: 'lab-1', itemName: '血常规', quantity: 1, clinicalDescription: '评估病因',
    })])
    expect(setMedications).not.toHaveBeenCalled()
    expect(completed).toHaveBeenCalledWith(['LABORATORY:lab-1'])
    expect(screen.queryByDisplayValue('评估病因')).not.toBeInTheDocument()
  })

  it('rejects AI projects that are no longer orderable', async () => {
    vi.mocked(mockApi.masterData.searchServices).mockResolvedValue({ content: [] } as never)
    renderComponent({ aiOrderReview: { id: 'review-2', encounterId: 'enc-1', items: [{
      type: 'LABORATORY', catalogItemId: 'missing', code: 'X', name: '不存在项目', rationale: '' }] } })
    expect(await screen.findByText('不存在项目：已不在本次可用诊疗目录中')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('不存在项目')).not.toBeInTheDocument()
  })

  it.each([undefined, { packageId: 'package-para', doseValue: 1, doseUnit: 'g', routeCode: 'ORAL',
    frequencyCode: 'QD', durationValue: 3, quantity: 2, instruction: '测试医生核对的嘱托' }])(
    'converts catalog defaults or physician-edited AI details to a pending draft: %j', async (orderDraft) => {
    const medication = {
      id: 'm-para', code: 'MED-PARA', name: '对乙酰氨基酚片', preparationSpec: '0.5g', preparationUnit: '片',
      defaultDose: 0.5, defaultDoseUnit: 'g', defaultRoute: 'ORAL', defaultFrequency: 'QD',
      sdMedicationType: 'WESTERN', availablePackageQuantity: 20, stockSiteName: '门诊药房', packageUnitName: '盒',
      products: [{ id: 'product-para', code: 'P-PARA', name: '对乙酰氨基酚片 0.5g', manufacturerName: '示范制药',
        unitCode: '片', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-para', unitCode: 'BOX', unitName: '盒', packageSpec: '0.5g*20片/盒',
          quantityFactor: 20, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-para', packageId: 'package-para', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 8.6, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValue([medication] as never)
    const setMedications = vi.fn(), completed = vi.fn()
    renderComponent({ setMedicationDrafts: setMedications, aiOrderReview: {
      id: 'review-medication', encounterId: 'enc-1', items: [{ type: 'MEDICATION', medicationId: 'm-para',
        catalogItemId: 'product-para', code: 'MED-PARA', name: '对乙酰氨基酚片', rationale: '退热', orderDraft }],
      onCompleted: completed,
    } })
    await waitFor(() => expect(completed).toHaveBeenCalledWith(['MEDICATION:product-para']))
    expect(setMedications).toHaveBeenCalledTimes(1)
    expect(setMedications.mock.calls[0][0]([])[0]).toMatchObject({
      medicationName: '对乙酰氨基酚片', productName: '对乙酰氨基酚片 0.5g', unitPrice: 8.6,
      request: { catalogItemId: 'product-para', doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL',
        frequencyCode: 'QD', quantity: 1, quantityUnit: 'BOX', ...orderDraft && { doseValue: orderDraft.doseValue, durationValue: 3, durationUnit: 'd', quantity: 2,
          medicationInstruction: orderDraft.instruction }  },
    })
    expect(screen.queryByDisplayValue('对乙酰氨基酚片')).not.toBeInTheDocument()
  })

  it('ignores a late catalog response after the editor unmounts', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(mockApi.masterData.searchServices).mockImplementation(() => new Promise((done) => { resolve = done }) as never)
    const consumed = vi.fn()
    const rendered = renderComponent({ aiOrderReview: { id: 'late', encounterId: 'enc-1', items: [{
      type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001', name: '血常规', rationale: '' }] }, onAiOrderReviewConsumed: consumed })
    await waitFor(() => expect(mockApi.masterData.searchServices).toHaveBeenCalled())
    rendered.unmount()
    resolve({ content: [] })
    await Promise.resolve()
    expect(consumed).not.toHaveBeenCalled()
  })

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

  const ensureComposerOpen = async (user?: ReturnType<typeof userEvent.setup>) => {
    const launcher = screen.queryByRole('button', { name: '新增医嘱' })
    if (launcher) {
      if (user) await user.click(launcher)
      else await userEvent.click(launcher)
    }
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
      manufacturerName: '示范制药有限公司', packageQuantity: 3, packageUnitName: '盒',
      dose: 0.5, doseUnit: 'g', routeName: '口服', frequencyCode: 'TID',
      pricingRequired: true, unitPrice: 18.8,
    } as never] })

    const row = screen.getByRole('row', { name: /阿莫西林胶囊（已开立产品）/ })
    expect(within(row).getByText('阿莫西林胶囊（已开立产品）')).toBeInTheDocument()
    expect(within(row).getByText('0.25g*24粒/盒')).toBeInTheDocument()
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

  it('defaults to inserting an empty composer row when order list is empty and does not activate/steal focus', async () => {
    renderComponent()

    expect(screen.queryByRole('button', { name: '新增医嘱' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()
    expect(screen.getByText('搜索药品/项目名称或拼音')).toBeInTheDocument()
    // 确保新接诊时空白行不自动激活弹出下拉框或抢夺焦点
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('输入通用名、编码或别名')).not.toBeInTheDocument()
  })

  it('shows add order launcher when existing orders are present and automatically enters edit state when clicking add order', async () => {
    renderComponent({ medicationDrafts: [mockMedicationDraft] })

    const addOrderLauncher = screen.getByRole('button', { name: '新增医嘱' })
    expect(addOrderLauncher).toBeInTheDocument()
    await userEvent.click(addOrderLauncher)
    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()

    // 点击新增医嘱按钮后，新空白行自动进入编辑状态并聚焦检索输入框，无需鼠标再点一次
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('输入通用名、编码或别名')).toHaveFocus()
    })
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
    await ensureComposerOpen()
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

    await ensureComposerOpen(user)
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '阿莫')
    await user.click(await screen.findByRole('option', { name: /阿莫西林胶囊/ }))

    // 选定西药后，医嘱类型自动变为具体的类型（西药），而非停留在“请选择”或“全部类型”
    expect(screen.getByRole('combobox', { name: '医嘱类型' })).toHaveTextContent('西药')
    expect(screen.getByRole('combobox', { name: '搜索西药名称/拼音' }).closest('.doctor-inline-order-resource')).toHaveClass('has-selected')

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

    await ensureComposerOpen(user)
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
    expect(screen.queryByRole('combobox', { name: '输液分组' })).toBeNull()

    // 再次回车确认频次并跳到疗程
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('疗程')).toHaveFocus())
  })

  it('automatically enters grouping mode when adding an infusion head drug, locks route/frequency, and restores normal mode on finish', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
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
    renderComponent({ setMedicationDrafts })

    await ensureComposerOpen(user)
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '氯化钠')
    await user.click(await screen.findByRole('option', { name: /氯化钠注射液/ }))

    // 点击加入医嘱，首药（组头药）加入待确认后，系统自动激活成组模式
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))

    // 验证成组模式已激活：出现“成组中”徽标、唯一的“组方完成”横条按钮和成组提示横条
    expect(await screen.findByText('成组中')).toBeInTheDocument()
    expect(screen.getByText(/成组录入模式/)).toBeInTheDocument()
    expect(screen.getByText(/已关联首药：氯化钠注射液/)).toBeInTheDocument()
    // 操作按钮栏不再挤入重复的“组方完成”，整行仅有 banner 内唯一的“组方完成”按钮
    const finishBtns = screen.getAllByRole('button', { name: '组方完成' })
    expect(finishBtns).toHaveLength(1)

    // 验证当前处于成组录入中的草稿行左侧已渲染 ┗ 括线标记，与上方首药形成 [ 方括号
    const composerBracket = document.querySelector('.doctor-unified-inline-composer .doctor-group-bracket.is-tail')
    expect(composerBracket).toBeInTheDocument()
    expect(composerBracket).toHaveTextContent('┗')

    // 点击组方完成，退出成组模式，恢复常规开立
    await user.click(finishBtns[0])
    expect(screen.queryByText('成组中')).not.toBeInTheDocument()
    expect(screen.queryByText(/成组录入模式/)).not.toBeInTheDocument()
    expect(document.querySelector('.doctor-unified-inline-composer .doctor-group-bracket')).toBeNull()
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

    await ensureComposerOpen(user)
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

  it('does not expose stock quantity in either summary or edit mode, while displaying executing pharmacy', async () => {
    const draftWithStock: MedicationPlanDraft = {
      ...mockMedicationDraft,
      stockSiteName: '门诊西药房',
      availablePackageQuantity: 75,
      packageUnitName: '盒',
    }
    renderComponent({ medicationDrafts: [draftWithStock] })

    expect(screen.getAllByText('门诊西药房').length).toBeGreaterThan(0)
    expect(screen.queryByText(/75盒/)).not.toBeInTheDocument()
    expect(screen.queryByText(/库存/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }))
    expect(screen.getAllByText('门诊西药房').length).toBeGreaterThan(0)
    expect(screen.queryByText(/75盒/)).not.toBeInTheDocument()
    expect(screen.queryByText(/库存/)).not.toBeInTheDocument()
  })

  it('displays executing departments correctly for medication, lab, exam, and treatment orders with full route/frequency width support', async () => {
    const examDraft: ServicePlanDraft = {
      id: 'draft-srv-exam',
      serviceType: 'EXAMINATION',
      catalogItemId: 'srv-exam-1',
      itemCode: 'EXAM001',
      itemName: '胸部正侧位片(DR)',
      quantity: 1,
      unitCode: '次',
      clinicalDescription: '咳嗽待查',
    }
    const treatmentDraft: ServicePlanDraft = {
      id: 'draft-srv-treat',
      serviceType: 'TREATMENT',
      catalogItemId: 'srv-treat-1',
      itemCode: 'TREAT001',
      itemName: '静脉输液处置费',
      quantity: 1,
      unitCode: '次',
      clinicalDescription: '门诊处置',
    }
    renderComponent({
      currentDepartmentName: '全科医疗科',
      medicationDrafts: [mockMedicationDraft],
      serviceDrafts: [mockServiceDraft, examDraft, treatmentDraft],
    })

    // 表头包含执行科室
    expect(screen.getByText('执行科室')).toBeInTheDocument()

    // 药品显示对应的药房（西药默认或由 stockSiteName 决定）
    expect(screen.getAllByText('门诊西药房').length).toBeGreaterThan(0)

    // 检验类默认显示检验科
    expect(screen.getAllByText('检验科').length).toBeGreaterThan(0)

    // 检查类根据项目智能归属放射影像科
    expect(screen.getAllByText('放射影像科').length).toBeGreaterThan(0)

    // 普通处置/费用类默认当前科室（全科医疗科）
    expect(screen.getAllByText('全科医疗科').length).toBeGreaterThan(0)
  })

  it('automatically selects input text on focus for quick value replacement without backspacing', async () => {
    renderComponent({ medicationDrafts: [mockMedicationDraft] })

    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 阿莫西林胶囊' }))
    const doseInput = screen.getByLabelText('编辑单次剂量') as HTMLInputElement
    const selectSpy = vi.spyOn(doseInput, 'select')

    fireEvent.focus(doseInput)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('collapses unentered order composer back to launcher on outside blur when orders exist', async () => {
    renderComponent({ medicationDrafts: [mockMedicationDraft] })

    await userEvent.click(screen.getByRole('button', { name: '新增医嘱' }))
    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.getByRole('button', { name: '新增医嘱' })).toBeInTheDocument()
    expect(screen.queryByLabelText('加入医嘱')).not.toBeInTheDocument()
  })

  it('preserves empty composer row on outside blur when order list is empty', async () => {
    renderComponent()

    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.getByLabelText('加入医嘱')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新增医嘱' })).not.toBeInTheDocument()
  })

  it('switches between smart mode and prefix mode in popover and persists user choice to localStorage', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    renderComponent()

    await ensureComposerOpen(user)
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

    await ensureComposerOpen(user)
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

    await ensureComposerOpen(user)
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

  it('keeps composer open with a new empty row and focused after importing an order set', async () => {
    const user = userEvent.setup()
    const orderSet = {
      id: 'set-trt', code: 'SET_TRT', name: '门诊清创包组套', groupType: 'ORDER_SET', status: 'ACTIVE',
      members: [
        { id: 'm-trt-1', catalogItemId: 'srv-trt-1', itemCode: 'TRT001', itemName: '清创缝合', serviceType: 'TREATMENT', quantity: 1, unitCode: '次' },
      ],
    }
    vi.mocked(mockApi.masterData.itemGroups).mockResolvedValue([orderSet] as never)

    function StatefulWrapper() {
      const [serviceDrafts, setServiceDrafts] = useState<ServicePlanDraft[]>([])
      return (
        <UnifiedOrderListEditor
          encounter={mockEncounter}
          api={mockApi}
          medicationDrafts={[]}
          setMedicationDrafts={vi.fn()}
          serviceDrafts={serviceDrafts}
          setServiceDrafts={setServiceDrafts}
          allergies={[]}
        />
      )
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <StatefulWrapper />
      </QueryClientProvider>
    )

    // 初始没有医嘱，录入行默认激活展开
    expect(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' })).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.click(screen.getByRole('tab', { name: /前缀模式/ }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '/清创')
    await user.click(await screen.findByRole('option', { name: /门诊清创包组套/ }))

    // 调入成功后，草稿列表中出现清创缝合
    expect(await screen.findByText('清创缝合')).toBeInTheDocument()

    // 关键断言：无需手动点击“新增医嘱”，录入框依然默认展开为新的一行，处于激活状态
    expect(screen.queryByRole('button', { name: '新增医嘱' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' })).toBeInTheDocument()
  })

  it('focuses quantity first and then service note on Enter for treatment orders', async () => {
    const user = userEvent.setup()
    const setServiceDrafts = vi.fn()
    const treatmentItem = {
      id: 'srv-treatment-1', code: 'TRT001', name: '创口清创缝合术', sdServiceType: 'TREATMENT',
      sdServiceTypeText: '处置', unitCode: '次', orderable: true,
      prices: [{ id: 'p-trt-1', price: 68, currencyCode: 'CNY', sdStatus: 'ACTIVE' }],
    }
    vi.mocked(mockApi.masterData.services).mockResolvedValue([treatmentItem] as never)
    renderComponent({ setServiceDrafts })

    await ensureComposerOpen(user)
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '清创')
    await user.click(await screen.findByRole('option', { name: /创口清创缝合术/ }))

    // 1. 自动识别为处置/治疗类型，焦点优先落入数量字段（而不是嘱托/说明）
    await waitFor(() => expect(screen.getByLabelText('项目数量')).toHaveFocus())
    expect(screen.getByRole('combobox', { name: '医嘱类型' })).toHaveTextContent('治疗')

    // 2. 在数量框按下回车，焦点跳至临床说明/嘱托框
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByLabelText('临床说明')).toHaveFocus())
    expect(screen.getByPlaceholderText('治疗部位或临床说明 (回车确认添加)')).toBeInTheDocument()

    // 3. 在说明框输入部位并回车确认添加
    await user.type(screen.getByLabelText('临床说明'), '右小腿部')
    await user.keyboard('{Enter}')

    expect(setServiceDrafts).toHaveBeenCalledTimes(1)
    const updater = setServiceDrafts.mock.calls[0][0]
    expect(updater([])[0]).toMatchObject({
      itemName: '创口清创缝合术',
      serviceType: 'TREATMENT',
      clinicalDescription: '右小腿部',
      quantity: 1,
    })
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

    await ensureComposerOpen(user)
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

    await ensureComposerOpen(user)
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '青霉素')
    await user.click(await screen.findByRole('option', { name: /青霉素V钾片/ }))

    // 验证：用药风险提示展示，但手动勾选框已彻底移除
    expect(screen.getByText(/需皮试药品/)).toBeInTheDocument()
    expect(screen.getByText(/患者药物过敏信息尚未核验/)).toBeInTheDocument()
    expect(screen.queryByText(/已完成用药禁忌与配伍安全核对/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /已完成用药禁忌与配伍安全核对/ })).not.toBeInTheDocument()

    // 医生无需手动打勾，点击加入医嘱按钮即可顺利入单
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))
    expect(setMedicationDrafts).toHaveBeenCalledTimes(1)
    const updater = setMedicationDrafts.mock.calls[0][0]
    expect(updater([])[0].request.allergyReviewConfirmed).toBe(false)
  })

  it('automatically groups subsequent infusion medication, shows bracket without IV-01 or 同组, and allows finishing group', async () => {
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

    const secondDraft = {
      id: 'draft-iv-2',
      medicationId: 'm-cef',
      medicationName: '注射用头孢曲松钠',
      productName: '注射用头孢曲松钠 1g',
      productSpec: '1g/支',
      categoryCode: 'WESTERN',
      routeExecutionType: 'INFUSION' as const,
      routeName: '静脉滴注',
      administrationGroupKey: 'group-iv-01',
      unitPrice: 8.6,
      request: {
        doseValue: 1,
        doseUnit: 'g',
        routeCode: 'IV',
        frequencyCode: 'QD',
        durationValue: 3,
        quantity: 3,
        quantityUnit: 'VIAL',
      },
    }

    renderComponent({
      medicationDrafts: [existingDraft as never, secondDraft as never],
      setMedicationDrafts,
    })

    // 验证列表中渲染了形如 [ 的纯粹树形成组括线：组头 ┏，组尾 ┗
    const brackets = screen.getAllByLabelText('输液成组标识')
    expect(brackets).toHaveLength(2)
    expect(brackets[0]).toHaveTextContent('┏')
    expect(brackets[1]).toHaveTextContent('┗')

    // 验证彻底移除了 IV-01 标记与“同组”二字，节省空间
    expect(screen.queryByText('IV-01')).toBeNull()
    expect(screen.queryByText('同组')).toBeNull()

    // 录入第二味输液药
    await user.click(screen.getByRole('button', { name: '新增医嘱' }))
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '头孢')
    await user.click(await screen.findByRole('option', { name: /注射用头孢曲松钠/ }))

    // 点击加入医嘱
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))

    expect(setMedicationDrafts).toHaveBeenCalled()
    const updater = setMedicationDrafts.mock.calls[0][0]
    const nextDrafts = updater([existingDraft, secondDraft])
    expect(nextDrafts).toHaveLength(3)
    // 验证新加入的输液药成功继承同属于 group-iv-01
    expect(nextDrafts[2].administrationGroupKey).toBe('group-iv-01')
  })

  it('renders bracket connecting single head draft and active composer row during grouping session', async () => {
    const user = userEvent.setup()
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

    function TestWrapper() {
      const [drafts, setDrafts] = useState<MedicationPlanDraft[]>([])
      return (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <UnifiedOrderListEditor
            encounter={mockEncounter}
            api={mockApi}
            medicationDrafts={drafts}
            setMedicationDrafts={setDrafts}
            serviceDrafts={[]}
            setServiceDrafts={vi.fn()}
            allergies={[]}
          />
        </QueryClientProvider>
      )
    }

    render(<TestWrapper />)

    // 录入第一味输液药（组头药）
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '头孢')
    await user.click(await screen.findByRole('option', { name: /注射用头孢曲松钠/ }))
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))

    // 验证成组录入模式已激活
    expect(await screen.findByText('成组中')).toBeInTheDocument()

    // 待确认列表中首药显示 ┏，正在录入的草稿行左侧显示 ┗，组合成 [
    const brackets = screen.getAllByLabelText('输液成组标识')
    expect(brackets).toHaveLength(2)
    expect(brackets[0]).toHaveTextContent('┏')
    expect(brackets[1]).toHaveTextContent('┗')
  })

  it('splits western and patent medicine into separate entry types and records correct category', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
    const patentMedicine = {
      id: 'm-patent',
      code: 'DRUG-PATENT-1',
      name: '感冒清热颗粒',
      sdMedicationType: 'CHINESE_PATENT',
      sdDoseForm: 'GRANULE',
      defaultRoute: 'ORAL',
      defaultFrequency: 'TID',
      strengthValue: 12,
      strengthUnit: 'g',
      preparationUnit: '袋',
      defaultDose: 12,
      defaultDoseUnit: 'g',
      products: [{
        id: 'product-patent',
        code: 'P-PATENT',
        name: '感冒清热颗粒',
        manufacturerName: '北京同仁堂',
        unitCode: '袋',
        sdStatus: 'ACTIVE',
        orderable: true,
        chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{
          id: 'package-patent',
          unitCode: 'BOX',
          unitName: '盒',
          packageSpec: '12g*10袋/盒',
          quantityFactor: 10,
          sdStatus: 'ACTIVE',
          validFrom: '2020-01-01',
          defaultDispense: true,
          defaultSale: true,
        }],
        prices: [{
          id: 'price-patent',
          packageId: 'package-patent',
          sdStatus: 'ACTIVE',
          sdPriceType: 'SALE',
          price: 25.5,
          currencyCode: 'CNY',
          validFrom: '2020-01-01',
        }],
      }],
    }
    vi.mocked(mockApi.masterData.activeOrderFrequencies).mockResolvedValue([
      { code: 'TID', name: '每日三次', executionTimes: ['08:00', '12:00', '18:00'], shortName: '每日三次' },
    ] as never)
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValue([patentMedicine] as never)

    renderComponent({ setMedicationDrafts })
    await ensureComposerOpen(user)

    // 点击医嘱类型下拉框，验证“西药”和“中成药”已拆分为两项
    await user.click(screen.getByRole('combobox', { name: '医嘱类型' }))
    expect(await screen.findByRole('option', { name: '西药' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: '中成药' })).toBeInTheDocument()

    // 选中“中成药”
    await user.click(screen.getByRole('option', { name: '中成药' }))
    expect(screen.getByRole('combobox', { name: '医嘱类型' })).toHaveTextContent('中成药')

    // 搜索并选择中成药
    await user.click(screen.getByRole('combobox', { name: '搜索中成药名称/拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '感冒清热')
    await user.click(await screen.findByRole('option', { name: /感冒清热颗粒/ }))

    // 验证剂量和单位可正常展示
    expect(screen.getByLabelText('单次剂量')).toHaveValue(12)
    const unitSelect = screen.getByLabelText('单次剂量单位')
    expect(unitSelect).toHaveValue('g')

    // 加入医嘱
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))
    expect(setMedicationDrafts).toHaveBeenCalled()
    const updater = setMedicationDrafts.mock.calls[0][0]
    const drafts = updater([])
    expect(drafts).toHaveLength(1)
    expect(drafts[0].categoryCode).toBe('CHINESE_PATENT')
    expect(drafts[0].medicationName).toBe('感冒清热颗粒')
  })

  it('detects recent negative skin test and applies exemption when clicked', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
    const skintestMed = {
      id: 'm-penicillin-test', code: 'PEN001', name: '青霉素V钾片', sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药',
      preparationSpec: '250mg', preparationUnit: '片', defaultDose: 250, defaultDoseUnit: 'mg',
      defaultRoute: 'ORAL', defaultFrequency: 'QD', skinTestRequired: true, skinTestResultValidityHours: 24,
      products: [{
        id: 'product-pen', code: 'PPEN', name: '青霉素V钾片 250mg', manufacturerName: '华北制药',
        unitCode: '盒', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-pen', unitCode: 'BOX', unitName: '盒', packageSpec: '250mg*12片/盒',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-pen', packageId: 'package-pen', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 18.0, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValueOnce([skintestMed] as never)
    vi.mocked(mockApi.treatments.validNegativeSkinTests).mockResolvedValueOnce([{
      medicationRequestId: 'mr-old', medicationRequestRevision: 1, requestNo: 'MR20260901',
      residentId: 'res-1', residentName: '张三', healthRecordNo: 'HR001', encounterId: 'enc-old',
      organizationId: 'org-1', departmentId: 'dept-1', medicationId: 'm-penicillin-test',
      medicationCode: 'PEN001', medicationName: '青霉素V钾片', itemName: '青霉素V钾片',
      settlementRequiredBeforeStart: false, dispenseRequiredBeforeStart: false, status: 'NEGATIVE',
      eventId: 'evt-999', eventRevision: 1, originalSolution: false, result: 'NEGATIVE',
      completedAt: '2026-09-13T10:00:00Z', verifiedByName: '王复核护士', resultValidityHours: 24,
    }] as never)

    renderComponent({ setMedicationDrafts })

    await ensureComposerOpen(user)
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '青霉素')
    await user.click(await screen.findByRole('option', { name: /青霉素V钾片/ }))

    // 验证探测到历史有效皮试
    expect(await screen.findByText(/探测到历史有效皮试/)).toBeInTheDocument()
    expect(screen.getByText(/王复核护士/)).toBeInTheDocument()

    // 点击一键引用免试
    await user.click(screen.getByRole('button', { name: '一键引用免试' }))
    expect(await screen.findByText(/已引用免试/)).toBeInTheDocument()

    // 点击加入医嘱
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))
    expect(setMedicationDrafts).toHaveBeenCalledTimes(1)
    const updater = setMedicationDrafts.mock.calls[0][0]
    const drafts = updater([])
    expect(drafts[0].request.skinTestExempt).toBe(true)
    expect(drafts[0].request.exemptEvidenceEventId).toBe('evt-999')
  })

  it('warns and blocks ordering when skin test result is positive', async () => {
    const user = userEvent.setup()
    const setMedicationDrafts = vi.fn()
    const skintestMed = {
      id: 'm-penicillin-pos', code: 'PEN002', name: '注射用青霉素钠', sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药',
      preparationSpec: '80万U', preparationUnit: '支', defaultDose: 800000, defaultDoseUnit: 'U',
      defaultRoute: 'ORAL', defaultFrequency: 'QD', skinTestRequired: true,
      products: [{
        id: 'product-pen2', code: 'PPEN2', name: '注射用青霉素钠 80万U', manufacturerName: '华北制药',
        unitCode: '支', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'package-pen2', unitCode: 'VIAL', unitName: '支', packageSpec: '80万U/支',
          quantityFactor: 1, sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true, defaultSale: true }],
        prices: [{ id: 'price-pen2', packageId: 'package-pen2', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
          price: 5.0, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    }
    vi.mocked(mockApi.encounters.orderableMedications).mockResolvedValueOnce([skintestMed] as never)
    vi.mocked(mockApi.treatments.skinTestWorklist).mockResolvedValue([
      { medicationId: 'm-penicillin-pos', status: 'POSITIVE' } as never,
    ])

    renderComponent({ setMedicationDrafts })

    await ensureComposerOpen(user)
    await user.click(screen.getByRole('combobox', { name: '搜索药品/项目名称或拼音' }))
    await user.type(screen.getByPlaceholderText('输入通用名、编码或别名'), '青霉素')
    await user.click(await screen.findByRole('option', { name: /注射用青霉素钠/ }))

    // 验证出现严正警示
    expect(await screen.findByText(/严正警示：患者当前药品皮试结果为【阳性】，禁止开立！/)).toBeInTheDocument()

    // 点击加入医嘱会被拦截
    await user.click(screen.getByRole('button', { name: '加入医嘱' }))
    expect(await screen.findByText(/当前药品患者皮试结果为【阳性】（严重禁忌），系统禁止开立！/)).toBeInTheDocument()
    expect(setMedicationDrafts).not.toHaveBeenCalled()
  })

  it('synchronizes frequency, duration, route, and recalculates quantity across drafts in the same infusion group', () => {
    const medA = {
      id: 'med-a',
      code: 'MED-A',
      name: '注射用头孢曲松钠',
      sdMedicationType: 'WESTERN',
      strengthValue: 1,
      strengthUnit: 'g',
      preparationUnit: '支',
      products: [{
        id: 'prod-a', code: 'P-A', name: '头孢曲松钠', unitCode: '支', sdStatus: 'ACTIVE',
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'pkg-a', unitCode: 'VIAL', unitName: '支', packageSpec: '1g/支', quantityFactor: 1, sdStatus: 'ACTIVE', defaultDispense: true, defaultSale: true, validFrom: '2020-01-01' }],
        prices: [{ id: 'price-a', packageId: 'pkg-a', sdStatus: 'ACTIVE', sdPriceType: 'SALE', price: 6.8, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }]
    }
    const medB = {
      id: 'med-b',
      code: 'MED-B',
      name: '维生素B1注射液',
      sdMedicationType: 'WESTERN',
      strengthValue: 100,
      strengthUnit: 'mg',
      preparationUnit: '支',
      products: [{
        id: 'prod-b', code: 'P-B', name: '维生素B1注射液', unitCode: '支', sdStatus: 'ACTIVE',
        organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
        packages: [{ id: 'pkg-b', unitCode: 'AMP', unitName: '安瓿', packageSpec: '100mg/2ml/支', quantityFactor: 1, sdStatus: 'ACTIVE', defaultDispense: true, defaultSale: true, validFrom: '2020-01-01' }],
        prices: [{ id: 'price-b', packageId: 'pkg-b', sdStatus: 'ACTIVE', sdPriceType: 'SALE', price: 1.2, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }]
    }

    const freqQD = { code: 'QD', name: '每日一次', executionTimes: ['08:00'], shortName: '每日一次' }
    const freqBID = { code: 'BID', name: '每日两次', executionTimes: ['08:00', '16:00'], shortName: '每日两次' }

    const draftA: MedicationPlanDraft = {
      id: 'draft-a', editorMode: 'regular', categoryCode: 'WESTERN', medicationName: '注射用头孢曲松钠', medicationCode: 'MED-A',
      productName: '头孢曲松钠', routeName: '静脉滴注', routeExecutionType: 'INFUSION', administrationGroupKey: 'grp-test-1',
      request: {
        medicationId: 'med-a', catalogItemId: 'prod-a', packageId: 'pkg-a',
        doseValue: 1, doseUnit: 'g', routeCode: 'IV', frequencyCode: 'QD', durationValue: 7, quantity: 7, quantityUnit: '支',
        substitutionAllowed: true, selfProvided: false,
      }
    }

    const draftB: MedicationPlanDraft = {
      id: 'draft-b', editorMode: 'regular', categoryCode: 'WESTERN', medicationName: '维生素B1注射液', medicationCode: 'MED-B',
      productName: '维生素B1注射液', routeName: '静脉滴注', routeExecutionType: 'INFUSION', administrationGroupKey: 'grp-test-1',
      request: {
        medicationId: 'med-b', catalogItemId: 'prod-b', packageId: 'pkg-b',
        doseValue: 100, doseUnit: 'mg', routeCode: 'IV', frequencyCode: 'QD', durationValue: 7, quantity: 7, quantityUnit: '支',
        substitutionAllowed: true, selfProvided: false,
      }
    }

    // 用户在草稿中修改了 draftA：频次从 QD 改为 BID，疗程从 7天 改为 5天
    const updatedDraftA: MedicationPlanDraft = {
      ...draftA,
      request: {
        ...draftA.request,
        frequencyCode: 'BID',
        durationValue: 5,
        quantity: 10,
      }
    }

    const result = syncMedicationDraftGroup(
      [draftA, draftB],
      updatedDraftA,
      [medA as never, medB as never],
      [freqQD as never, freqBID as never],
      'org-1'
    )

    expect(result).toHaveLength(2)
    // 验证 draftA 自身更新
    expect(result[0].request.frequencyCode).toBe('BID')
    expect(result[0].request.durationValue).toBe(5)
    expect(result[0].request.quantity).toBe(10)

    // 验证同组的 draftB 自动同步更新频次为 BID，天数为 5天，且数量重新计算为 10（BID * 5天 = 10支）
    expect(result[1].request.frequencyCode).toBe('BID')
    expect(result[1].request.durationValue).toBe(5)
    expect(result[1].request.quantity).toBe(10)
  })

  it('displays skin test safety alert and exemption options in draft edit mode, and saves exemption back to draft', async () => {
    const mockSkinTestDraft: MedicationPlanDraft = {
      ...mockMedicationDraft,
      id: 'draft-skintest-1',
      medicationName: '注射用头孢曲松钠',
      productName: '注射用头孢曲松钠 1g',
      skinTestRequired: true,
      routeExecutionType: 'INFUSION',
      administrationGroupKey: 'group-iv-1',
      request: {
        ...mockMedicationDraft.request,
        doseValue: 1,
        doseUnit: 'g',
        routeCode: 'IV_DRIP',
        frequencyCode: 'QD',
        durationValue: 3,
        durationUnit: '天',
        quantity: 3,
        quantityUnit: '支',
        skinTestExempt: false,
      },
    }

    let currentDrafts = [mockSkinTestDraft]
    const setMedicationDrafts = vi.fn((updater) => {
      currentDrafts = typeof updater === 'function' ? updater(currentDrafts) : updater
    })
    renderComponent({ medicationDrafts: currentDrafts, setMedicationDrafts })

    // 点击进入待确认编辑态
    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 注射用头孢曲松钠' }))

    // 应该显示用药风险提醒和需皮试药品
    expect(screen.getByText(/用药风险提醒/)).toBeInTheDocument()
    expect(screen.getByText(/需皮试药品/)).toBeInTheDocument()
    expect(screen.getByLabelText('免做皮试')).toBeInTheDocument()

    // 勾选免做皮试
    await userEvent.click(screen.getByLabelText('免做皮试'))
    expect(screen.getByText(/已免做皮试/)).toBeInTheDocument()

    // 确认回车保存
    const instructionInput = screen.getByLabelText('编辑用药嘱托')
    await userEvent.type(instructionInput, '{enter}')

    expect(setMedicationDrafts).toHaveBeenCalled()
    expect(currentDrafts[0].request.skinTestExempt).toBe(true)
    expect(currentDrafts[0].request.skinTestExemptReason).toBe('周期内已有阴性结果（有效时间内）')
  })

  it('shows + 同组 for infusion drafts in edit mode and activates grouping session with pre-filled route/frequency', async () => {
    const mockSkinTestDraft: MedicationPlanDraft = {
      ...mockMedicationDraft,
      id: 'draft-skintest-1',
      medicationName: '注射用头孢曲松钠',
      productName: '注射用头孢曲松钠 1g',
      skinTestRequired: true,
      routeExecutionType: 'INFUSION',
      administrationGroupKey: 'group-iv-1',
      request: {
        ...mockMedicationDraft.request,
        doseValue: 1,
        doseUnit: 'g',
        routeCode: 'IV_DRIP',
        frequencyCode: 'QD',
        durationValue: 3,
        durationUnit: '天',
        quantity: 3,
        quantityUnit: '支',
        skinTestExempt: false,
      },
    }

    const setMedicationDrafts = vi.fn()
    renderComponent({ medicationDrafts: [mockSkinTestDraft], setMedicationDrafts })

    // 点击进入待确认编辑态
    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 注射用头孢曲松钠' }))

    // 应该显示【+ 同组】按钮
    const addGroupBtn = screen.getByRole('button', { name: '+ 同组' })
    expect(addGroupBtn).toBeInTheDocument()

    // 点击【+ 同组】
    await userEvent.click(addGroupBtn)

    // 应该激活成组录入模式
    expect(screen.getByText(/成组录入模式/)).toBeInTheDocument()
    expect(screen.getByText(/已关联首药：注射用头孢曲松钠 1g/)).toBeInTheDocument()
  })

  it('allows clicking + 同组 directly from pending infusion draft row without entering edit mode first', async () => {
    const mockSkinTestDraft: MedicationPlanDraft = {
      ...mockMedicationDraft,
      id: 'draft-skintest-1',
      medicationName: '注射用头孢曲松钠',
      productName: '注射用头孢曲松钠 1g',
      skinTestRequired: true,
      routeExecutionType: 'INFUSION',
      administrationGroupKey: 'group-iv-1',
      request: {
        ...mockMedicationDraft.request,
        doseValue: 1,
        doseUnit: 'g',
        routeCode: 'IV_DRIP',
        frequencyCode: 'QD',
        durationValue: 3,
        durationUnit: '天',
        quantity: 3,
        quantityUnit: '支',
        skinTestExempt: false,
      },
    }

    const setMedicationDrafts = vi.fn()
    renderComponent({ medicationDrafts: [mockSkinTestDraft], setMedicationDrafts })

    // 直接在待确认只读行点击【+ 同组】
    const addGroupBtn = screen.getByRole('button', { name: '+ 同组' })
    expect(addGroupBtn).toBeInTheDocument()

    await userEvent.click(addGroupBtn)

    // 同样进入成组录入模式
    expect(screen.getByText(/成组录入模式/)).toBeInTheDocument()
    expect(screen.getByText(/已关联首药：注射用头孢曲松钠 1g/)).toBeInTheDocument()
  })

  it('renders grouping composer immediately below the last item of the infusion group rather than at the very bottom', async () => {
    const mockInfusionDraft: MedicationPlanDraft = {
      ...mockMedicationDraft,
      id: 'draft-infusion-head',
      medicationName: '注射用头孢曲松钠',
      productName: '注射用头孢曲松钠 1g',
      routeExecutionType: 'INFUSION',
      administrationGroupKey: 'group-iv-ceftriaxone',
      sequence: 1,
      request: {
        ...mockMedicationDraft.request,
        doseValue: 1,
        doseUnit: 'g',
        routeCode: 'IV_DRIP',
        frequencyCode: 'QD',
        durationValue: 3,
        durationUnit: '天',
        quantity: 3,
        quantityUnit: '支',
      },
    }

    const mockServiceDraft: ServicePlanDraft = {
      id: 'draft-service-exam',
      catalogItemId: 'service-peds-exam',
      itemCode: 'PED001',
      itemName: '儿科门诊诊查',
      serviceType: 'OTHER',
      quantity: 1,
      unitCode: '次',
      unitPrice: 20,
      currencyCode: 'CNY',
      sequence: 2,
    }

    renderComponent({
      medicationDrafts: [mockInfusionDraft],
      serviceDrafts: [mockServiceDraft],
    })

    // 点击【+ 同组】
    const addGroupBtn = screen.getByRole('button', { name: '+ 同组' })
    await userEvent.click(addGroupBtn)

    // 获取所有行并检查顺序
    const rows = screen.getAllByRole('row')
    // row 0: 表头, row 1: 头孢曲松钠, row 2: 成组录入行, row 3: 儿科门诊诊查
    expect(rows[1]).toHaveTextContent('注射用头孢曲松钠 1g')
    expect(rows[2]).toHaveClass('doctor-unified-inline-composer')
    expect(rows[3]).toHaveTextContent('儿科门诊诊查')
  })

  it('renders compact inline safety bar and does not exit edit mode when clicking table container or scrollbar', async () => {
    const mockSkinTestDraft: MedicationPlanDraft = {
      ...mockMedicationDraft,
      id: 'draft-skintest-edit',
      medicationName: '注射用头孢曲松钠',
      productName: '注射用头孢曲松钠 1g',
      skinTestRequired: true,
      routeExecutionType: 'INFUSION',
      administrationGroupKey: 'group-iv-1',
      request: {
        ...mockMedicationDraft.request,
        doseValue: 1,
        doseUnit: 'g',
        routeCode: 'IV_DRIP',
        frequencyCode: 'QD',
        durationValue: 3,
        durationUnit: '天',
        quantity: 3,
        quantityUnit: '支',
        skinTestExempt: false,
      },
    }

    renderComponent({ medicationDrafts: [mockSkinTestDraft] })

    // 点击进入待确认编辑态
    await userEvent.click(screen.getByRole('row', { name: '编辑待确认医嘱 注射用头孢曲松钠' }))

    // 检查用药风险栏使用了紧凑单行 is-compact
    const safetyRow = document.querySelector('.doctor-unified-order-safety')
    expect(safetyRow).toHaveClass('is-compact')
    expect(document.querySelector('.doctor-skintest-exempt-inline')).toBeInTheDocument()

    // 检查分组选择器在第 2 列的 .doctor-draft-edit-resource-wrap 内，不遮挡药品名
    const groupSelector = document.querySelector('.doctor-draft-edit-resource-wrap .doctor-draft-group-selector')
    expect(groupSelector).toBeInTheDocument()

    // 模拟在表格容器上点击（如点击横向滚动条或空白区）
    const tableContainer = document.querySelector('.doctor-unified-order-list')
    expect(tableContainer).toBeInTheDocument()
    tableContainer?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    tableContainer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    // 应当依然保持编辑态
    expect(screen.getByRole('row', { name: '编辑待确认医嘱 注射用头孢曲松钠' })).toBeInTheDocument()
    expect(document.querySelector('.doctor-unified-draft-editor-wrap')).toBeInTheDocument()
  })
});
