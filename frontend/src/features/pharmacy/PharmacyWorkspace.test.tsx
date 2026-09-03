import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
          stockLotId: 'lot-1', traceCode: 'TRACE-001', productCode: 'P001', productName: '护肝片', lotNo: 'LOT-1',
          packageQuantity: 1, baseQuantity: 200, remainingBaseQuantity: 200, status: 'AVAILABLE', updatedAt: '2026-08-30T13:00:00Z',
        }),
        dispense: vi.fn().mockResolvedValue({ taskId: 'task-1' }),
      },
      organization: {
        practitioners: vi.fn().mockResolvedValue([
          { id: 'practitioner-1', fullName: '王药师', code: 'P001', sdPersonnelStatus: 'ACTIVE' },
        ]),
        practitioner: vi.fn().mockResolvedValue({
          id: 'practitioner-1', fullName: '王药师', code: 'P001', sdPersonnelStatus: 'ACTIVE',
          assignments: [{ id: 'assignment-1', organizationId: 'org-1', departmentId: 'dept-1', positionName: '主管药师', departmentName: '全科医疗科', sdPersonnelStatus: 'ACTIVE' }],
        }),
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
    expect(screen.getByPlaceholderText('扫码或输入处方/患者/就诊号')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '发药窗口' })).toBeInTheDocument()

    // 2. Verify Left Patient Queue & standard Expiry select
    expect(screen.getByText('待发药患者')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '效期天数' })).toBeInTheDocument()
    expect((await screen.findAllByText('晓康')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '叫号' })).toBeInTheDocument()

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
    expect(screen.getByText(/1 g（66\.67片）/)).toBeInTheDocument()
    expect(screen.getByText('TID')).toBeInTheDocument()
    expect(screen.getByText('口服')).toBeInTheDocument()

    // 5. Verify Trace code scan status: red/insufficient before scan, green/success after scan
    const scanStatusBadge = await screen.findByTitle('追溯码尚未扫码')
    expect(scanStatusBadge).toHaveClass('pharmacy-scan-status--danger')
    expect(scanStatusBadge).toHaveTextContent('0 / 1 盒')
    const scanInput = screen.getByRole('textbox', { name: '追溯码或处方患者检索' })
    await userEvent.type(scanInput, 'TRACE-001{Enter}')
    await waitFor(() => expect(api.pharmacy.scanTraceCode).toHaveBeenCalledWith('site-1', 'TRACE-001'))
    const completedBadge = screen.getByTitle('追溯码数量已核对完成')
    expect(completedBadge).toHaveClass('pharmacy-scan-status--success')
    expect(completedBadge).toHaveTextContent('1 盒')
    expect(await screen.findByText(/已定位 护肝片，扫入数量 \+1/)).toBeInTheDocument()

    await userEvent.type(scanInput, 'TRACE-001{Enter}')
    expect(await screen.findByText(/已扫入，请勿重复扫码/)).toBeInTheDocument()
    expect(completedBadge).toHaveTextContent('1 盒')

    await userEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByTitle('追溯码尚未扫码')).toHaveTextContent('0 / 1 盒')
    await userEvent.click(screen.getByRole('button', { name: '发药(F4)' }))
    expect(await screen.findByText(/请先扫齐“护肝片”的追溯码/)).toBeInTheDocument()
    expect(api.pharmacy.dispense).not.toHaveBeenCalled()
    await userEvent.type(scanInput, 'TRACE-001{Enter}')
    expect(await screen.findByTitle('追溯码数量已核对完成')).toHaveTextContent('1 盒')

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
      traceCodeIds: ['trace-1'],
    }))
    expect(await screen.findByText(/已成功完成发药：晓康/)).toBeInTheDocument()

    // 9. Backend business failures must replace the success notice with the real result.
    vi.mocked(api.pharmacy.dispense).mockRejectedValueOnce({
      code: 'INVENTORY_PREVIOUS_PERIOD_NOT_CLOSED',
      message: '上一库存期间尚未月结，不能开启下一期间',
      correlationId: 'correlation-1',
    })
    await userEvent.type(scanInput, 'TRACE-001{Enter}')
    expect(await screen.findByTitle('追溯码数量已核对完成')).toHaveTextContent('1 盒')
    await userEvent.click(screen.getByRole('button', { name: '发药(F4)' }))
    const failedNotice = await screen.findByRole('alert')
    expect(failedNotice).toHaveTextContent('发药失败：上一库存期间尚未月结，不能开启下一期间')
    expect(screen.queryByText(/已成功完成发药：晓康/)).not.toBeInTheDocument()
    expect(failedNotice).toHaveClass('ui-toast')

    await userEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('displays both physical dose and minimum packaging unit when prescribed in countable units', async () => {
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
        taskId: 'task-2',
        taskNo: 'TASK002',
        taskStatus: 'READY_TO_DISPENSE',
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
        stockItems: vi.fn().mockResolvedValue([]),
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
    expect(await screen.findByTitle('该药品无需追溯码核对')).toHaveTextContent('无需扫码')
  })
})
