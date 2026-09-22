import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { Appointment } from '../../shared/api/appointmentsApi'
import type { SystemEnumDefinition } from '../../shared/api/dictionaryApi'
import type { ServiceSchedule } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { AppointmentManagementWorkspace } from './AppointmentManagementWorkspace'

const appointment: Appointment = {
  id: 'appointment-1', revision: 0, appointmentNo: 'AP1001', residentId: 'resident-1',
  healthRecordNo: 'HR1001', residentName: '张三', gender: 'MALE', birthDate: '1990-01-01',
  scheduleId: 'schedule-1', scheduleCode: 'SCH1001', serviceDate: '2099-08-31',
  sdDayPart: 'MORNING', sdDayPartText: '上午', startAt: '2099-08-31T00:00:00Z',
  endAt: '2099-08-31T04:00:00Z', practitionerId: 'doctor-1', practitionerName: '李医生',
  serviceCode: 'GENERAL', serviceName: '全科门诊', locationName: '一诊室', sdStatus: 'BOOKED',
  sdStatusText: '待就诊', sdBookingSource: 'PHONE', sdBookingSourceText: '电话预约',
  confirmedAt: '2026-08-30T02:00:00Z', createdAt: '2026-08-30T02:00:00Z', updatedAt: '2026-08-30T02:00:00Z',
}

const schedule: ServiceSchedule = {
  id: 'schedule-1', scheduleCode: 'SCH1001', serviceDate: '2099-08-31', sdDayPart: 'MORNING',
  sdDayPartText: '上午', startAt: '2099-08-31T00:00:00Z', endAt: '2099-08-31T04:00:00Z',
  practitionerId: 'doctor-1', practitionerName: '李医生', catalogItemId: 'service-1', serviceCode: 'GENERAL',
  serviceName: '全科门诊', locationName: '一诊室', totalCount: 20, heldCount: 0, occupiedCount: 1,
  frozenCount: 0, availableCount: 19, sdStatus: 'PUBLISHED', sdStatusText: '可预约',
  sdManagementMode: 'SIMPLE', sdManagementModeText: '简易模式', sdBookingPolicy: 'SHARED',
  sdBookingPolicyText: '共享号源', sdSlotMode: 'POOL', sdSlotModeText: '号池模式',
  sdRegistrationScope: 'PRACTITIONER', sdRegistrationScopeText: '医生号',
  feeCurrencyCode: 'CNY', feeConfigured: true,
}

const definitions: Record<string, SystemEnumDefinition> = {
  SC_APPOINTMENT_STATUS: { code: 'SC_APPOINTMENT_STATUS', name: '预约状态', description: '', items: [
    { code: 'BOOKED', name: '待就诊', description: '', sortOrder: 10 },
    { code: 'CANCELLED', name: '已取消', description: '', sortOrder: 40 },
  ] },
  SC_APPOINTMENT_SOURCE: { code: 'SC_APPOINTMENT_SOURCE', name: '预约来源', description: '', items: [
    { code: 'WINDOW', name: '窗口预约', description: '', sortOrder: 10 },
    { code: 'PHONE', name: '电话预约', description: '', sortOrder: 20 },
    { code: 'INTERNAL', name: '院内预约', description: '', sortOrder: 30 },
  ] },
}

