import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { SystemEnumDefinition } from '../../shared/api/dictionaryApi'
import type { Appointment } from '../../shared/api/appointmentsApi'
import type { ReceptionQueueItem, ServiceSchedule } from '../../shared/api/schedulingApi'
import type { Encounter, Resident } from '../../shared/model'
import type { RegistrationBillingIntent } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientRegistrationWorkspace, queueItemStatusLabel, queueItemStatusTone } from './RegistrationWorkspace'

const resident: Resident = {
  id: 'resident-1', healthRecordNo: 'HR0001', fullName: '张三', maskedNationalId: '3301********1234',
  gender: 'MALE', birthDate: '1990-01-01', deceased: false, createdAt: '2026-08-29T01:00:00Z',
  status: 'ACTIVE', version: 0, identifiers: [],
}

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const schedule: ServiceSchedule = {
  id: 'schedule-1', scheduleCode: 'SC001', serviceDate: businessDate(), sdDayPart: 'MORNING',
  sdDayPartText: '上午', startAt: `${businessDate()}T00:00:00Z`, endAt: `${businessDate()}T04:00:00Z`,
  departmentId: 'dept-1', departmentName: '全科门诊',
  practitionerId: 'doctor-1', practitionerName: '李医生', catalogItemId: 'service-1',
  serviceCode: 'GENERAL', serviceName: '全科门诊', totalCount: 20, heldCount: 0, occupiedCount: 2,
  frozenCount: 0, availableCount: 18, sdStatus: 'PUBLISHED', sdStatusText: '可预约',
  sdManagementMode: 'SIMPLE', sdManagementModeText: '简易模式', sdBookingPolicy: 'SHARED',
  sdBookingPolicyText: '共享号源', sdSlotMode: 'POOL', sdSlotModeText: '号池模式',
  sdRegistrationScope: 'PRACTITIONER', sdRegistrationScopeText: '医生号',
  feeCurrencyCode: 'CNY', feeConfigured: true, registrationFee: 10,
}

const internalSchedule: ServiceSchedule = {
  id: 'schedule-2', scheduleCode: 'SC002', serviceDate: businessDate(), sdDayPart: 'AFTERNOON',
  sdDayPartText: '下午', startAt: `${businessDate()}T06:00:00Z`, endAt: `${businessDate()}T09:00:00Z`,
  departmentId: 'dept-2', departmentName: '内科门诊',
  practitionerId: 'doctor-2', practitionerName: '王专家', catalogItemId: 'service-2',
  serviceCode: 'INTERNAL', serviceName: '内科门诊', totalCount: 15, heldCount: 0, occupiedCount: 13,
  frozenCount: 0, availableCount: 2, sdStatus: 'PUBLISHED', sdStatusText: '可预约',
  sdManagementMode: 'SIMPLE', sdManagementModeText: '简易模式', sdBookingPolicy: 'SHARED',
  sdBookingPolicyText: '共享号源', sdSlotMode: 'POOL', sdSlotModeText: '号池模式',
  sdRegistrationScope: 'PRACTITIONER', sdRegistrationScopeText: '医生号',
  feeCurrencyCode: 'CNY', feeConfigured: true,
}

const encounter: Encounter = {
  id: 'encounter-1', residentId: resident.id, encounterNo: 'E20260829001', organizationId: 'org-1',
  departmentId: 'dept-1', registrationId: 'registration-1', scheduleId: schedule.id,
  registrationSource: 'WINDOW', visitType: 'GENERAL', status: 'REGISTERED', diagnoses: [],
  registeredAt: `${businessDate()}T02:00:00Z`,
}

const receipt: ReceptionQueueItem = {
  registrationId: 'registration-1', scheduleId: schedule.id, encounterId: encounter.id, residentId: resident.id,
  healthRecordNo: resident.healthRecordNo, residentName: resident.fullName, gender: resident.gender,
  birthDate: resident.birthDate, registrationNo: 'REG001', ticketNo: 'A001', sequenceNo: 1, priority: 0,
  registrationSource: 'WINDOW', visitType: 'GENERAL', registrationStatus: 'REGISTERED', status: 'WAITING',
  practitionerName: '李医生', serviceName: '全科门诊', registeredAt: encounter.registeredAt,
}

