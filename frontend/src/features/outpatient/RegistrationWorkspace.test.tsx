import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { SystemEnumDefinition } from '../../shared/api/dictionaryApi'
import type { Appointment } from '../../shared/api/appointmentsApi'
import type { ReceptionQueueItem, ServiceSchedule } from '../../shared/api/schedulingApi'
import type { Encounter, Resident } from '../../shared/model'
import type { RegistrationBillingIntent } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { getSmartDayPart, OutpatientRegistrationWorkspace, queueItemStatusLabel, queueItemStatusTone } from './RegistrationWorkspace'

const resident: Resident = {
  id: 'resident-1', healthRecordNo: 'HR0001', fullName: '张三', maskedNationalId: '3301********1234',
  gender: '1', birthDate: '1990-01-01', deceased: false, createdAt: '2026-08-29T01:00:00Z',
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
  registrationSource: 'WINDOW', registrationSourceText: '窗口挂号', visitType: 'GENERAL', visitTypeText: '普通门诊',
  registrationStatus: 'REGISTERED', status: 'WAITING', statusText: '候诊中',
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
  it.each([
    ['2026-10-18T08:00:00+08:00', 'MORNING'],
    ['2026-10-18T12:15:00+08:00', 'MORNING'],
    ['2026-10-18T12:30:00+08:00', 'CUSTOM'],
    ['2026-10-18T13:30:00+08:00', 'ALL'],
    ['2026-10-18T14:00:00+08:00', 'AFTERNOON'],
    ['2026-10-18T18:00:00+08:00', 'EVENING'],
    ['2026-10-18T10:00:00Z', 'EVENING'],
    ['2026-10-18T20:00:00+08:00', 'ALL'],
  ] as const)('chooses the actual active schedule daypart at %s', (now, expected) => {
    const shifts: ServiceSchedule[] = [
      { ...schedule, startAt: '2026-10-18T08:00:00+08:00', endAt: '2026-10-18T12:30:00+08:00' },
      { ...schedule, sdDayPart: 'CUSTOM', startAt: '2026-10-18T12:30:00+08:00', endAt: '2026-10-18T13:30:00+08:00' },
      { ...schedule, sdDayPart: 'AFTERNOON', startAt: '2026-10-18T14:00:00+08:00', endAt: '2026-10-18T17:00:00+08:00' },
      { ...schedule, sdDayPart: 'EVENING', startAt: '2026-10-18T18:00:00+08:00', endAt: '2026-10-18T20:00:00+08:00' },
    ]
    expect(getSmartDayPart(shifts, Date.parse(now))).toBe(expected)
  })

  it('keeps all dayparts visible when active periods overlap and ignores unavailable or invalid schedules', () => {
    const active = { ...schedule, startAt: '2026-10-18T08:00:00+08:00', endAt: '2026-10-18T14:00:00+08:00' }
    const overlapping = { ...active, sdDayPart: 'CUSTOM' as const }
    const now = Date.parse('2026-10-18T12:00:00+08:00')
    expect(getSmartDayPart([active, overlapping], now)).toBe('ALL')
    expect(getSmartDayPart([active, { ...active, id: 'another-morning' }], now)).toBe('MORNING')
    expect(getSmartDayPart([active, { ...overlapping, sdStatus: 'SUSPENDED' },
      { ...overlapping, availableCount: 0 }, { ...overlapping, startAt: 'invalid' }], now)).toBe('MORNING')
    expect(getSmartDayPart([], now)).toBe('ALL')
  })

  it.each(['empty', 'failed', 'malformed'] as const)('blocks paid registration and F8 when payment configuration is %s', async (state) => {
    const applicable = state === 'failed' ? vi.fn().mockRejectedValue(new Error('字典服务不可用'))
      : vi.fn().mockResolvedValue(state === 'empty' ? [] : null)
    const createRegistrationIntent = vi.fn()
    const api = {
      residents: { get: vi.fn().mockResolvedValue(resident), profile: vi.fn().mockResolvedValue({ coverages: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable },
      billing: { createRegistrationIntent },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = { organization: { id: 'org-1', name: '机构' },
      department: { id: 'dept-1', name: '全科' } } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration?residentId=resident-1']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)
    await screen.findByText(/健康档案号/)
    await screen.findByText(state === 'empty' ? '未配置可用支付方式' : '支付方式加载失败')
    expect(screen.queryByRole('button', { name: /现金收款/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认挂号/ })).toBeDisabled()
    await userEvent.keyboard('1{F8}')
    expect(createRegistrationIntent).not.toHaveBeenCalled()
  })

  it.each(['1990-01-01', '1950-01-01'])('registers the resident born %s at the catalog price without promising an age-based benefit', async birthDate => {
    const selectedResident = { ...resident, birthDate }
    const registrationIntent = {
      id: 'intent-1', revision: 1, residentId: resident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, slotHoldId: 'hold-1', encounterId: encounter.id,
      idempotencyCode: 'REG-INTENT-request-1', registrationSource: 'WINDOW', visitType: 'GENERAL',
      settlementMode: 'SELF_PAY',
      status: 'COMPLETED', feeAmount: 0, currencyCode: 'CNY', completionAttempts: 1,
      createdAt: '2026-08-29T01:59:00Z', updatedAt: '2026-08-29T02:00:00Z', duplicate: false,
    } as RegistrationBillingIntent
    const createRegistrationIntent = vi.fn().mockResolvedValue(registrationIntent)
    const receptionQueue = vi.fn().mockResolvedValue([{ ...receipt, birthDate }])
    const api = {
      residents: { get: vi.fn().mockResolvedValue(selectedResident), search: vi.fn(),
        profile: vi.fn().mockResolvedValue({ resident: selectedResident, demographicProfile: {}, addresses: [],
          relatedPersons: [], coverages: [], employments: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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
    const cashInput = await screen.findByPlaceholderText('10') as HTMLInputElement
    await waitFor(() => expect(cashInput.value).toBe('10'))
    expect(screen.queryByText(/老年优待|老年人就医优待减免/)).not.toBeInTheDocument()
    await userEvent.type(cashInput, '{Enter}')

    await waitFor(() => expect(createRegistrationIntent).toHaveBeenCalledWith(expect.objectContaining({
      residentId: resident.id,
      scheduleId: schedule.id,
      organizationId: 'org-1',
      departmentId: 'dept-1',
      registrationSource: 'WINDOW',
      visitType: 'GENERAL',
      settlementMode: 'SELF_PAY',
      idempotencyCode: 'REG-INTENT-request-1',
    })))
    expect(await screen.findByText('挂号成功：挂号单 REG001，候诊号 A001')).toBeInTheDocument()
    expect(screen.queryByText('今日挂号记录')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '挂号查询' }))
    expect(onNavigate).toHaveBeenCalledWith('/outpatient/registration-query')
  })

  it.each([
    ['manual birthday, unknown gender', '1985-05-05', undefined, '0', undefined],
    ['manual birthday and gender', '1985-05-05', undefined, '2', '女'],
    ['male national ID', '1990-08-15', '33010219900815123X', '1', undefined],
    ['female national ID', '1949-12-31', '11010519491231002X', '2', undefined],
  ] as const)('creates a quick resident using entered or parsed demographics: %s', async (_source, birthDate, nationalId, gender, manualGender) => {
    const createdResident: Resident = {
      id: 'resident-quick', healthRecordNo: 'HR0099', fullName: '李小龙', maskedNationalId: '3301********9999',
      gender, birthDate, deceased: false, createdAt: '2026-08-29T01:00:00Z',
      status: 'ACTIVE', version: 0, identifiers: [],
    }
    const createResident = vi.fn().mockResolvedValue(createdResident)
    const api = {
      residents: {
        get: vi.fn(), search: vi.fn(), create: createResident,
        profile: vi.fn().mockResolvedValue({ resident: createdResident, demographicProfile: {}, addresses: [], relatedPersons: [], coverages: [], employments: [] }),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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
    const birthDateInput = screen.getByLabelText(/^出生日期/)
    const confirmCreate = screen.getByRole('button', { name: '确认建档并挂号' })
    expect(birthDateInput).toHaveValue('')
    expect(screen.getByLabelText(/^性别/)).toHaveTextContent('未知的性别')
    expect(nameInput).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(nameInput).toHaveFocus()

    await userEvent.type(nameInput, '李小龙{Enter}')
    expect(nationalIdInput).toHaveFocus()

    await userEvent.type(nationalIdInput, '123{Enter}')
    expect(nationalIdInput).toHaveFocus()
    await userEvent.clear(nationalIdInput)
    expect(confirmCreate).toBeDisabled()
    await userEvent.click(confirmCreate)
    expect(createResident).not.toHaveBeenCalled()

    if (nationalId) {
      await userEvent.type(nationalIdInput, nationalId)
    } else {
      fireEvent.change(birthDateInput, { target: { value: birthDate } })
    }
    if (manualGender) {
      await userEvent.click(screen.getByLabelText(/^性别/))
      await userEvent.click(screen.getByRole('option', { name: manualGender }))
    }
    expect(birthDateInput).toHaveValue(birthDate)
    expect(confirmCreate).toBeEnabled()
    await userEvent.click(confirmCreate)

    await waitFor(() => expect(createResident).toHaveBeenCalledWith(expect.objectContaining({
      fullName: '李小龙',
      birthDate,
      nationalId,
      gender,
      coverages: [],
    })))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '30秒极速建档' })).not.toBeInTheDocument())
    expect(document.querySelector('.registration-patient-identity')).toHaveTextContent('李小龙')
    expect(document.querySelector('.registration-intake-strip')).toHaveClass('has-patient')
  })

  it.each(['save', 'remove'] as const)('requires explicit coverage facts in quick registration: %s', async action => {
    const createResident = vi.fn().mockResolvedValue(resident)
    const resolve = vi.fn().mockResolvedValue([{ code: '04', name: '补充医疗保障', sortOrder: 1 }])
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), create: createResident,
        profile: vi.fn().mockResolvedValue({ resident, demographicProfile: {}, addresses: [], relatedPersons: [], coverages: [], employments: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]), resolve },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = { organization: { id: 'org-1', name: '机构' }, department: { id: 'dept-1', name: '全科' } } as ClinicalContext
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await userEvent.click(screen.getByRole('button', { name: /快速建档/ }))
    await userEvent.type(screen.getByPlaceholderText('如 张三'), resident.fullName)
    fireEvent.change(screen.getByLabelText(/^出生日期/), { target: { value: resident.birthDate } })
    await userEvent.click(screen.getByRole('button', { name: '补充保障信息' }))
    expect(screen.getByLabelText(/^支付方名称/)).toHaveValue('')
    expect(screen.getByLabelText(/^保障生效日期/)).toHaveValue('')
    await waitFor(() => expect(screen.getByLabelText(/^保障类型/)).toBeEnabled())
    await userEvent.click(screen.getByLabelText(/^保障类型/))
    await userEvent.click(await screen.findByRole('option', { name: /补充医疗保障/ }))
    expect(resolve).toHaveBeenCalledWith('INS_COVERAGE_TYPE')
    const confirm = screen.getByRole('button', { name: '确认建档并挂号' })
    await userEvent.click(confirm)
    expect(await screen.findByText(/需明确保障类型、支付方和有效期/)).toBeInTheDocument()
    expect(createResident).not.toHaveBeenCalled()

    if (action === 'save') {
      await userEvent.type(screen.getByLabelText(/^支付方名称/), ' 实际支付机构 ')
      await userEvent.type(screen.getByLabelText('个人编号/卡号'), ' MEMBER-123 ')
      fireEvent.change(screen.getByLabelText(/^保障生效日期/), { target: { value: '2021-01-01' } })
      fireEvent.blur(screen.getByLabelText(/^保障生效日期/))
      fireEvent.change(screen.getByLabelText('保障失效日期'), { target: { value: '2020-12-31' } })
      fireEvent.blur(screen.getByLabelText('保障失效日期'))
      await userEvent.click(confirm)
      await waitFor(() => expect(confirm).toBeEnabled())
      expect(createResident).not.toHaveBeenCalled()
      fireEvent.change(screen.getByLabelText('保障失效日期'), { target: { value: '2030-12-31' } })
      fireEvent.blur(screen.getByLabelText('保障失效日期'))
    } else {
      await userEvent.click(screen.getByRole('button', { name: '移除保障信息' }))
    }
    await userEvent.click(confirm)
    await waitFor(() => expect(createResident).toHaveBeenCalledWith(expect.objectContaining({
      coverages: action === 'save' ? [{ sdCoverageType: '04', payerName: '实际支付机构', memberNo: 'MEMBER-123',
        primary: true, validFrom: '2021-01-01', validTo: '2030-12-31' }] : [],
    })))
  })

  it('filters schedules by pinyin search and clinic type', async () => {
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule, internalSchedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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

  it('filters every returned daypart using the server display names', async () => {
    const now = Date.now()
    const dayParts = [
      ['MORNING', '早间门诊'], ['AFTERNOON', '午后门诊'], ['EVENING', '夜间门诊'], ['CUSTOM', '延时门诊'],
    ] as const
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue(dayParts.map(([sdDayPart, sdDayPartText], index) => ({
        ...schedule, id: `schedule-${index}`, sdDayPart, sdDayPartText, serviceName: `诊疗班次${index}`,
        startAt: new Date(now + (sdDayPart === 'EVENING' ? -60_000 : 60_000)).toISOString(),
        endAt: new Date(now + 120_000).toISOString(),
      }))), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = { organization: { id: 'org-1', name: '机构' }, department: { id: 'dept-1', name: '全科' } } as ClinicalContext
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await waitFor(() => expect(screen.getByRole('button', { name: '夜间门诊' })).toHaveAttribute('aria-pressed', 'true'))
    for (const [index, [, label]] of dayParts.entries()) {
      const button = await screen.findByRole('button', { name: label })
      await userEvent.click(button)
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: new RegExp(`诊疗班次${index}`) })).toBeInTheDocument()
      expect(document.querySelectorAll('.registration-schedule-card-compact')).toHaveLength(1)
    }
    await userEvent.click(screen.getByRole('button', { name: '全天' }))
    expect(document.querySelectorAll('.registration-schedule-card-compact')).toHaveLength(4)
  })

  it('filters by actual department IDs instead of fixed specialty keywords', async () => {
    const available = [
      { ...schedule, id: 'dental-first', departmentId: 'dept-dental', departmentName: '口腔诊疗中心', serviceName: '口腔初诊' },
      { ...schedule, id: 'dental-return', departmentId: 'dept-dental', departmentName: '口腔诊疗中心', serviceName: '口腔复诊' },
      { ...schedule, id: 'internal', departmentId: 'dept-chronic', departmentName: '慢病中心', serviceName: '口腔联合服务', locationName: '口腔诊疗中心' },
      { ...schedule, id: 'same-name', departmentId: 'dept-duplicate', departmentName: '口腔诊疗中心', serviceName: '外科转诊' },
      { ...schedule, id: 'unassigned', departmentId: undefined, departmentName: undefined, serviceName: '未归属号源' },
      { ...schedule, id: 'unnamed', departmentId: 'dept-unnamed', departmentName: ' ', serviceName: '无名称科室号源' },
      { ...schedule, id: 'closed', departmentId: 'dept-closed', departmentName: '停诊科', availableCount: 0 },
    ]
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue(available), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = { organization: { id: 'org-1', name: '机构' }, department: { id: 'dept-1', name: '全科' } } as ClinicalContext
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await userEvent.click(screen.getByRole('button', { name: '全天' }))
    await screen.findByRole('button', { name: /口腔初诊/ })
    const selectDepartment = screen.getByLabelText('接诊科室')
    await userEvent.click(selectDepartment)
    expect(screen.getAllByRole('option', { name: /口腔诊疗中心/ })).toHaveLength(2)
    expect(screen.queryByRole('option', { name: /停诊科/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /dept-dental/ }))
    expect(screen.getByRole('button', { name: /口腔初诊/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /口腔复诊/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /口腔联合服务/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /外科转诊/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /未归属号源/ })).not.toBeInTheDocument()

    await userEvent.click(selectDepartment)
    await userEvent.click(screen.getByRole('option', { name: /dept-duplicate/ }))
    expect(screen.getByRole('button', { name: /外科转诊/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /口腔初诊/ })).not.toBeInTheDocument()
    await userEvent.click(selectDepartment)
    await userEvent.click(screen.getByRole('option', { name: /dept-unnamed/ }))
    expect(screen.getByRole('button', { name: /无名称科室号源/ })).toBeInTheDocument()
    await userEvent.click(selectDepartment)
    await userEvent.click(screen.getByRole('option', { name: '全部科室' }))
    expect(screen.getByRole('button', { name: /口腔初诊/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /口腔联合服务/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /未归属号源/ })).toBeInTheDocument()
  })

  it.each([
    ['中医门诊', '中西医结合科', '中西医结合科'],
    ['内科门诊', '心血管诊疗中心', '心血管诊疗中心'],
    ['内科门诊', undefined, '未提供接诊科室'],
    ['中医门诊', '   ', '未提供接诊科室'],
  ] as const)('shows the authoritative department for service %s and department %s', async (serviceName, departmentName, expected) => {
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([{ ...schedule, serviceName, departmentName }]),
        receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([
        { code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } },
      ]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn() },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = { organization: { id: 'org-1', name: '机构' },
      department: { id: 'other-department', name: '当前工作科室' } } as ClinicalContext
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await userEvent.click(screen.getByRole('button', { name: '全天' }))
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(serviceName) }))
    const header = document.querySelector('.registration-cashier .cashier-panel__head')
    expect(header).toHaveTextContent(expected)
    expect(header).not.toHaveTextContent('当前工作科室')
    expect(header).not.toHaveTextContent(serviceName)
  })

  it('navigates schedule cards using arrow keys while focus stays in search input and updates receiving department', async () => {
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule, internalSchedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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

  it.each([
    ['2026-12-31T16:00:00Z', '2027-01-01 00:00:00前'],
    ['2026-10-19T02:15:37Z', '2026-10-19 10:15:37前'],
    [undefined, '未提供'],
    ['invalid', '未提供'],
  ] as const)('renders and prints the receipt using its actual expiry %s', async (validUntil, expectedCutoff) => {
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
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([{ ...receipt, validUntil }]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
      billing: {
        createRegistrationIntent: vi.fn().mockResolvedValue(registrationIntent),
        registrationIntent: vi.fn().mockResolvedValue(registrationIntent),
      },
      encounters: { byResident: vi.fn().mockResolvedValue([encounter]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
      printing: {
        registrationTicket: vi.fn().mockResolvedValue({ downloadUrl: '/api/platform/printing/outputs/1/content', templateVersion: 1 }),
        printPdf: vi.fn().mockResolvedValue(undefined),
      },
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
    const confirmBtn = await screen.findByRole('button', { name: /确认挂号/ })
    await waitFor(() => expect(confirmBtn).toBeEnabled())
    await userEvent.click(confirmBtn)

    // Thermal receipt modal should open automatically
    expect(await screen.findByRole('heading', { name: '门诊挂号热敏凭条' })).toBeInTheDocument()
    expect(screen.getByText('青禾镇中心卫生院')).toBeInTheDocument()
    expect(screen.getAllByText(/A001/)[0]).toBeInTheDocument()
    const printBtn = screen.getByRole('button', { name: /立即打印小票/ })
    expect(printBtn).toBeInTheDocument()
    const preview = screen.getByLabelText('热敏就诊凭条')
    expect(preview).toHaveTextContent(receipt.registrationNo)
    expect(screen.getByText('效期截止').nextElementSibling).toHaveTextContent(expectedCutoff)
    expect(preview).not.toHaveTextContent('当日当班有效')
    expect(preview).toHaveTextContent('请使用打印凭条上的条码办理业务')
    expect(preview.querySelector('.thermal-receipt-barcode-bars')).toBeNull()
    await userEvent.click(printBtn)
    expect(api.printing.registrationTicket).toHaveBeenCalledWith(receipt.registrationId, receipt.encounterId)
    expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/1/content')

    // Escape closes modal
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '门诊挂号热敏凭条' })).not.toBeInTheDocument()
    })
  })

  it.each([
    ['receipt location', schedule.id, '门诊楼 201', '门诊楼 102', '门诊楼 201'],
    ['matching schedule location', schedule.id, undefined, '门诊楼 102', '门诊楼 102'],
    ['blank receipt location', schedule.id, '   ', '门诊楼 102', '门诊楼 102'],
    ['missing location', schedule.id, undefined, undefined, '未记录'],
    ['blank locations', schedule.id, '   ', '   ', '未记录'],
    ['unavailable receipt schedule', 'other-schedule', undefined, '门诊楼 102', '未记录'],
    ['no receipt schedule', undefined, undefined, '门诊楼 102', '未记录'],
  ] as const)('reprints the receipt with its own location: %s', async (_scenario, scheduleId, locationName, scheduleLocation, expectedLocation) => {
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: {
        schedules: vi.fn().mockResolvedValue([{ ...schedule, locationName: scheduleLocation }]),
        receptionQueue: vi.fn().mockResolvedValue([{ ...receipt, scheduleId, locationName }]),
      },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      encounters: { byResident: vi.fn().mockResolvedValue([]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/outpatient/registration']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await userEvent.click(screen.getByRole('button', { name: '全天' }))
    await userEvent.click(await screen.findByRole('button', { name: /全科门诊/ }))
    await userEvent.click(await screen.findByRole('button', { name: '补打凭条' }))
    expect(await screen.findByRole('heading', { name: '门诊挂号热敏凭条' })).toBeInTheDocument()
    expect(screen.getByText('诊室地址').nextElementSibling).toHaveTextContent(expectedLocation)
    expect(screen.getByText('诊室地址').nextElementSibling).not.toHaveTextContent('全科门诊 诊室')
  })

  it('displays explicit error alert in modal when controlled printing fails', async () => {
    const registrationIntent = {
      id: 'intent-err-1', revision: 1, residentId: resident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, slotHoldId: 'hold-1', encounterId: encounter.id,
      idempotencyCode: 'REG-INTENT-err-1', registrationSource: 'WINDOW', visitType: 'GENERAL',
      settlementMode: 'SELF_PAY',
      status: 'COMPLETED', feeAmount: 0, currencyCode: 'CNY', completionAttempts: 1,
      createdAt: '2026-08-29T01:59:00Z', updatedAt: '2026-08-29T02:00:00Z', duplicate: false,
    } as RegistrationBillingIntent
    const api = {
      residents: { get: vi.fn().mockResolvedValue(resident), search: vi.fn(),
        profile: vi.fn().mockResolvedValue({ resident, demographicProfile: {}, addresses: [],
          relatedPersons: [], coverages: [], employments: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([receipt]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
      billing: {
        createRegistrationIntent: vi.fn().mockResolvedValue(registrationIntent),
        registrationIntent: vi.fn().mockResolvedValue(registrationIntent),
      },
      encounters: { byResident: vi.fn().mockResolvedValue([encounter]) },
      organization: { departments: vi.fn().mockResolvedValue([]) },
      printing: {
        registrationTicket: vi.fn().mockRejectedValue(new Error('打印服务离线或网络异常')),
      },
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
    const confirmBtn = await screen.findByRole('button', { name: /确认挂号/ })
    await waitFor(() => expect(confirmBtn).toBeEnabled())
    await userEvent.click(confirmBtn)
    expect(await screen.findByRole('heading', { name: '门诊挂号热敏凭条' })).toBeInTheDocument()

    const printBtn = screen.getByRole('button', { name: /立即打印小票/ })
    await userEvent.click(printBtn)

    // Should clearly show the error alert
    expect(await screen.findByText(/打印服务离线或网络异常/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重试打印/ })).toBeInTheDocument()
  })

  it.each([
    [true, '退号成功', 'REFUNDED'],
    [false, '退款处理中，成功后再次确认即可完成退号', 'PROCESSING'],
    [false, '退款未成功，请重新发起退号', 'FAILED'],
  ] as const)('shows the registration stream and the actual cancellation result: %s, %s', async (completed, message, refundStatus) => {
    const cancelEncounter = vi.fn().mockResolvedValue({ completed, message, refundStatus })
    const queueRecords: ReceptionQueueItem[] = [
      { ...receipt, registrationId: 'registration-yesterday', residentName: '前日患者',
        registeredAt: new Date(Date.parse(`${businessDate()}T00:00:00+08:00`) - 1).toISOString() },
      { ...receipt, registrationId: 'registration-tomorrow', residentName: '次日患者',
        registeredAt: new Date(Date.parse(`${businessDate()}T00:00:00+08:00`) + 86_400_000).toISOString() },
      { ...receipt, registrationId: 'registration-oldest', encounterId: 'encounter-oldest', registrationNo: 'REG000',
        ticketNo: 'A000', residentName: '最早患者', status: 'COMPLETED', statusText: '已诊毕', registeredAt: `${businessDate()}T01:00:00Z` },
      { ...receipt, registrationId: 'registration-latest', encounterId: 'encounter-latest', registrationNo: 'REG004',
        ticketNo: 'A004', residentName: '最新患者', status: 'COMPLETED', statusText: '已诊毕', registeredAt: `${businessDate()}T06:00:00Z` },
      { ...receipt, registrationId: 'registration-second', encounterId: 'encounter-second', registrationNo: 'REG003',
        ticketNo: 'A003', residentName: '次新患者', status: 'COMPLETED', statusText: '已诊毕', registeredAt: `${businessDate()}T05:00:00Z` },
      { ...receipt, registeredAt: `${businessDate()}T03:00:00Z` },
    ]
    const receptionQueue = vi.fn().mockResolvedValue(queueRecords)
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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

    // The ledger is expanded by default and only shows the latest three records, newest first.
    const historyTitle = await screen.findByText('本人今日挂号流水（最近 3 条）')
    const historyPanel = historyTitle.closest('details')
    expect(historyPanel).toHaveAttribute('open')
    expect(screen.queryByText('最近 3 条业务记录')).not.toBeInTheDocument()
    await screen.findByText('最新患者')
    const historyRows = screen.getByRole('table', { name: '今日挂号记录' }).querySelectorAll('tbody tr')
    expect(historyRows).toHaveLength(3)
    expect([...historyRows].map((row) => row.textContent)).toEqual([
      expect.stringContaining('最新患者'),
      expect.stringContaining('次新患者'),
      expect.stringContaining('张三'),
    ])
    expect(screen.queryByText('最早患者')).not.toBeInTheDocument()
    expect(screen.queryByText('前日患者')).not.toBeInTheDocument()
    expect(screen.queryByText('次日患者')).not.toBeInTheDocument()
    expect(historyPanel).toHaveTextContent('今日已挂号 4 人')
    expect(historyRows[0]).toHaveTextContent(`${businessDate()} 14:00`)
    expect(receptionQueue).toHaveBeenCalledWith(businessDate(), undefined, 'REGISTERED_BY_ME')
    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(screen.getByText('候诊中')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '刷新流水' }))
    await waitFor(() => expect(receptionQueue).toHaveBeenCalledTimes(2))
    expect(historyPanel).toHaveAttribute('open')

    // Click '退号'
    await userEvent.click(screen.getByRole('button', { name: '退号' }))
    expect(screen.getByRole('heading', { name: '办理退号与退款' })).toBeInTheDocument()

    const confirmCancellation = screen.getByRole('button', { name: '确认退号并退费' })
    expect(confirmCancellation).toBeDisabled()
    await userEvent.click(confirmCancellation)
    expect(cancelEncounter).not.toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText(/^退号原因/))
    await userEvent.click(screen.getByRole('option', { name: '挂错科室或医生' }))
    expect(confirmCancellation).toBeEnabled()
    await userEvent.click(confirmCancellation)

    await waitFor(() => expect(cancelEncounter).toHaveBeenCalledWith(
      receipt.encounterId,
      expect.objectContaining({ reason: '挂错科室或医生' }),
    ))
    const feedback = await screen.findByText(`${message}（退款状态：${refundStatus}）`)
    expect(feedback.closest('.ui-alert')).toHaveClass(completed ? 'ui-alert--success' : 'ui-alert--info')
    if (!completed) {
      expect(feedback.closest('.ui-alert')).not.toHaveClass('ui-alert--success')
      expect(screen.queryByText(/已成功办理退号|号源已释放/)).not.toBeInTheDocument()
    }
  })

  it('supports end-to-end full keyboard workflow from patient search to checkout', async () => {
    const createRegistrationIntent = vi.fn().mockResolvedValue({
      id: 'intent-kb', encounterId: 'encounter-1', residentId: resident.id, status: 'COMPLETED',
      feeAmount: 10, currencyCode: 'CNY', itemName: '普通挂号', settlementId: 'set-1',
    })
    const api = {
      residents: { get: vi.fn(), search: vi.fn().mockResolvedValue([resident]), profile: vi.fn().mockResolvedValue({ coverages: [] }) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }, { code: 'ALIPAY', name: '支付宝', sortOrder: 20, attributes: { TENDER_TYPE: 'DIGITAL', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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

    // F8 obeys the same unsupported-channel guard as the button.
    await userEvent.keyboard('{F8}')
    expect(createRegistrationIntent).not.toHaveBeenCalled()
    await userEvent.keyboard('1')

    // 5. Switching back to cash restores the payable amount and allows shortcut submission.
    expect(await screen.findByPlaceholderText('10')).toHaveValue(10)
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
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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
    expect(screen.getByPlaceholderText('10')).toHaveValue(10)
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

  it('labels queue items with server text or the reception status enum, and keeps semantic tones', () => {
    const receptionStatuses = { code: 'SC_RECEPTION_STATUS', name: '门诊候诊状态', description: '', items: [
      { code: 'WAITING', name: '候诊中', description: '', sortOrder: 10 },
      { code: 'MISSED', name: '已过号', description: '', sortOrder: 50 }] }
    expect(queueItemStatusLabel({ status: 'SERVING', statusText: '接诊中' } as ReceptionQueueItem)).toBe('接诊中')
    expect(queueItemStatusLabel('MISSED', receptionStatuses)).toBe('已过号')
    expect(queueItemStatusLabel('CALLED')).toBe('CALLED')

    expect(queueItemStatusTone('WAITING')).toBe('warning')
    expect(queueItemStatusTone('CALLED')).toBe('info')
    expect(queueItemStatusTone('SERVING')).toBe('info')
    expect(queueItemStatusTone('SUSPENDED')).toBe('warning')
    expect(queueItemStatusTone('MISSED')).toBe('warning')
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
      statusText: '接诊中',
    }
    const api = {
      residents: { get: vi.fn(), search: vi.fn(), profile: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([inServiceReceipt]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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

    expect(await screen.findByText('本人今日挂号流水（最近 3 条）')).toBeInTheDocument()
    expect(await screen.findByText('张建国')).toBeInTheDocument()

    // The unified queue status is presented as a concise Chinese label.
    expect(screen.getByText('接诊中')).toBeInTheDocument()
    const badge = screen.getByText('接诊中')
    expect(badge).toHaveClass('ui-badge--info')

    // Cannot refund once already in service
    expect(screen.queryByRole('button', { name: '退号' })).not.toBeInTheDocument()
  })

  it.each([
    ['MORNING', '上午', true],
    ['AFTERNOON', '下午', true],
    ['EVENING', '夜间门诊', true],
    ['CUSTOM', '午间延时门诊', true],
    ['EVENING', '夜间门诊', false],
  ] as const)('brings in a pending %s appointment (%s; schedule loaded: %s)', async (sdDayPart, sdDayPartText, scheduleLoaded) => {
    const todayAppointment = {
      id: 'app-today-1', revision: 0, appointmentNo: 'APPT-2026-999',
      residentId: resident.id, healthRecordNo: resident.healthRecordNo,
      residentName: resident.fullName, gender: resident.gender, birthDate: resident.birthDate,
      scheduleId: schedule.id, scheduleCode: schedule.scheduleCode, serviceDate: businessDate(),
      sdDayPart, sdDayPartText,
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
      scheduling: { schedules: vi.fn().mockResolvedValue(scheduleLoaded ? [{ ...schedule, sdDayPart, sdDayPartText }] : [internalSchedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
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
    expect(screen.getByRole('button', { name: sdDayPartText })).toHaveAttribute('aria-pressed', 'true')

    // Confirm registration
    const confirmBtn = await screen.findByRole('button', { name: /确认挂号/ })
    await waitFor(() => expect(confirmBtn).toBeEnabled())
    await userEvent.click(confirmBtn)

    // Expect mutation to include the appointmentId
    await waitFor(() => expect(createRegistrationIntent).toHaveBeenCalledWith(expect.objectContaining({
      residentId: resident.id,
      scheduleId: schedule.id,
      appointmentId: todayAppointment.id,
    })))
  })

  it('smartly defaults to self-pay and the payable cash amount when an insured patient is looked up manually', async () => {
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
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
      billing: { createRegistrationIntent, registrationIntent: vi.fn(),
        registrationInsuranceTiming: vi.fn().mockResolvedValue({ timing: 'VISIT_UNIFIED' }) },
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

    // 4. Cash tendered defaults to the payable amount for fast registration.
    const cashInput = screen.getByPlaceholderText('10') as HTMLInputElement
    expect(cashInput.value).toBe('10')
    expect(screen.getByText('¥0.00')).toBeInTheDocument()

    // 5. Test one-click switch to insurance
    const switchBtn = screen.getByRole('button', { name: /一键切换为医保/ })
    await userEvent.click(switchBtn)

    // Now it recognizes insurance
    expect(await screen.findByText(/已智能识别医保/)).toBeInTheDocument()
    expect(await screen.findByText(/挂号费并入诊间统一结算/)).toBeInTheDocument()
    expect(screen.queryByText(/【医保接口未对接】/)).not.toBeInTheDocument()
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
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金收款', sortOrder: 10, attributes: { TENDER_TYPE: 'CASH', PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
      billing: { createRegistrationIntent: vi.fn(), registrationIntent: vi.fn(),
        registrationInsuranceTiming: vi.fn().mockResolvedValue({ timing: 'REGISTRATION' }), queryInsurancePerson: vi.fn() },
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
    expect(screen.queryByText(/【医保接口未对接】/)).not.toBeInTheDocument()
    // 挂号时结算的机构：必须先完成医保读证，未鉴权不能提交
    expect(await screen.findByText(/请先读取医保电子凭证、证件或社保卡完成参保鉴权/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /确认挂号并出单/ }))
    expect(await screen.findByText('请先读取医保凭证完成参保鉴权后再挂号。')).toBeInTheDocument()
    expect(api.billing.createRegistrationIntent).not.toHaveBeenCalled()
  })

  it('creates a medical insurance intent after the certificate is authenticated at registration time', async () => {
    const insuredResident: Resident = { ...resident, id: 'insured-res-3', fullName: '赵医保' }
    const profile = {
      resident: insuredResident, demographicProfile: {}, addresses: [], relatedPersons: [], employments: [],
      coverages: [{ id: 'cov-3', sdCoverageType: '01', sdCoverageTypeText: '城镇职工基本医疗保险',
        payerName: '市社保医保中心', primary: true, validFrom: '2020-01-01' }],
    }
    const queryInsurancePerson = vi.fn().mockResolvedValue({ psnNo: 'PSN-1', psnCertType: '02', certno: 'X', psnName: '赵医保',
      insutype: '310', insutypeName: '职工基本医疗保险', balc: 100, insuOptins: '360100', status: 'NORMAL' })
    const createRegistrationIntent = vi.fn().mockResolvedValue({
      id: 'intent-ins-1', revision: 1, residentId: insuredResident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, idempotencyCode: 'REG-INTENT-test', registrationSource: 'WINDOW', visitType: 'GENERAL',
      settlementMode: 'MEDICAL_INSURANCE', insuranceTiming: 'REGISTRATION', status: 'PAYMENT_PENDING', feeAmount: 10,
      currencyCode: 'CNY', completionAttempts: 0, createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z', duplicate: false,
    })
    const api = {
      residents: { get: vi.fn().mockResolvedValue(insuredResident), search: vi.fn().mockResolvedValue([insuredResident]),
        profile: vi.fn().mockResolvedValue(profile) },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue: vi.fn().mockResolvedValue([]) },
      dictionaries: { systemEnum: vi.fn().mockResolvedValue(visitTypes), applicable: vi.fn().mockResolvedValue([]) },
      billing: { createRegistrationIntent, registrationIntent: vi.fn().mockResolvedValue({ id: 'intent-ins-1' }),
        registrationInsuranceTiming: vi.fn().mockResolvedValue({ timing: 'REGISTRATION' }), queryInsurancePerson },
      encounters: { byResident: vi.fn().mockResolvedValue([]), cancel: vi.fn() },
      organization: { departments: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = { organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' } } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/outpatient/registration']}>
      <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </MemoryRouter></QueryClientProvider>)

    const searchInput = screen.getByLabelText('患者姓名、证件或卡号')
    await userEvent.type(searchInput, '赵医保{enter}')
    await userEvent.type(searchInput, '{enter}')
    expect(await screen.findByText('赵医保')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /一键切换为医保/ }))

    await userEvent.type(await screen.findByLabelText('医保凭证号码'), '330102198801011234')
    await userEvent.click(screen.getByRole('button', { name: '读取参保信息' }))
    expect(await screen.findByText(/医保鉴权已完成/)).toBeInTheDocument()
    expect(queryInsurancePerson).toHaveBeenCalledWith({ psnCertType: '01', certno: '330102198801011234', psnName: undefined })

    await userEvent.click(screen.getByRole('button', { name: /确认挂号并出单/ }))
    await waitFor(() => expect(createRegistrationIntent).toHaveBeenCalledWith(expect.objectContaining({
      settlementMode: 'MEDICAL_INSURANCE', coverageId: 'cov-3',
    })))
  })
})