describe('AppointmentManagementWorkspace', () => {
  it('cancels a booked appointment from the independent appointment ledger', async () => {
    const cancelled = { ...appointment, sdStatus: 'CANCELLED', sdStatusText: '已取消',
      cancelledAt: '2026-08-30T03:00:00Z', cancellationReason: '居民行程变化' } as Appointment
    const cancel = vi.fn().mockResolvedValue(cancelled)
    const api = {
      appointments: { list: vi.fn().mockResolvedValue([appointment]), cancel },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]) },
      dictionaries: { systemEnum: vi.fn((code: string) => Promise.resolve(definitions[code])) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })

    render(<QueryClientProvider client={queryClient}><MemoryRouter>
      <AppointmentManagementWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('AP1001')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    await userEvent.type(screen.getByLabelText(/操作原因/), '居民行程变化')
    await userEvent.click(screen.getByRole('button', { name: '确认取消' }))

    await waitFor(() => expect(cancel).toHaveBeenCalledWith(
      'appointment-1', 'APPT-CANCEL-request-1', '居民行程变化',
    ))
    expect(await screen.findByText('已取消预约 AP1001，号源已返还')).toBeInTheDocument()
  })

  it('creates an appointment through the clinical scheduling workbench with patient card, schedule card and ticket preview', async () => {
    const user = userEvent.setup()
    const resident = {
      id: 'resident-99',
      fullName: '王建国',
      gender: 'MALE',
      birthDate: '1960-05-15',
      healthRecordNo: 'HR8888',
      phone: '13912345678',
      maskedNationalId: '110101********0011',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      version: 1,
      identifiers: [],
    } as const

    const createdAppointment: Appointment = {
      ...appointment,
      id: 'appointment-99',
      appointmentNo: 'AP9999',
      residentId: resident.id,
      residentName: resident.fullName,
      scheduleId: schedule.id,
      sdBookingSource: 'WINDOW',
      sdBookingSourceText: '窗口预约',
    }

    const create = vi.fn().mockResolvedValue(createdAppointment)
    const searchResidents = vi.fn().mockResolvedValue([resident])

    const api = {
      appointments: {
        list: vi.fn().mockResolvedValue([]),
        create,
        cancel: vi.fn(),
        reschedule: vi.fn(),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]) },
      dictionaries: { systemEnum: vi.fn((code: string) => Promise.resolve(definitions[code])) },
      residents: { search: searchResidents },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-uuid-99' })

    render(<QueryClientProvider client={queryClient}><MemoryRouter>
      <AppointmentManagementWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </MemoryRouter></QueryClientProvider>)

    // Open create appointment dialog
    const createBtn = await screen.findByRole('button', { name: /新建预约/ })
    await user.click(createBtn)

    // Verify dialog header and workbench layout
    const dialog = await screen.findByRole('dialog')
    const inDialog = within(dialog)

    expect(inDialog.getByText('门诊预约 · 号源调度')).toBeInTheDocument()
    expect(inDialog.getByText('1. 就诊患者确认')).toBeInTheDocument()
    expect(inDialog.getByText('2. 预约设置')).toBeInTheDocument()
    expect(inDialog.getByText('3. 预约核验单预览')).toBeInTheDocument()

    // Search and select resident
    const searchInput = inDialog.getByPlaceholderText('输入姓名、身份证、卡号或健康档案号')
    await user.type(searchInput, '王建国')
    const confirmSearchBtn = inDialog.getByRole('button', { name: '查询' })
    await user.click(confirmSearchBtn)

    const candidate = await inDialog.findByText('王建国')
    await user.click(candidate)

    // Verify patient details and phone displayed in card
    expect(await inDialog.findByText('13912345678')).toBeInTheDocument()
    expect(inDialog.getByText('HR8888')).toBeInTheDocument()

    // Verify schedule card is displayed and selectable
    expect(await inDialog.findByText('李医生')).toBeInTheDocument()
    expect(inDialog.getAllByText(/余 19 号/).length).toBeGreaterThanOrEqual(1)

    // Verify ticket preview has been generated
    expect(inDialog.getByText(/就诊当日请持医保码/)).toBeInTheDocument()

    // Submit appointment
    const submitBtn = inDialog.getByRole('button', { name: '确认预约' })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        residentId: 'resident-99',
        scheduleId: 'schedule-1',
        bookingSource: 'WINDOW',
        idempotencyCode: 'APPT-BOOK-request-uuid-99',
      }))
    })

    // Success notice displayed on workspace
    expect(await screen.findByText(/预约成功：AP9999/)).toBeInTheDocument()
  })

  it('supports clinic type, keyword filtering and reset in appointment workbench', async () => {
    const user = userEvent.setup()
    const expertSchedule: ServiceSchedule = {
      ...schedule,
      id: 'schedule-expert-2',
      serviceDate: '2099-09-01',
      practitionerName: '张建国',
      serviceName: '心血管内科专家门诊',
      departmentName: '心血管内科',
      availableCount: 5,
    }

    const api = {
      appointments: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        cancel: vi.fn(),
        reschedule: vi.fn(),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule, expertSchedule]) },
      dictionaries: { systemEnum: vi.fn((code: string) => Promise.resolve(definitions[code])) },
      residents: { search: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}><MemoryRouter>
      <AppointmentManagementWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </MemoryRouter></QueryClientProvider>)

    // Open create appointment dialog
    const createBtn = await screen.findByRole('button', { name: /新建预约/ })
    await user.click(createBtn)

    const dialog = await screen.findByRole('dialog')
    const inDialog = within(dialog)

    // Initially both schedules are displayed
    expect(await inDialog.findByText('李医生')).toBeInTheDocument()
    expect(await inDialog.findByText('张建国')).toBeInTheDocument()

    // Filter by '专家门诊'
    const expertBtn = inDialog.getByRole('button', { name: '专家门诊' })
    await user.click(expertBtn)
    expect(inDialog.getByText('张建国')).toBeInTheDocument()
    expect(inDialog.queryByText('李医生')).not.toBeInTheDocument()

    // Filter by '普通门诊'
    const regularBtn = inDialog.getByRole('button', { name: '普通门诊' })
    await user.click(regularBtn)
    expect(inDialog.getByText('李医生')).toBeInTheDocument()
    expect(inDialog.queryByText('张建国')).not.toBeInTheDocument()

    // Filter by search keyword
    const allBtn = inDialog.getByRole('button', { name: '全部号别' })
    await user.click(allBtn)
    const searchInput = inDialog.getByPlaceholderText(/搜索科室\/医生\/拼音/)
    await user.type(searchInput, 'ZJG')
    expect(inDialog.getByText('张建国')).toBeInTheDocument()
    expect(inDialog.queryByText('李医生')).not.toBeInTheDocument()

    // Clear search and test empty state
    await user.clear(searchInput)
    await user.type(searchInput, '不存在的医生')
    expect(await inDialog.findByText('暂无可预约班次')).toBeInTheDocument()

    // Reset filters
    const resetBtn = inDialog.getByRole('button', { name: '重置所有筛选' })
    await user.click(resetBtn)
    expect(await inDialog.findByText('李医生')).toBeInTheDocument()
    expect(await inDialog.findByText('张建国')).toBeInTheDocument()
  })

  it('supports professional scheduling with timed slot matrix selection', async () => {
    const user = userEvent.setup()
    const timedSlot1: ServiceSchedule = {
      ...schedule,
      id: 'timed-slot-1',
      sdSlotMode: 'TIMED',
      sdSlotModeText: '分时模式',
      sdManagementMode: 'PROFESSIONAL',
      startAt: '2099-08-31T00:00:00Z',
      endAt: '2099-08-31T00:30:00Z',
      availableCount: 4,
    }
    const timedSlot2: ServiceSchedule = {
      ...schedule,
      id: 'timed-slot-2',
      sdSlotMode: 'TIMED',
      sdSlotModeText: '分时模式',
      sdManagementMode: 'PROFESSIONAL',
      startAt: '2099-08-31T00:30:00Z',
      endAt: '2099-08-31T01:00:00Z',
      availableCount: 6,
    }

    const resident = {
      id: 'resident-88',
      fullName: '刘德华',
      gender: 'MALE',
      birthDate: '1970-09-27',
      healthRecordNo: 'HR6666',
      phone: '13800008888',
      maskedNationalId: '110101********8888',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      version: 1,
      identifiers: [],
    } as const

    const create = vi.fn().mockResolvedValue({
      ...appointment,
      id: 'appointment-88',
      residentId: resident.id,
      scheduleId: timedSlot2.id,
    })

    const api = {
      appointments: {
        list: vi.fn().mockResolvedValue([]),
        create,
        cancel: vi.fn(),
        reschedule: vi.fn(),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([timedSlot1, timedSlot2]) },
      dictionaries: { systemEnum: vi.fn((code: string) => Promise.resolve(definitions[code])) },
      residents: { search: vi.fn().mockResolvedValue([resident]) },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-uuid-timed' })

    render(<QueryClientProvider client={queryClient}><MemoryRouter>
      <AppointmentManagementWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </MemoryRouter></QueryClientProvider>)

    // Open create appointment dialog
    const createBtn = await screen.findByRole('button', { name: /新建预约/ })
    await user.click(createBtn)

    const dialog = await screen.findByRole('dialog')
    const inDialog = within(dialog)

    // Verify shift displays timed mode
    expect(await inDialog.findByText('分时排班')).toBeInTheDocument()
    expect(inDialog.getByText('专业分时号源')).toBeInTheDocument()
    expect(inDialog.getByText('专业分时模式')).toBeInTheDocument()

    // Verify both timed slots are rendered
    expect(inDialog.getAllByText(/08:00 - 08:30/).length).toBeGreaterThanOrEqual(1)
    expect(inDialog.getByText('08:30 - 09:00')).toBeInTheDocument()

    // Select resident
    const searchInput = inDialog.getByPlaceholderText('输入姓名、身份证、卡号或健康档案号')
    await user.type(searchInput, '刘德华')
    const confirmSearchBtn = inDialog.getByRole('button', { name: '查询' })
    await user.click(confirmSearchBtn)
    const candidate = await inDialog.findByText('刘德华')
    await user.click(candidate)

    // Click second timed slot
    const slot2Cell = inDialog.getByText('08:30 - 09:00')
    await user.click(slot2Cell)

    // Verify ticket preview updated to slot 2
    expect(inDialog.getAllByText(/08:30 - 09:00/).length).toBeGreaterThanOrEqual(2)

    // Submit appointment
    const submitBtn = inDialog.getByRole('button', { name: '确认预约' })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        residentId: 'resident-88',
        scheduleId: 'timed-slot-2',
        bookingSource: 'WINDOW',
        idempotencyCode: 'APPT-BOOK-request-uuid-timed',
      }))
    })
  })

  it('supports pool scheduling mode with time slice selection and confirmation panel in T-layout', async () => {
    const user = userEvent.setup()
    const poolSchedule: ServiceSchedule = {
      ...schedule,
      id: 'pool-schedule-1',
      startAt: '2099-09-01T08:00:00Z',
      endAt: '2099-09-01T12:00:00Z',
      availableCount: 30,
      totalCount: 30,
      registrationFee: 25.0,
      feeConfigured: true,
      serviceName: '全科医疗科门诊',
      practitionerName: '张医生',
      departmentName: '全科医疗科',
    }

    const resident = {
      id: 'resident-77',
      fullName: '陈建华',
      gender: 'MALE',
      birthDate: '1975-03-20',
      healthRecordNo: 'HR7777',
      phone: '13800007777',
      maskedNationalId: '310101********1234',
      createdAt: '2026-01-01T00:00:00Z',
      status: 'ACTIVE',
      version: 1,
      identifiers: [],
    } as const

    const create = vi.fn().mockResolvedValue({
      ...appointment,
      id: 'appointment-77',
      residentId: resident.id,
      scheduleId: poolSchedule.id,
    })

    const api = {
      appointments: {
        list: vi.fn().mockResolvedValue([]),
        create,
        cancel: vi.fn(),
        reschedule: vi.fn(),
      },
      scheduling: { schedules: vi.fn().mockResolvedValue([poolSchedule]) },
      dictionaries: { systemEnum: vi.fn((code: string) => Promise.resolve(definitions[code])) },
      residents: { search: vi.fn().mockResolvedValue([resident]) },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-uuid-pool' })

    render(<QueryClientProvider client={queryClient}><MemoryRouter>
      <AppointmentManagementWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </MemoryRouter></QueryClientProvider>)

    // Open create appointment dialog
    const createBtn = await screen.findByRole('button', { name: /新建预约/ })
    await user.click(createBtn)

    const dialog = await screen.findByRole('dialog')
    const inDialog = within(dialog)

    // Verify T-layout components
    expect(await inDialog.findByText('号池模式')).toBeInTheDocument()
    expect(inDialog.getByText('号池共享模式')).toBeInTheDocument()
    expect(inDialog.getByText(/该班次采用整段共享号池/)).toBeInTheDocument()

    // Select resident in top strip
    const searchInput = inDialog.getByPlaceholderText('输入姓名、身份证、卡号或健康档案号')
    await user.type(searchInput, '陈建华')
    const confirmSearchBtn = inDialog.getByRole('button', { name: '查询' })
    await user.click(confirmSearchBtn)
    const candidate = await inDialog.findByText('陈建华')
    await user.click(candidate)

    // Verify resident details
    expect(await inDialog.findByText('13800007777')).toBeInTheDocument()
    expect(inDialog.getByText('HR7777')).toBeInTheDocument()

    // Pick a pool time slice in left slot area
    const sliceBtn = inDialog.getAllByText('可选时段')[0]
    await user.click(sliceBtn)

    // Fill appointment reason in right settings area
    const reasonInput = inDialog.getByPlaceholderText(/如复诊配药/)
    await user.type(reasonInput, '慢病复诊配药')

    // Verify right confirmation cashier amount banner
    expect(inDialog.getByText('挂号诊查费')).toBeInTheDocument()
    expect(inDialog.getAllByText('¥25.00').length).toBeGreaterThanOrEqual(2)

    // Submit appointment via right confirmation footer
    const submitBtn = inDialog.getByRole('button', { name: '确认预约' })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        residentId: 'resident-77',
        scheduleId: 'pool-schedule-1',
        bookingSource: 'WINDOW',
        reason: expect.stringContaining('慢病复诊配药'),
        idempotencyCode: 'APPT-BOOK-request-uuid-pool',
      }))
    })
  })
})
