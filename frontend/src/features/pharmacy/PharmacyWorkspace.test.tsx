import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { PharmacyInboxItem } from '../../shared/api/pharmacyApi'
import type { RhnApi } from '../../shared/rhnApi'
import { PharmacyWorkspace } from './PharmacyWorkspace'

const clinicalContext = {
  organization: { id: 'org-1', name: '三江镇中心卫生院' },
  department: { id: 'dept-1', name: '全科医疗科' },
} as ClinicalContext

describe('PharmacyWorkspace (Dispensing Mode)', () => {
  it('renders redesigned outpatient dispensing workbench matching screenshot', async () => {
    const mockInboxItems: PharmacyInboxItem[] = [
      {
        request: {
          id: 'req-1',
          revision: 1,
          residentId: 'res-1',
          encounterId: 'enc-1',
          requestNo: 'REQ001',
          status: 'ACTIVE',
          prescriptionId: 'rx-1',
          catalogItemId: 'cat-1',
          medicationId: 'med-1',
          itemCode: 'ITEM001',
          itemName: '护肝片 200片/盒',
          medicationCode: 'MED001',
          medicationName: '护肝片',
          medicationType: 'CHINESE_PATENT',
          skinTestRequired: false,
          antimicrobial: false,
          doseValue: 1,
          doseUnit: 'G',
          routeCode: '口服',
          frequencyName: 'TID',
          quantity: 1,
          quantityUnit: 'BOX',
          baseQuantity: 200,
          baseUnit: 'TAB',
          packageFactor: 200,
          packageUnitName: '盒',
          packageSpec: '200片/盒',
          substitutionAllowed: true,
          selfProvided: false,
          unitPrice: 21.5,
          totalAmount: 21.5,
          durationValue: 1,
          durationUnit: 'DAY',
          itemAttributeSnapshot: {},
          itemAttributeHash: 'hash-1',
          medicationSnapshot: {
            residentName: '晓康',
            gender: 'MALE',
            birthDate: '1945-05-11',
            nationalId: '230208194505119377',
            phone: '13367581545',
            manufacturerName: '云南制药有限公司',
          },
          standardMappings: [],
          authoredAt: '2026-08-30T13:32:00.000Z',
        },
        taskId: 'task-1',
        taskNo: 'TASK001',
        taskStatus: 'READY_TO_DISPENSE',
        stockItemId: 'stock-1',
        clinicalContext: {
          encounterId: 'enc-1',
          encounterNo: 'ENC20260828001',
          clinicianId: '范贺欣',
          chiefComplaint: '定期复查肝功能，常规配药。',
          diagnoses: [{ code: 'B18.2', display: '慢性病毒性肝炎', type: 'PRIMARY' }],
        },
      },
    ]

    const api = {
      pharmacy: {
        sites: vi.fn().mockResolvedValue([
          { id: 'site-1', name: '门诊药房', code: 'W-01', active: true, siteType: 'PHARMACY', departmentId: 'dept-1' },
        ]),
        inbox: vi.fn().mockResolvedValue(mockInboxItems),
        stockItems: vi.fn().mockResolvedValue([
          { id: 'stock-1', productName: '护肝片', productCode: 'P001', packageSpec: '200片/盒', packageUnitName: '盒', status: 'ACTIVE', catalogItemId: 'cat-1', medicationId: 'med-1', traceRequired: true },
        ]),
        task: vi.fn().mockResolvedValue({
          id: 'task-1', taskNo: 'TASK001', status: 'READY_TO_DISPENSE', stockSiteId: 'site-1',
          lines: [{ id: 'line-1', requestId: 'req-1', stockItemId: 'stock-1', plannedQuantity: 1, dispensedQuantity: 0, returnedQuantity: 0, dispenseUnitCode: 'BOX', status: 'READY', productCode: 'P001', productName: '护肝片', traceRequired: true }],
          reviews: [],
        }),
        balances: vi.fn().mockResolvedValue([]),
        reservations: vi.fn().mockResolvedValue({ allocations: [] }),
        trace: vi.fn().mockResolvedValue({ events: [] }),
        scanTraceCode: vi.fn().mockResolvedValue({
          id: 'trace-1', revision: 0, stockSiteId: 'site-1', stockBinId: 'bin-1', stockItemId: 'stock-1',
          stockLotId: 'lot-1', traceCode: '8690020000000001002', productCode: 'P001', productName: '护肝片', lotNo: 'LOT-1',
          packageQuantity: 1, baseQuantity: 200, remainingBaseQuantity: 200, status: 'AVAILABLE', updatedAt: '2026-08-30T13:00:00Z',
        }),
        scanTraceCodes: vi.fn().mockImplementation((_siteId: string, traceCodes: string[]) => Promise.resolve({
          codes: traceCodes.map((traceCode, index) => ({
            id: `trace-${traceCode.slice(-1)}-${index}`, revision: 0, stockSiteId: 'site-1', stockBinId: 'bin-1', stockItemId: 'stock-1',
            stockLotId: 'lot-1', traceCode, productCode: 'P001', productName: '护肝片', lotNo: 'LOT-1',
            packageQuantity: 1, baseQuantity: 200, remainingBaseQuantity: 200, status: 'AVAILABLE', updatedAt: '2026-08-30T13:00:00Z',
          })),
          notFoundCodes: [],
        })),
        dispense: vi.fn().mockResolvedValue({ taskId: 'task-1' }),
      },
      organization: {
        practitioners: vi.fn().mockResolvedValue([
          { id: '101', fullName: '非药房医生', code: 'P001', sdPersonnelStatus: 'ACTIVE' },
          { id: '201', fullName: '王药师', code: 'P002', sdPersonnelStatus: 'ACTIVE' },
        ]),
        assignments: vi.fn().mockResolvedValue([
          { id: '301', practitionerId: '201', organizationId: 'org-1', departmentId: 'dept-1',
            positionName: '主管药师', departmentName: '全科医疗科', sdPositionType: 'PHARMACY',
            primaryAssignment: true, sdPersonnelStatus: 'ACTIVE' },
        ]),
        practitioner: vi.fn().mockImplementation((id: string) => Promise.resolve({
          practitioner: { id, fullName: id === '201' ? '王药师' : '非药房医生', code: 'P001', sdPersonnelStatus: 'ACTIVE' },
          assignments: id === '201'
            ? [{ id: '301', practitionerId: '201', organizationId: 'org-1', departmentId: 'dept-1',
              positionName: '主管药师', departmentName: '全科医疗科', sdPositionType: 'PHARMACY',
              primaryAssignment: true, sdPersonnelStatus: 'ACTIVE' }]
            : [{ id: '302', practitionerId: '101', organizationId: 'org-1', departmentId: 'dept-other',
              positionName: '医师', departmentName: '其他科室', sdPositionType: 'CLINICAL',
              primaryAssignment: true, sdPersonnelStatus: 'ACTIVE' }],
        })),
      },
      residents: {
        page: vi.fn().mockResolvedValue({
          items: [{ id: 'res-1', fullName: '晓康', gender: 'MALE', birthDate: '1945-05-11', phone: '13367581545', maskedNationalId: '230208194505119377' }],
          total: 1,
        }),
        get: vi.fn().mockResolvedValue({
          id: 'res-1', fullName: '晓康', gender: 'MALE', birthDate: '1945-05-11', phone: '13367581545',
          maskedNationalId: '230208194505119377', nationalId: '230208194505119377',
        }),
        profile: vi.fn().mockResolvedValue({
          resident: { id: 'res-1', fullName: '晓康', gender: 'MALE', birthDate: '1945-05-11', phone: '13367581545', maskedNationalId: '230208194505119377' },
          demographicProfile: { ethnicityCodeText: '汉族' },
          addresses: [{ addressText: '浙江省杭州市滨江区浦沿街道浦沿社区浦沿苑', primary: true }],
          coverages: [{ coverageType: '自费' }],
          relatedPersons: [],
          employments: [],
        }),
        allergies: vi.fn().mockResolvedValue([]),
      },
    } as unknown as RhnApi

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PharmacyWorkspace api={api} clinicalContext={clinicalContext} mode="dispensing" />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // 1. Verify Top Action Bar buttons & window selector
    expect(await screen.findByRole('button', { name: '发药(F4)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '叫号屏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '配药' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多设置' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('批量扫码，或输入处方/患者/就诊号')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '发药窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查询' })).toBeInTheDocument()

    // 2. Verify Left Patient Queue & standard Expiry select
    expect(screen.getByText('待发药患者')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '效期天数' })).toBeInTheDocument()
    expect((await screen.findAllByText('晓康')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '叫号' })).toBeInTheDocument()

    // Typing only edits the draft. Enter/click applies an intent-aware query; empty submission restores the queue.
    const scanInput = screen.getByRole('textbox', { name: '追溯码或处方患者检索' })
    await userEvent.type(scanInput, '不存在')
    expect(screen.queryByText('未找到匹配的待发药患者')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    expect(await screen.findByText('未找到匹配的待发药患者')).toBeInTheDocument()
    expect(api.pharmacy.scanTraceCode).not.toHaveBeenCalled()
    expect(api.pharmacy.scanTraceCodes).not.toHaveBeenCalled()
    await userEvent.clear(scanInput)
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(screen.queryByText('未找到匹配的待发药患者')).not.toBeInTheDocument())
    await userEvent.type(scanInput, '晓康{Enter}')
    expect(await screen.findByText(/已按患者姓名查询，匹配 1 位待发药患者/)).toBeInTheDocument()
    expect(api.pharmacy.scanTraceCode).not.toHaveBeenCalled()
    expect(api.pharmacy.scanTraceCodes).not.toHaveBeenCalled()
    await userEvent.clear(scanInput)
    await userEvent.click(screen.getByRole('button', { name: '查询' }))

    // 3. Verify Patient Banner
    expect(screen.getByText('汉族')).toBeInTheDocument()
    expect(screen.getByText('自费')).toBeInTheDocument()
    expect(screen.getByText(/230208194505119377/)).toBeInTheDocument()
    expect(screen.getByText(/13367581545/)).toBeInTheDocument()
    expect(screen.getByText(/浙江省杭州市滨江区浦沿街道浦沿社区浦沿苑/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /过敏史/ })).toBeInTheDocument()

    // 4. Verify Prescription Card & Table with merged columns and dosage calculation
    expect(screen.getByText('处方一')).toBeInTheDocument()
    expect(screen.getByText('三江镇中心卫生院 / 全科医疗科 / 范贺欣')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '病史摘要' })).toBeInTheDocument()
    expect(screen.getByText('药品名称/规格')).toBeInTheDocument()
    expect(screen.getByText('护肝片')).toBeInTheDocument()
    expect(screen.getByText('200片/盒')).toBeInTheDocument()
    expect(screen.getByText('云南制药有限公司')).toBeInTheDocument()
    expect(screen.getByText('每次剂量')).toBeInTheDocument()
    // Historical request has no structured frequency snapshot: show the prescribed dose only.
    expect(screen.getByText(/^1 g$/)).toBeInTheDocument()
    expect(screen.queryByText(/66\.67片/)).not.toBeInTheDocument()
    expect(screen.getByText('TID')).toBeInTheDocument()
    expect(screen.getByText('口服')).toBeInTheDocument()

    // 5. Verify Trace code scan status: red/insufficient before scan, green/success after scan
    const scanStatusBadge = await screen.findByTitle('追溯码尚未扫码')
    expect(scanStatusBadge).toHaveClass('pharmacy-scan-status--danger')
    expect(scanStatusBadge).toHaveTextContent('0 / 1 盒')
    fireEvent.change(scanInput, { target: { value: '8690020000000001002' } })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    fireEvent.change(scanInput, { target: { value: '8690020000000001003' } })
    fireEvent.keyDown(scanInput, { key: 'Enter' })
    await waitFor(() => expect(api.pharmacy.scanTraceCodes).toHaveBeenCalledTimes(1))
    expect(api.pharmacy.scanTraceCodes).toHaveBeenCalledWith('site-1', [
      '8690020000000001002', '8690020000000001003',
    ])
    const completedBadge = screen.getByTitle('追溯码数量已核对完成')
    expect(completedBadge).toHaveClass('pharmacy-scan-status--success')
    expect(completedBadge).toHaveTextContent('1 盒')
    expect(await screen.findByText(/成功 1 个，重复 0 个，失败 1 个，按前 7 位合并为 1 组请求/)).toBeInTheDocument()

    await userEvent.type(scanInput, '8690020000000001002{Enter}')
    expect(await screen.findByText(/成功 0 个，重复 1 个，失败 0 个/)).toBeInTheDocument()
    expect(completedBadge).toHaveTextContent('1 盒')

    await userEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByTitle('追溯码尚未扫码')).toHaveTextContent('0 / 1 盒')
    await userEvent.click(screen.getByRole('button', { name: '发药(F4)' }))
    expect(await screen.findByText(/请先扫齐“护肝片”的追溯码/)).toBeInTheDocument()
    expect(api.pharmacy.dispense).not.toHaveBeenCalled()
    await userEvent.type(scanInput, '8690020000000001002{Enter}')
    expect(await screen.findByTitle('追溯码数量已核对完成')).toHaveTextContent('1 盒')
    await waitFor(() => expect(screen.queryByText(/请先扫齐“护肝片”的追溯码/)).not.toBeInTheDocument())
    expect(screen.queryByText(/批量扫入完成：成功 1 个/)).not.toBeInTheDocument()

    // 6. Verify Bottom Summary Amounts
    expect(screen.getByText('已选处方总金额:')).toBeInTheDocument()
    expect(screen.getAllByText(/21\.50/).length).toBeGreaterThan(0)

    // 7. Test History Summary Dialog
    await userEvent.click(screen.getByRole('button', { name: '病史摘要' }))
    expect(await screen.findByText('门诊就诊号')).toBeInTheDocument()
    expect(screen.getByText('ENC20260828001')).toBeInTheDocument()
    expect(screen.getByText('定期复查肝功能，常规配药。')).toBeInTheDocument()
    expect(screen.getByText(/慢性病毒性肝炎/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '关闭弹窗' }))

    // 8. Test F4 Dispense Button
    await userEvent.click(screen.getByRole('button', { name: '发药(F4)' }))
    await waitFor(() => {
      expect(api.pharmacy.dispense).toHaveBeenCalled()
    })
    expect(api.pharmacy.dispense).toHaveBeenCalledWith('task-1', expect.objectContaining({
      dispenserPractitionerId: '201',
      dispenserAssignmentId: '301',
      traceCodeIds: ['trace-2-0'],
    }))
    expect(await screen.findByText(/已成功完成发药：晓康/)).toBeInTheDocument()

    // 9. Backend business failures must replace the success notice with the real result.
    vi.mocked(api.pharmacy.dispense).mockRejectedValueOnce({
      code: 'INVENTORY_PREVIOUS_PERIOD_NOT_CLOSED',
      message: '上一库存期间尚未月结，不能开启下一期间',
      correlationId: 'correlation-1',
    })
    await userEvent.type(scanInput, '8690020000000001002{Enter}')
    expect(await screen.findByTitle('追溯码数量已核对完成')).toHaveTextContent('1 盒')
    await userEvent.click(screen.getByRole('button', { name: '发药(F4)' }))
    const failedNotice = await screen.findByRole('alert')
    expect(failedNotice).toHaveTextContent('发药失败：上一库存期间尚未月结，不能开启下一期间')
    expect(screen.queryByText(/已成功完成发药：晓康/)).not.toBeInTheDocument()
    expect(failedNotice).toHaveClass('ui-toast')

    await userEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses the matched stock-item trace policy before intake and displays countable dose units', async () => {
    const mockInboxItems: PharmacyInboxItem[] = [
      {
        request: {
          id: 'req-2',
          revision: 1,
          residentId: 'res-1',
          encounterId: 'enc-1',
          requestNo: 'REQ002',
          status: 'ACTIVE',
          prescriptionId: 'rx-2',
          catalogItemId: 'cat-2',
          medicationId: 'med-2',
          itemCode: 'ITEM002',
          itemName: '阿莫西林胶囊 0.25g*24粒/盒',
          medicationCode: 'MED002',
          medicationName: '阿莫西林胶囊',
          medicationType: 'WESTERN',
          skinTestRequired: false,
          antimicrobial: true,
          doseValue: 2,
          doseUnit: 'CAPSULE',
          routeCode: '口服',
          frequencyCode: 'TID',
          quantity: 1,
          quantityUnit: 'BOX',
          baseQuantity: 24,
          baseUnit: 'CAPSULE',
          packageFactor: 24,
          packageUnitName: '盒',
          packageSpec: '0.25g*24粒/盒',
          preparationSpec: '0.25g',
          preparationUnit: '粒',
          substitutionAllowed: true,
          selfProvided: false,
          unitPrice: 15.0,
          totalAmount: 15.0,
          durationValue: 4,
          durationUnit: 'DAY',
          itemAttributeSnapshot: {},
          itemAttributeHash: 'hash-2',
          medicationSnapshot: {
            residentName: '晓康',
            gender: 'MALE',
            birthDate: '1945-05-11',
            nationalId: '230208194505119377',
            phone: '13367581545',
            manufacturerName: '示范制药有限公司',
          },
          standardMappings: [],
          authoredAt: '2026-08-30T13:32:00.000Z',
        },
        clinicalContext: {
          encounterId: 'enc-1',
          encounterNo: 'ENC20260828001',
          clinicianId: '范贺欣',
          chiefComplaint: '咽痛，发热。',
          diagnoses: [{ code: 'J02.9', display: '急性咽炎', type: 'PRIMARY' }],
        },
      },
    ]

    const api = {
      pharmacy: {
        sites: vi.fn().mockResolvedValue([
          { id: 'site-1', name: '门诊药房', code: 'W-01', active: true, siteType: 'PHARMACY', departmentId: 'dept-1' },
        ]),
        inbox: vi.fn().mockResolvedValue(mockInboxItems),
        stockItems: vi.fn().mockResolvedValue([
          { id: 'stock-2', productName: '阿莫西林胶囊', productCode: 'P002', packageSpec: '0.25g*24粒/盒',
            packageUnitName: '盒', status: 'ACTIVE', catalogItemId: 'cat-2', medicationId: 'med-2', traceRequired: true },
        ]),
        task: vi.fn().mockResolvedValue({
          id: 'task-2', taskNo: 'TASK002', status: 'READY_TO_DISPENSE', stockSiteId: 'site-1',
          lines: [], reviews: [],
        }),
        balances: vi.fn().mockResolvedValue([]),
        reservations: vi.fn().mockResolvedValue({ allocations: [] }),
        trace: vi.fn().mockResolvedValue({ events: [] }),
        dispense: vi.fn().mockResolvedValue({ taskId: 'task-2' }),
      },
      organization: {
        practitioners: vi.fn().mockResolvedValue([]),
        assignments: vi.fn().mockResolvedValue([]),
        practitioner: vi.fn().mockResolvedValue({ assignments: [] }),
      },
      residents: {
        page: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        get: vi.fn().mockResolvedValue({ id: 'res-1', fullName: '晓康' }),
        profile: vi.fn().mockResolvedValue({ resident: { id: 'res-1', fullName: '晓康' } }),
        allergies: vi.fn().mockResolvedValue([]),
      },
    } as unknown as RhnApi

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PharmacyWorkspace api={api} clinicalContext={clinicalContext} mode="dispensing" />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Verify dual units displayed: 0.5 g (physical strength dose) and 2粒 (minimum package unit)
    expect(await screen.findByText('0.5 g（2粒）')).toBeInTheDocument()
    expect(screen.getByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(screen.getByText('0.25g*24粒/盒')).toBeInTheDocument()
    expect(await screen.findByTitle('追溯码尚未扫码')).toHaveTextContent('0 / 1 盒')
  })

  it('uses the top pharmacy context and omits the duplicated site toolbar in review mode', async () => {
    const stockItems = vi.fn().mockResolvedValue([])
    const api = {
      pharmacy: {
        sites: vi.fn().mockResolvedValue([
          { id: 'site-current', name: '门诊药房', code: 'PH-01', active: true, siteType: 'PHARMACY', departmentId: 'dept-1' },
          { id: 'site-other', name: '住院药房', code: 'PH-02', active: true, siteType: 'PHARMACY', departmentId: 'dept-2' },
        ]),
        inbox: vi.fn().mockResolvedValue([]),
        prescriptionReviewMode: vi.fn().mockResolvedValue({ enabled: true, mode: 'PRE_DISPENSE' }),
        stockItems,
      },
      organization: {
        practitioners: vi.fn().mockResolvedValue([]),
        assignments: vi.fn().mockResolvedValue([]),
        practitioner: vi.fn(),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PharmacyWorkspace api={api} clinicalContext={clinicalContext} mode="review" />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('事前审方')).toBeInTheDocument()
    await waitFor(() => expect(stockItems).toHaveBeenCalledWith('site-current'))
    expect(document.querySelector('.pharmacy-toolbar')).not.toBeInTheDocument()
    expect(screen.queryByText('当前药房')).not.toBeInTheDocument()
    expect(screen.queryByText('当前工作上下文')).not.toBeInTheDocument()
  })

  it('connects the submitted safety context to pharmacist intervention and shows its saved result', async () => {
    const user = userEvent.setup()
    const request = { id: 'req-safety', prescriptionId: 'rx-safety', requestNo: 'MR-SAFETY',
      residentId: 'resident-safety', encounterId: 'encounter-safety', medicationName: '合成测试药品',
      itemName: '测试产品', quantity: 1, quantityUnit: '片', itemAttributeSnapshot: {},
      authoredAt: '2026-09-21T08:00:00Z' }
    const context = { prescriptionId: 'rx-safety', prescriptionNo: 'RX-SAFETY',
      submittedAt: '2026-09-21T08:00:00Z', doctorReason: '医生已核对重复用药条件',
      medications: [{ requestId: 'req-safety', name: '合成测试药品' }],
      evaluation: { evaluationId: 'eval-safety', mode: 'ENFORCED', decision: 'WARN', failureCodes: [], findings: [{
        findingId: 'f1', category: 'DUPLICATE_THERAPY', decision: 'WARN', message: '合成重复用药提示',
        medicationRequestIds: ['req-safety'], evidence: [], suggestedAction: '请核对是否应调整处方',
      }] } }
    let task = { id: 'task-safety', taskNo: 'TASK-SAFETY', status: 'PENDING_REVIEW', lines: [],
      prescriptionSafety: [context], reviews: [] as any[] }
    const assignment = { id: 'assignment-1', practitionerId: 'pharmacist-1', organizationId: 'org-1',
      departmentId: 'dept-1', sdPositionType: 'PHARMACY', sdPersonnelStatus: 'ACTIVE', primaryAssignment: true }
    const review = vi.fn().mockImplementation(async (_id, input) => {
      task = { ...task, status: 'INTERVENTION', reviews: [{ id: 'review-1', result: input.result,
        description: input.description, reviewedAt: '2026-09-21T09:00:00Z' }] }
      return task
    })
    const api = {
      pharmacy: {
        sites: vi.fn().mockResolvedValue([{ id: 'site-1', departmentId: 'dept-1', siteType: 'PHARMACY', active: true }]),
        inbox: vi.fn().mockImplementation(async () => [{ request, taskId: 'task-safety', taskStatus: task.status }]),
        prescriptionReviewMode: vi.fn().mockResolvedValue({ enabled: true, mode: 'PRE_DISPENSE' }),
        stockItems: vi.fn().mockResolvedValue([]), task: vi.fn().mockImplementation(async () => task),
        trace: vi.fn().mockResolvedValue({ events: [] }), review,
      },
      organization: {
        practitioners: vi.fn().mockResolvedValue([{ id: 'pharmacist-1', fullName: '测试药师', sdPersonnelStatus: 'ACTIVE' }]),
        assignments: vi.fn().mockResolvedValue([assignment]),
        practitioner: vi.fn().mockResolvedValue({ assignments: [assignment] }),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter>
      <PharmacyWorkspace api={api} clinicalContext={clinicalContext} mode="review" />
    </MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('合成重复用药提示')).toBeVisible()
    expect(screen.getByText(/医生已核对重复用药条件/)).toBeVisible()
    await user.click(screen.getByRole('combobox', { name: '审方结论' }))
    await user.click(screen.getByRole('option', { name: /干预/ }))
    await user.type(screen.getByRole('textbox', { name: '原因编码' }), 'DUPLICATE_CONFIRM')
    await user.type(screen.getByRole('textbox', { name: '审方说明' }), '联系医生核对重复开立，暂缓发药')
    await user.click(screen.getByRole('button', { name: '提交审方结论' }))
    await waitFor(() => expect(review).toHaveBeenCalledWith('task-safety', {
      result: 'INTERVENE', reasonCode: 'DUPLICATE_CONFIRM', description: '联系医生核对重复开立，暂缓发药',
      pharmacistPractitionerId: 'pharmacist-1', reviewerAssignmentId: 'assignment-1',
    }))
    expect(await screen.findByText('联系医生核对重复开立，暂缓发药')).toBeVisible()
    expect(screen.getByText(/医生已核对重复用药条件/)).toBeVisible()
  })

  it('renders a record-oriented query table without exposing internal workflow identifiers', async () => {
    const api = {
      pharmacy: {
        sites: vi.fn().mockResolvedValue([
          { id: 'site-1', name: '门诊药房', code: 'PH-01', active: true, siteType: 'PHARMACY', departmentId: 'dept-1' },
        ]),
        inbox: vi.fn().mockResolvedValue([{
          request: {
            id: 'req-query-1', residentId: 'resident-1', encounterId: 'encounter-1', requestNo: 'MR-INTERNAL-001',
            prescriptionId: 'prescription-1', medicationId: 'med-1', medicationCode: 'MED-001', medicationName: '阿莫西林',
            itemCode: 'ITEM-001', itemName: '阿莫西林胶囊 0.25g', localCode: 'LOCAL-001', localName: '阿莫西林胶囊',
            quantity: 1, quantityUnit: 'BOX', packageUnitName: '盒', packageFactor: 24, baseQuantity: 24, baseUnit: 'CAPSULE',
            routeCode: '口服', frequencyCode: 'TID', authoredAt: '2026-09-18T06:03:40Z', itemAttributeSnapshot: {},
            packageSpec: '0.25g*24粒/盒', doseValue: 2, doseUnit: 'CAPSULE',
            itemAttributeHash: 'HASH-INTERNAL', medicationSnapshot: { manufacturerName: '示范制药有限公司' },
          },
          taskId: 'task-query-1', taskNo: 'TASK-INTERNAL-001', taskStatus: 'COMPLETED',
          residentName: '李梅', healthRecordNo: 'HR20260001', residentPhone: '13800000000',
          selectedProductName: '阿莫西林胶囊', dispensedAt: new Date().toISOString(),
          dispenserPractitionerId: 'pharmacist-1', plannedQuantity: 1, dispensedQuantity: 1,
          returnedQuantity: 0, dispenseUnitCode: 'BOX',
          clinicalContext: { encounterId: 'encounter-1', encounterNo: 'OP20260918001', diagnoses: [] },
        }]),
        stockItems: vi.fn().mockResolvedValue([]),
        task: vi.fn().mockResolvedValue({
          id: 'task-query-1', taskNo: 'TASK-INTERNAL-001', status: 'COMPLETED', stockSiteId: 'site-1',
          lines: [{ id: 'line-1', plannedQuantity: 1, dispensedQuantity: 1, returnedQuantity: 0, dispenseUnitCode: 'BOX' }],
          reviews: [],
        }),
        trace: vi.fn().mockResolvedValue({
          plannedQuantity: 1, dispensedQuantity: 1, returnedQuantity: 0, unitCode: 'BOX',
          events: [{
            id: 'event-1', dispenseNo: 'DISPENSE-INTERNAL-001', dispenseType: 'DISPENSE', occurredAt: '2026-09-18T06:15:00Z',
            dispenserPractitionerId: 'pharmacist-1', lines: [{ id: 'line-1', lotNo: '20260501', quantityDispensed: 1, dispenseUnitCode: 'BOX' }],
          }],
        }),
      },
      organization: {
        practitioners: vi.fn().mockResolvedValue([{ id: 'pharmacist-1', fullName: '王药师', sdPersonnelStatus: 'ACTIVE' }]),
        assignments: vi.fn().mockResolvedValue([]),
        practitioner: vi.fn().mockResolvedValue({ assignments: [] }),
      },
      residents: {
        page: vi.fn().mockResolvedValue({
          content: [{ id: 'resident-1', fullName: '李梅', gender: 'FEMALE', birthDate: '1985-06-15', phone: '13800000000', healthRecordNo: 'HR20260001' }],
        }),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}><MemoryRouter>
      <PharmacyWorkspace api={api} clinicalContext={clinicalContext} mode="query" />
    </MemoryRouter></QueryClientProvider>)

    expect(await screen.findByRole('table', { name: '历史发药记录' })).toBeInTheDocument()
    expect(screen.getByText('李梅')).toBeInTheDocument()
    expect(screen.getByText(/女 · \d+岁/)).toBeInTheDocument()
    expect(screen.getByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(screen.getByText(/通用名: 阿莫西林/)).toBeInTheDocument()
    expect(screen.getByText('0.25g*24粒/盒')).toBeInTheDocument()
    expect(screen.getByText('示范制药有限公司')).toBeInTheDocument()
    expect(screen.getByText('每次 2粒')).toBeInTheDocument()
    expect(screen.getByText('王药师')).toBeInTheDocument()
    expect(screen.getByTitle('点击切换快捷日期范围')).toHaveTextContent('今日')
    expect(screen.getByText('共 1 条')).toBeInTheDocument()
    expect(screen.queryByText('TASK-INTERNAL-001')).not.toBeInTheDocument()
    expect(screen.queryByText('DISPENSE-INTERNAL-001')).not.toBeInTheDocument()
    expect(screen.queryByText('COMPLETED')).not.toBeInTheDocument()
    expect(api.pharmacy.task).not.toHaveBeenCalled()
    expect(api.pharmacy.trace).not.toHaveBeenCalled()

    const queryInput = screen.getByPlaceholderText('姓名、手机号、就诊号、处方号或药品名称')
    fireEvent.change(queryInput, { target: { value: '不存在的患者' } })
    expect(screen.getByRole('table', { name: '历史发药记录' })).toBeInTheDocument()
    fireEvent.keyDown(queryInput, { key: 'Enter' })
    expect(await screen.findByText('未查询到匹配记录')).toBeInTheDocument()
  })
})
