import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { ProfessionalScheduleResult } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { SchedulingWorkspace } from './SchedulingWorkspace'

const clinicalContext = {
  organization: { id: 'org-1', name: '青禾镇中心卫生院' },
  department: { id: 'dept-1', name: '全科医疗科' },
} as ClinicalContext

describe('SchedulingWorkspace', () => {
  it('creates department-scoped shared inventory without selecting a practitioner', async () => {
    const quickCreate = vi.fn().mockResolvedValue({ generationRunId: 'run-1', replayed: false, generatedCount: 20, skippedCount: 0, schedules: [] })
    const api = {
      scheduling: {
        bootstrap: vi.fn().mockResolvedValue({
          sdManagementMode: 'SIMPLE', sdManagementModeText: '简易模式', defaultCapacity: 30,
          defaultGenerateDays: 28, morning: { start: '08:00:00', end: '12:00:00' },
          afternoon: { start: '14:00:00', end: '17:00:00' },
          practitioners: [{ id: 'doctor-1', code: 'D001', name: '李医生', assignmentId: 'assignment-1' }],
        }),
        schedules: vi.fn().mockResolvedValue([]),
        quickCreate,
      },
      masterData: { services: vi.fn().mockResolvedValue([{
        id: 'service-1', code: 'GENERAL', name: '全科门诊', orderable: true, chargeable: true,
        sdUsageType: 'OUTPATIENT', serviceSubtype: 'OUTPATIENT_VISIT', accountingCategory: 'REGISTRATION',
        prices: [{ id: 'price-1', revision: 1, organizationId: 'org-1', sdPriceType: 'SALE',
          sdPriceTypeText: '销售价', price: 12, currencyCode: 'CNY', validFrom: '2020-01-01',
          validTo: '2099-12-31', priceDocumentCode: '青医保价〔2026〕1号', sdStatus: 'ACTIVE', sdStatusText: '启用' }],
        organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true },
      }]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const onDepartmentChange = vi.fn()
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })

    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} onDepartmentChange={onDepartmentChange}
        departmentOptions={[
          { organizationId: 'org-1', organizationName: '青禾镇中心卫生院', departmentId: 'dept-1', departmentName: '全科医疗科' },
          { organizationId: 'org-1', organizationName: '青禾镇中心卫生院', departmentId: 'dept-2', departmentName: '内科门诊' },
        ]} />
    </QueryClientProvider>)

    await userEvent.click(await screen.findByRole('button', { name: /批量排班/ }))
    expect(await screen.findByText('按科室挂号')).toBeInTheDocument()
    expect(screen.queryByText('门诊诊查项目与机构价格')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: '门诊服务' }))
    expect(await screen.findByText('¥12.00')).toBeInTheDocument()
    expect(screen.getByText(/机构价 · 价格效期 2020-01-01 至 2099-12-31 · 青医保价〔2026〕1号/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /全科门诊/ }))
    await userEvent.click(screen.getByRole('combobox', { name: '排班科室' }))
    await userEvent.click(await screen.findByRole('option', { name: '内科门诊' }))
    expect(onDepartmentChange).toHaveBeenCalledWith('org-1', 'dept-2')
    expect(screen.queryByText('请选择医生')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '生成排班' }))

    await waitFor(() => expect(quickCreate).toHaveBeenCalledWith(expect.objectContaining({
      registrationScope: 'DEPARTMENT', practitionerId: undefined, catalogItemId: 'service-1',
    })))
    expect(await screen.findByText(/已生成 20 个排班/)).toBeInTheDocument()
  })

  it('creates a minimal professional timed template when the department enables professional mode', async () => {
    const result = {
      generationRunId: 'run-1', replayed: false, generatedCount: 40, skippedCount: 0,
      template: {
        id: 'template-1', templateCode: 'TPL001', templateName: '基层门诊分时排班',
        practitionerId: 'doctor-1', practitionerName: '李医生', catalogItemId: 'service-1',
        serviceCode: 'GENERAL', serviceName: '全科门诊', validFrom: '2099-01-01', validTo: '2099-01-28',
        status: 'ACTIVE', sdRegistrationScope: 'PRACTITIONER', sdRegistrationScopeText: '医生号',
        periods: [], exceptions: [],
      },
      schedules: [],
    } as ProfessionalScheduleResult
    const createProfessionalTemplate = vi.fn().mockResolvedValue(result)
    const api = {
      scheduling: {
        bootstrap: vi.fn().mockResolvedValue({
          sdManagementMode: 'PROFESSIONAL', sdManagementModeText: '专业模式', defaultCapacity: 30,
          defaultGenerateDays: 28, morning: { start: '08:00:00', end: '12:00:00' },
          afternoon: { start: '14:00:00', end: '17:00:00' },
          practitioners: [{ id: 'doctor-1', code: 'D001', name: '李医生', assignmentId: 'assignment-1' }],
        }),
        schedules: vi.fn().mockResolvedValue([]),
        professionalTemplates: vi.fn().mockResolvedValue([]),
        createProfessionalTemplate,
      },
      masterData: { services: vi.fn().mockResolvedValue([{
        id: 'service-1', code: 'GENERAL', name: '全科门诊', orderable: true, chargeable: false,
        prices: [], sdUsageType: 'OUTPATIENT',
        serviceSubtype: 'OUTPATIENT_VISIT', accountingCategory: 'REGISTRATION',
        organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true },
      }]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })

    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} />
    </QueryClientProvider>)

    expect(await screen.findByText('专业排班')).toBeInTheDocument()
    expect(screen.getByText('暂无例外，将按固定规则生成全部班次。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '保存模板并生成班次' }))

    await waitFor(() => expect(createProfessionalTemplate).toHaveBeenCalledWith(expect.objectContaining({
      templateName: '基层门诊分时排班', practitionerId: 'doctor-1', catalogItemId: 'service-1',
      weekdays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '12:00', slotMode: 'TIMED',
      slotMinutes: 30, capacity: 1, exceptions: [], idempotencyCode: 'request-1',
    })))
    expect(await screen.findByText(/已保存，生成 40 个班次/)).toBeInTheDocument()
  })
})

  it('renders weekly matrix grid and handles week navigation correctly', async () => {
    const todayIso = new Date().toISOString().slice(0, 10)
    const api = {
      scheduling: {
        bootstrap: vi.fn().mockResolvedValue({
          sdManagementMode: 'SIMPLE', sdManagementModeText: '简易模式', defaultCapacity: 30,
          defaultGenerateDays: 28, morning: { start: '08:00:00', end: '12:00:00' },
          afternoon: { start: '14:00:00', end: '17:00:00' },
          practitioners: [
            { id: 'doctor-1', code: 'D001', name: '李医生', assignmentId: 'assignment-1' },
            { id: 'doctor-2', code: 'D002', name: '王医生', assignmentId: 'assignment-2' },
          ],
        }),
        schedules: vi.fn().mockResolvedValue([
          {
            id: 'schedule-1',
            scheduleCode: 'SCH001',
            serviceDate: todayIso,
            sdDayPart: 'MORNING',
            sdDayPartText: '上午',
            startAt: `${todayIso}T08:00:00`,
            endAt: `${todayIso}T12:00:00`,
            sdRegistrationScope: 'PRACTITIONER',
            sdRegistrationScopeText: '医生号',
            practitionerId: 'doctor-1',
            practitionerName: '李医生',
            catalogItemId: 'service-1',
            serviceCode: 'GENERAL',
            serviceName: '全科专家门诊',
            locationName: '一诊室',
            totalCount: 50,
            heldCount: 0,
            occupiedCount: 15,
            frozenCount: 0,
            availableCount: 35,
            sdStatus: 'PUBLISHED',
            sdStatusText: '预约中',
            sdManagementMode: 'SIMPLE',
            sdManagementModeText: '简易模式',
            sdBookingPolicy: 'SHARED',
            sdBookingPolicyText: '共享号源',
            sdSlotMode: 'POOL',
            sdSlotModeText: '整段共享',
            feeCurrencyCode: 'CNY',
            feeConfigured: false,
          },
        ]),
        quickCreate: vi.fn(),
      },
      masterData: { services: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} />
    </QueryClientProvider>)

    expect(await screen.findByText('出诊资源')).toBeInTheDocument()
    expect(screen.getByText('出诊资源')).toBeInTheDocument()
    expect(screen.getByText('李医生')).toBeInTheDocument()
    expect(screen.getByText('王医生')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /上周/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下周/ })).toBeInTheDocument()

    // 验证排班卡片在矩阵中正确呈现
    // screen.debug()
    expect(await screen.findByText('全科专家门诊', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText(/一诊室/)).toBeInTheDocument()
    expect(screen.getAllByText('35').length).toBeGreaterThanOrEqual(1)

    // 测试点击周导航切换周
    await userEvent.click(screen.getByRole('button', { name: /下周/ }))
    expect(api.scheduling.schedules).toHaveBeenCalled()
  })

  it('opens quick cell schedule dialog when clicking add slot in empty cell', async () => {
    const quickCreate = vi.fn().mockResolvedValue({ generationRunId: 'r1', replayed: false, generatedCount: 1, skippedCount: 0, schedules: [] })
    const api = {
      scheduling: {
        bootstrap: vi.fn().mockResolvedValue({
          sdManagementMode: 'SIMPLE', sdManagementModeText: '简易模式', defaultCapacity: 30,
          defaultGenerateDays: 28, morning: { start: '08:00:00', end: '12:00:00' },
          afternoon: { start: '14:00:00', end: '17:00:00' },
          practitioners: [{ id: 'doctor-1', code: 'D001', name: '李医生', assignmentId: 'assignment-1' }],
        }),
        schedules: vi.fn().mockResolvedValue([]),
        quickCreate,
      },
      masterData: { services: vi.fn().mockResolvedValue([{
        id: 'service-1', code: 'GENERAL', name: '全科门诊', orderable: true, chargeable: false,
        prices: [], sdUsageType: 'OUTPATIENT', serviceSubtype: 'OUTPATIENT_VISIT',
        accountingCategory: 'REGISTRATION', organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true },
      }]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} />
    </QueryClientProvider>)

    expect(await screen.findByText('出诊资源')).toBeInTheDocument()
    const addBtns = await screen.findAllByRole('button', { name: /\+ 排班/ })
    expect(addBtns.length).toBeGreaterThan(0)
    await userEvent.click(addBtns[0])

    expect(await screen.findByRole('heading', { name: '点位快速排班' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认排班' })).toBeInTheDocument()
  })