const visitTypes = {
  code: 'SC_VISIT_TYPE', name: '门诊就诊类型', items: [
    { code: 'GENERAL', name: '普通门诊', sortOrder: 10 },
    { code: 'FOLLOW_UP', name: '复诊', sortOrder: 20 },
    { code: 'EMERGENCY', name: '急诊', sortOrder: 30 },
  ],
} as SystemEnumDefinition

describe('OutpatientRegistrationWorkspace', () => {
  it('registers the deep-linked resident against an available schedule and shows the queue receipt', async () => {
    const registrationIntent = {
      id: 'intent-1', revision: 1, residentId: resident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, slotHoldId: 'hold-1', encounterId: encounter.id,
      idempotencyCode: 'REG-INTENT-request-1', registrationSource: 'WINDOW', visitType: 'GENERAL',
      settlementMode: 'SELF_PAY',
      status: 'COMPLETED', feeAmount: 0, currencyCode: 'CNY', completionAttempts: 1,
      createdAt: '2026-08-29T01:59:00Z', updatedAt: '2026-08-29T02:00:00Z', duplicate: false,
    } as RegistrationBillingIntent
    const createRegistrationIntent = vi.fn().mockResolvedValue(registrationIntent)
    const receptionQueue = vi.fn().mockResolvedValue([receipt])
    const api = {
      residents: { get: vi.fn().mockResolvedValue(resident), search: vi.fn(),
        profile: vi.fn().mockResolvedValue({ resident, demographicProfile: {}, addresses: [],
          relatedPersons: [], coverages: [], employments: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: {
        createRegistrationIntent,
        registrationIntent: vi.fn().mockResolvedValue(registrationIntent),
      },
      encounters: { byResident: vi.fn().mockResolvedValue([encounter]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const onNavigate = vi.fn()
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration?residentId=resident-1']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>)

    await screen.findByText(/健康档案号/)
    const confirmBtn = await screen.findByRole('button', { name: /确认挂号/ })
    await userEvent.click(confirmBtn)

    await waitFor(() => expect(createRegistrationIntent).toHaveBeenCalledWith(expect.objectContaining({
      residentId: resident.id,
      scheduleId: schedule.id,
      organizationId: 'org-1',
      departmentId: 'dept-1',
      registrationSource: 'WINDOW',
      visitType: 'GENERAL',
      settlementMode: 'SELF_PAY',
      coverageId: undefined,
      idempotencyCode: 'REG-INTENT-request-1',
    })))
    expect(await screen.findByText('挂号成功：挂号单 REG001，候诊号 A001')).toBeInTheDocument()
    expect(screen.queryByText('今日挂号记录')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '挂号查询' }))
    expect(onNavigate).toHaveBeenCalledWith('/outpatient/registration-query')
  })

  it('supports 30s quick registration dialog flow and auto-fills selected patient', async () => {
    const createdResident: Resident = {
      id: 'resident-quick', healthRecordNo: 'HR0099', fullName: '李小龙', maskedNationalId: '3301********9999',
      gender: 'MALE', birthDate: '1985-05-05', deceased: false, createdAt: '2026-08-29T01:00:00Z',
      status: 'ACTIVE', version: 0, identifiers: [],
    }
    const createResident = vi.fn().mockResolvedValue(createdResident)
    const api = {
      residents: {
        get: vi.fn(), search: vi.fn(), create: createResident,
        profile: vi.fn().mockResolvedValue({ resident: createdResident, demographicProfile: {}, addresses: [], relatedPersons: [], coverages: [], employments: [] }),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    // Open quick resident create modal
    const quickCreateButton = screen.getByRole('button', { name: /快速建档/ })
    expect(quickCreateButton.closest('.ui-page-header__actions')).toBeInTheDocument()
    expect(screen.queryByText('等待患者信息')).not.toBeInTheDocument()
    await userEvent.click(quickCreateButton)

    expect(screen.getByRole('heading', { name: '30秒极速建档' })).toBeInTheDocument()
    const nameInput = screen.getByPlaceholderText('如 张三')
    const nationalIdInput = screen.getByPlaceholderText(/18位身份证号/)
    expect(nameInput).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(nameInput).toHaveFocus()

    await userEvent.type(nameInput, '李小龙{Enter}')
    expect(nationalIdInput).toHaveFocus()

    await userEvent.type(nationalIdInput, '123{Enter}')
    expect(nationalIdInput).toHaveFocus()
    await userEvent.clear(nationalIdInput)
    await userEvent.click(screen.getByRole('button', { name: '确认建档并挂号' }))

    await waitFor(() => expect(createResident).toHaveBeenCalledWith(expect.objectContaining({
      fullName: '李小龙',
    })))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '30秒极速建档' })).not.toBeInTheDocument())
    expect(document.querySelector('.registration-patient-identity')).toHaveTextContent('李小龙')
    expect(document.querySelector('.registration-intake-strip')).toHaveClass('has-patient')
  })

  it('filters schedules by department category and pinyin search', async () => {
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule, internalSchedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await userEvent.click(screen.getByRole('button', { name: '全天' }))
    expect(screen.getByRole('button', { name: '全天' })).toHaveAttribute('aria-pressed', 'true')

    // Registration desks see all departments and sessions when viewing all day.
    expect(await screen.findByRole('button', { name: /全科门诊/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /王专家/ })).toBeInTheDocument()

    // Filter by pinyin `nk`
    const searchInput = screen.getByPlaceholderText(/输入科室\/医生名称或拼音/)
    await userEvent.type(searchInput, 'nk')

    // Only internal schedule should match
    expect(screen.getByRole('button', { name: /王专家/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /全科门诊/ })).not.toBeInTheDocument()
    })

    // Clear search
    await userEvent.click(screen.getByRole('button', { name: '清空科室或医生' }))
    expect(searchInput).toHaveFocus()
    expect(screen.getByRole('button', { name: /全科门诊/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /王专家/ })).toBeInTheDocument()

    // Filter by '👑 专家/名医号'
    await userEvent.click(screen.getByRole('button', { name: /专家\/名医号/ }))
    expect(screen.getByRole('button', { name: /王专家/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /全科门诊/ })).not.toBeInTheDocument()

    // Filter by '🏢 普通门诊'
    await userEvent.click(screen.getByRole('button', { name: /普通门诊/ }))
    expect(screen.getByRole('button', { name: /全科门诊/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /王专家/ })).not.toBeInTheDocument()
  })

  it('navigates schedule cards using arrow keys while focus stays in search input and updates receiving department', async () => {
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule, internalSchedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-general', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await userEvent.click(screen.getByRole('button', { name: '全天' }))
    await screen.findByRole('button', { name: /全科门诊/ })
    const cardGeneral = screen.getByRole('button', { name: /全科门诊/ })
    const cardInternal = await screen.findByRole('button', { name: /王专家/ })
    const searchInput = screen.getByPlaceholderText(/输入科室\/医生名称或拼音/)

    // Select first schedule (全科门诊)
    await userEvent.click(cardGeneral)
    expect(cardGeneral).toHaveClass('is-selected')
    expect(document.querySelector('.registration-cashier .cashier-panel__head')).toHaveTextContent('全科门诊')

    // Focus on search input
    searchInput.focus()
    expect(searchInput).toHaveFocus()

    // Press ArrowRight to switch to next card (王专家 / 内科门诊)
    await userEvent.keyboard('{arrowright}')
    expect(cardInternal).toHaveClass('is-selected')
    expect(cardGeneral).not.toHaveClass('is-selected')
    // Focus still stays in search input!
    expect(searchInput).toHaveFocus()
    // Receiving department reflects the selected schedule's department (内科门诊), not the user's clinicalContext
    expect(document.querySelector('.registration-cashier .cashier-panel__head')).toHaveTextContent('内科门诊')

    // Press ArrowLeft to switch back to first card (全科门诊)
    await userEvent.keyboard('{arrowleft}')
    expect(cardGeneral).toHaveClass('is-selected')
    expect(cardInternal).not.toHaveClass('is-selected')
    expect(searchInput).toHaveFocus()
    expect(document.querySelector('.registration-cashier .cashier-panel__head')).toHaveTextContent('全科门诊')

    // Test doctor pinyin initials search (w -> 王专家)
    await userEvent.type(searchInput, 'w')
    expect(screen.getByRole('button', { name: /王专家/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /全科门诊/ })).not.toBeInTheDocument()
    })
  })

  it('renders thermal receipt modal with ticket and fee details after successful registration', async () => {
    const registrationIntent = {
      id: 'intent-1', revision: 1, residentId: resident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, slotHoldId: 'hold-1', encounterId: encounter.id,
      idempotencyCode: 'REG-INTENT-request-1', registrationSource: 'WINDOW', visitType: 'GENERAL',
      settlementMode: 'SELF_PAY',
      status: 'COMPLETED', feeAmount: 0, currencyCode: 'CNY', completionAttempts: 1,
      createdAt: '2026-08-29T01:59:00Z', updatedAt: '2026-08-29T02:00:00Z', duplicate: false,
    } as RegistrationBillingIntent
    const api = {
      residents: { get: vi.fn().mockResolvedValue(resident), search: vi.fn(),
        profile: vi.fn().mockResolvedValue({ resident, demographicProfile: {}, addresses: [],
          relatedPersons: [], coverages: [], employments: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([receipt]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: {
        createRegistrationIntent: vi.fn().mockResolvedValue(registrationIntent),
        registrationIntent: vi.fn().mockResolvedValue(registrationIntent),
      },
      encounters: { byResident: vi.fn().mockResolvedValue([encounter]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '青禾镇中心卫生院' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration?residentId=resident-1']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await screen.findByText(/健康档案号/)
    await userEvent.click(await screen.findByRole('button', { name: /确认挂号/ }))

    // Thermal receipt modal should open automatically
    expect(await screen.findByRole('heading', { name: '门诊挂号热敏凭条' })).toBeInTheDocument()
    expect(screen.getByText('青禾镇中心卫生院')).toBeInTheDocument()
    expect(screen.getAllByText(/A001/)[0]).toBeInTheDocument()
    const printBtn = screen.getByRole('button', { name: /立即打印小票/ })
    expect(printBtn).toBeInTheDocument()
    expect(document.getElementById('registration-receipt-printable')).toBeInTheDocument()
    await userEvent.click(printBtn)
    expect(screen.getByRole('heading', { name: '门诊挂号热敏凭条' })).toBeInTheDocument()
  })

  it('displays today registration stream and supports cancelling a waiting registration', async () => {
    const cancelEncounter = vi.fn().mockResolvedValue({ completed: true, message: '退号成功', refundStatus: 'SUCCESS' })
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([receipt]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]), cancel: cancelEncounter },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    // Verify today's stream row
    expect(await screen.findByText('本窗口今日挂号记录（最近流水）')).toBeInTheDocument()
    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(screen.getByText('候诊中')).toBeInTheDocument()

    // Click '退号'
    await userEvent.click(screen.getByRole('button', { name: '退号' }))
    expect(screen.getByRole('heading', { name: '办理退号与退款' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '确认退号并退费' }))

    await waitFor(() => expect(cancelEncounter).toHaveBeenCalledWith(
      receipt.encounterId,
      expect.objectContaining({ reason: '患者主动要求退号' }),
    ))
  })

  it('supports end-to-end full keyboard workflow from patient search to checkout', async () => {
    const createRegistrationIntent = vi.fn().mockResolvedValue({
      id: 'intent-kb', encounterId: 'encounter-1', residentId: resident.id, status: 'COMPLETED',
      feeAmount: 10, currencyCode: 'CNY', itemName: '普通挂号', settlementId: 'set-1',
    })
    const api = {
      residents: { get: vi.fn(), search: vi.fn().mockResolvedValue([resident]), profile: vi.fn().mockResolvedValue({ coverages: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent, registrationIntent: vi.fn().mockResolvedValue({ status: 'COMPLETED' }) },
      encounters: { byResident: vi.fn().mockResolvedValue([encounter]), cancel: vi.fn() },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    // 1. Patient search via Enter (no mouse)
    const searchInput = screen.getByLabelText('患者姓名、证件或卡号')
    await userEvent.type(searchInput, '张三{enter}')

    expect(await screen.findByText('1 条候选记录')).toBeInTheDocument()

    // 2. Confirm candidate via Enter
    await userEvent.type(searchInput, '{enter}')
    expect(await screen.findByText(/健康档案号/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/输入科室\/医生名称或拼音/)).toHaveFocus()
    })

    // 3. Select schedule via Enter on schedule card
    const scheduleCard = screen.getByRole('button', { name: /全科门诊/ })
    await userEvent.click(scheduleCard)

    // 4. Test payment shortcut '2' for Alipay
    await userEvent.keyboard('2')
    const alipayChip = screen.getByRole('button', { name: /支付宝/ })
    expect(alipayChip).toHaveClass('is-active')

    // 5. Test F8 shortcut to confirm and create registration intent
    await userEvent.keyboard('{F8}')
    await waitFor(() => expect(createRegistrationIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        residentId: resident.id,
        scheduleId: schedule.id,
      }),
    ))
  })

  it('handles cash payment calculation with tender amount presets and change calculation', async () => {
    const api = {
      residents: { get: vi.fn(), search: vi.fn().mockResolvedValue([resident]), profile: vi.fn().mockResolvedValue({ coverages: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn().mockResolvedValue({ status: 'COMPLETED' }) },
      encounters: { byResident: vi.fn().mockResolvedValue([encounter]), cancel: vi.fn() },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    const searchInput = screen.getByLabelText('患者姓名、证件或卡号')
    await userEvent.type(searchInput, '张三{enter}')
    expect(await screen.findByText('1 条候选记录')).toBeInTheDocument()
    await userEvent.type(searchInput, '{enter}')
    expect(await screen.findByText(/健康档案号/)).toBeInTheDocument()

    const scheduleCard = screen.getByRole('button', { name: /全科门诊/ })
    await userEvent.click(scheduleCard)

    const cashChip = screen.getByRole('button', { name: /现金收款/ })
    await userEvent.click(cashChip)
    expect(cashChip).toHaveClass('is-active')

    expect(screen.getByText('缴款金额：')).toBeInTheDocument()
    expect(screen.getByText('¥0.00')).toBeInTheDocument()

    const preset20 = screen.getByRole('button', { name: '¥20' })
    await userEvent.click(preset20)
    expect(screen.getByText(/应找零给患者 ¥10.00/)).toBeInTheDocument()

    const cashInput = screen.getByPlaceholderText('10')
    await userEvent.click(cashInput)
    await userEvent.clear(cashInput)
    await userEvent.type(cashInput, '5')
    expect(await screen.findByRole('button', { name: /实收缴款不足，还差 ¥5.00/ })).toBeDisabled()
  })

  it('correctly maps all queue item statuses to Chinese labels and semantic tones', () => {
    expect(queueItemStatusLabel('WAITING')).toBe('候诊中')
    expect(queueItemStatusTone('WAITING')).toBe('warning')

    expect(queueItemStatusLabel('CALLED')).toBe('已叫号')
    expect(queueItemStatusTone('CALLED')).toBe('info')

    expect(queueItemStatusLabel('SERVING')).toBe('接诊中')
    expect(queueItemStatusTone('SERVING')).toBe('info')

    expect(queueItemStatusLabel('SERVING')).toBe('接诊中')
    expect(queueItemStatusTone('SERVING')).toBe('info')

    expect(queueItemStatusLabel('SUSPENDED')).toBe('已暂挂')
    expect(queueItemStatusTone('SUSPENDED')).toBe('warning')

    expect(queueItemStatusLabel('MISSED')).toBe('已过号')
    expect(queueItemStatusTone('MISSED')).toBe('warning')

    expect(queueItemStatusLabel('COMPLETED')).toBe('已诊毕')
    expect(queueItemStatusTone('COMPLETED')).toBe('success')

    expect(queueItemStatusLabel('CANCELLED')).toBe('已退号')
    expect(queueItemStatusTone('CANCELLED')).toBe('neutral')

    // registrationStatus: 'CANCELLED' always yields '已退号'
    expect(queueItemStatusLabel({ status: 'WAITING', registrationStatus: 'CANCELLED' } as ReceptionQueueItem)).toBe('已退号')
    expect(queueItemStatusTone({ status: 'WAITING', registrationStatus: 'CANCELLED' } as ReceptionQueueItem)).toBe('neutral')
  })

  it('renders 接诊中 status badge for a SERVING patient in today registration stream', async () => {
    const inServiceReceipt: ReceptionQueueItem = {
      ...receipt,
      registrationId: 'reg-in-service',
      residentName: '张建国',
      status: 'SERVING',
    }
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([inServiceReceipt]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('本窗口今日挂号记录（最近流水）')).toBeInTheDocument()
    expect(await screen.findByText('张建国')).toBeInTheDocument()

    // The unified queue status is presented as a concise Chinese label.
    expect(screen.getByText('接诊中')).toBeInTheDocument()
    const badge = screen.getByText('接诊中')
    expect(badge).toHaveClass('ui-badge--info')

    // Cannot refund once already in service
    expect(screen.queryByRole('button', { name: '退号' })).not.toBeInTheDocument()
  })

  it('proactively detects resident pending appointment today and enables one-click check-in', async () => {
    const todayAppointment = {
      id: 'app-today-1', revision: 0, appointmentNo: 'APPT-2026-999',
      residentId: resident.id, healthRecordNo: resident.healthRecordNo,
      residentName: resident.fullName, gender: resident.gender, birthDate: resident.birthDate,
      scheduleId: schedule.id, scheduleCode: schedule.scheduleCode, serviceDate: businessDate(),
      sdDayPart: 'MORNING', sdDayPartText: '上午',
      startAt: `${businessDate()}T08:30:00Z`, endAt: `${businessDate()}T11:30:00Z`,
      practitionerId: 'doctor-1', practitionerName: '李医生', serviceCode: 'GENERAL', serviceName: '全科门诊',
      sdStatus: 'BOOKED', sdStatusText: '待就诊', sdBookingSource: 'WINDOW', sdBookingSourceText: '窗口预约',
      confirmedAt: '2026-09-10T08:00:00Z', createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z',
    } as Appointment

    const createRegistrationIntent = vi.fn().mockResolvedValue({
      id: 'intent-app-1', revision: 1, residentId: resident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, appointmentId: todayAppointment.id,
      idempotencyCode: 'REG-INTENT-test', registrationSource: 'WINDOW', visitType: 'GENERAL',
      settlementMode: 'SELF_PAY', status: 'COMPLETED', feeAmount: 0, currencyCode: 'CNY',
      completionAttempts: 1, createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z', duplicate: false,
    } as RegistrationBillingIntent)

    const api = {
      residents: {
        get: vi.fn().mockResolvedValue(resident),
        search: vi.fn().mockResolvedValue([resident]),
        profile: vi.fn().mockResolvedValue({ resident, demographicProfile: {}, addresses: [], relatedPersons: [], coverages: [], employments: [] }),
      },
      appointments: {
        list: vi.fn().mockResolvedValue([todayAppointment]),
        get: vi.fn().mockResolvedValue(todayAppointment),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent, registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration?residentId=resident-1']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    // Verify appointment banner appears
    expect(await screen.findByText(/检测到该患者今日有待取号预约/)).toBeInTheDocument()
    expect(screen.getByText(/APPT-2026-999/)).toBeInTheDocument()

    // Click '一键带入预约取号'
    const applyBtn = screen.getByRole('button', { name: /一键带入预约取号/ })
    await userEvent.click(applyBtn)

    // Confirm that the linked appointment alert shows up
    expect(await screen.findByText(/正在办理预约/)).toBeInTheDocument()

    // Confirm registration
    const confirmBtn = await screen.findByRole('button', { name: /确认挂号/ })
    await userEvent.click(confirmBtn)

    // Expect mutation to include the appointmentId
    await waitFor(() => expect(createRegistrationIntent).toHaveBeenCalledWith(expect.objectContaining({
      residentId: resident.id,
      scheduleId: schedule.id,
      appointmentId: todayAppointment.id,
    })))
  })

  it('smartly defaults to self-pay when insured patient is looked up manually, offers one-click switch, and auto-fills cash tendered default', async () => {
    const insuredResident: Resident = { ...resident, id: 'insured-res-1', fullName: '王医保' }
    const insuredProfile = {
      resident: insuredResident,
      demographicProfile: {},
      addresses: [],
      relatedPersons: [],
      coverages: [{
        id: 'cov-1',
        sdCoverageType: '01',
        sdCoverageTypeText: '城镇职工基本医疗保险',
        payerName: '市社保医保中心',
        primary: true,
        validFrom: '2020-01-01',
      }],
      employments: [],
    }

    const createRegistrationIntent = vi.fn().mockResolvedValue({
      id: 'intent-smart-1', revision: 1, residentId: insuredResident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, idempotencyCode: 'REG-INTENT-test', registrationSource: 'WINDOW', visitType: 'GENERAL',
      settlementMode: 'SELF_PAY', status: 'COMPLETED', feeAmount: 10, currencyCode: 'CNY',
      completionAttempts: 1, createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z', duplicate: false,
    })

    const api = {
      residents: {
        get: vi.fn().mockResolvedValue(insuredResident),
        search: vi.fn().mockResolvedValue([insuredResident]),
        profile: vi.fn().mockResolvedValue(insuredProfile),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent, registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    // 1. Manual search by name
    const searchInput = screen.getByLabelText('患者姓名、证件或卡号')
    await userEvent.type(searchInput, '王医保{enter}')
    expect(await screen.findByText('1 条候选记录')).toBeInTheDocument()
    await userEvent.type(searchInput, '{enter}')

    // 2. Verified patient card loaded with channel
    expect(await screen.findByText('王医保')).toBeInTheDocument()
    expect(screen.getByText('就诊介质：')).toBeInTheDocument()
    expect(screen.getByText('普通/就诊卡')).toBeInTheDocument()

    // 3. Smart fee category: defaults to self-pay without blocking error, displays hint bar
    expect(await screen.findByText(/本次调入未出示医保介质，智能识别为自费/)).toBeInTheDocument()
    expect(screen.getByText('一键切换为医保')).toBeInTheDocument()
    // No blocking warning for self pay
    expect(screen.queryByText(/【医保接口未对接】/)).not.toBeInTheDocument()

    // 4. Cash tendered default value is automatically filled with schedule fee (10.00)
    const cashInput = screen.getByPlaceholderText('10') as HTMLInputElement
    expect(cashInput.value).toBe('10')
    expect(screen.getByText('¥0.00')).toBeInTheDocument()

    // 5. Test one-click switch to insurance
    const switchBtn = screen.getByRole('button', { name: /一键切换为医保/ })
    await userEvent.click(switchBtn)

    // Now it recognizes insurance
    expect(await screen.findByText(/已智能识别医保/)).toBeInTheDocument()
    expect(screen.getByText(/【医保接口未对接】/)).toBeInTheDocument()
  })

  it('automatically recognizes insurance coverage when scanning electronic insurance code', async () => {
    const insuredResident: Resident = { ...resident, id: 'insured-res-2', fullName: '李医保' }
    const insuredProfile = {
      resident: insuredResident,
      demographicProfile: {},
      addresses: [],
      relatedPersons: [],
      coverages: [{
        id: 'cov-2',
        sdCoverageType: '01',
        sdCoverageTypeText: '城镇职工基本医疗保险',
        payerName: '市社保医保中心',
        primary: true,
        validFrom: '2020-01-01',
      }],
      employments: [],
    }

    const api = {
      residents: {
        get: vi.fn().mockResolvedValue(insuredResident),
        search: vi.fn().mockResolvedValue([insuredResident]),
        profile: vi.fn().mockResolvedValue(insuredProfile),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    // Scan a 24-digit electronic insurance credential code
    const searchInput = screen.getByLabelText('患者姓名、证件或卡号')
    await userEvent.type(searchInput, '110000000000000000000001{enter}')

    // Auto fills patient and recognizes electronic insurance code channel
    expect(await screen.findByText('李医保')).toBeInTheDocument()
    expect(screen.getByText('电子医保码')).toBeInTheDocument()

    // Smart recognition sets coverage to insurance directly
    expect(await screen.findByText(/已智能识别医保/)).toBeInTheDocument()
    expect(screen.getByText(/【医保接口未对接】/)).toBeInTheDocument()
  })
})
