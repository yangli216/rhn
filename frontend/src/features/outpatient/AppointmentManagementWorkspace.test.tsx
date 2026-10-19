import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { Appointment } from '../../shared/api/appointmentsApi'
import type { SystemEnumDefinition } from '../../shared/api/dictionaryApi'
import type { ServiceSchedule } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { AppointmentManagementWorkspace } from './AppointmentManagementWorkspace'

/** 医生名同时出现在班次列表和预约核验中；断言班次列表本身。 */
const SHIFT_DOCTOR_NAME = '.appointment-shift-row__doctor-name'

const appointment: Appointment = {
  id: 'appointment-1', revision: 0, appointmentNo: 'AP1001', residentId: 'resident-1',
  healthRecordNo: 'HR1001', residentName: '张三', gender: '1', birthDate: '1990-01-01',
  scheduleId: 'schedule-1', scheduleCode: 'SCH1001', serviceDate: '2099-08-31',
  sdDayPart: 'MORNING', sdDayPartText: '上午', startAt: '2099-08-31T00:00:00Z',
  endAt: '2099-08-31T04:00:00Z', practitionerId: 'doctor-1', practitionerName: '李医生',
  serviceCode: 'GENERAL', serviceName: '全科门诊', locationName: '一诊室', sdStatus: 'BOOKED',
  sdStatusText: '待就诊', sdBookingSource: 'PHONE', sdBookingSourceText: '电话预约',
  confirmedAt: '2026-08-30T02:00:00Z', createdAt: '2026-08-30T02:00:00Z', updatedAt: '2026-08-30T02:00:00Z',
}

const schedule: ServiceSchedule = {
  id: 'schedule-1', scheduleCode: 'SCH1001', serviceDate: '2099-08-31', sdDayPart: 'MORNING',
  departmentId: 'dept-1', departmentName: '全科医疗科',
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
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2099-08-30T16:00:00Z').getTime())
  })
  afterEach(() => vi.restoreAllMocks())

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
      gender: '1',
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
    expect(inDialog.getByPlaceholderText('输入姓名、身份证、卡号或健康档案号')).toBeInTheDocument()
    expect(inDialog.getByText('预约设置')).toBeInTheDocument()
    expect(inDialog.getByText('预约核验')).toBeInTheDocument()

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
    expect(await inDialog.findByText('李医生', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
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

  it('supports keyword filtering and reset in appointment workbench', async () => {
    const user = userEvent.setup()
    const expertSchedule: ServiceSchedule = {
      ...schedule,
      id: 'schedule-expert-2',
      serviceDate: '2099-09-01',
      practitionerName: '张建国',
      serviceName: '心血管内科专家门诊',
      departmentId: 'dept-2',
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
    expect(await inDialog.findByText('李医生', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
    expect(await inDialog.findByText('张建国', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()

    const searchInput = inDialog.getByPlaceholderText(/搜索科室\/医生\/拼音/)
    const shiftGroup = inDialog.getByRole('radiogroup', { name: '出诊班次列表' })
    const shiftOptions = within(shiftGroup).getAllByRole('radio')
    expect(searchInput).toHaveFocus()
    expect(shiftOptions.filter((option) => option.tabIndex === 0)).toHaveLength(1)
    await user.keyboard('{ArrowDown}')
    expect(shiftOptions[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(shiftOptions[1]).toHaveFocus()
    expect(shiftOptions[1]).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{Home}')
    expect(shiftOptions[0]).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    const poolOptions = within(inDialog.getByRole('radiogroup', { name: '意向就诊时段' })).getAllByRole('radio')
    await waitFor(() => expect(poolOptions[0]).toHaveFocus())
    await user.keyboard('{ArrowLeft}')
    expect(shiftOptions[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(poolOptions[0]).toHaveFocus())

    // Filter by search keyword
    await user.type(searchInput, 'ZJG')
    expect(inDialog.getByText('张建国', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
    expect(inDialog.queryByText('李医生', { selector: SHIFT_DOCTOR_NAME })).not.toBeInTheDocument()

    // Clear search and test empty state
    await user.clear(searchInput)
    await user.type(searchInput, '不存在的医生')
    expect(await inDialog.findByText('暂无可预约班次')).toBeInTheDocument()

    // Reset filters
    const resetBtn = inDialog.getByRole('button', { name: '重置所有筛选' })
    await user.click(resetBtn)
    expect(await inDialog.findByText('李医生', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
    expect(await inDialog.findByText('张建国', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
  })

  it('filters every available daypart using schedule labels and clears a removed daypart after refresh', async () => {
    const user = userEvent.setup()
    const periods = [
      ['MORNING', '早间门诊', '早班医生'],
      ['MORNING', '早间门诊', '另一早班医生'],
      ['AFTERNOON', '下午', '午班医生'],
      ['EVENING', '夜间门诊', '夜班医生'],
      ['CUSTOM', ' ', '延时医生'],
    ] as const
    const available: ServiceSchedule[] = periods.map(([sdDayPart, sdDayPartText, practitionerName], index) => ({
      ...schedule, id: `schedule-${index}`, practitionerId: `doctor-${index}`,
      sdDayPart, sdDayPartText, practitionerName,
    }))
    const schedules = vi.fn().mockResolvedValue(available)
    const api = {
      appointments: { list: vi.fn().mockResolvedValue([]) },
      scheduling: { schedules },
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
    await user.click(await screen.findByRole('button', { name: /新建预约/ }))
    const dialog = within(await screen.findByRole('dialog'))
    await dialog.findByRole('button', { name: '夜间门诊' })
    const shifts = () => within(dialog.getByRole('radiogroup', { name: '出诊班次列表' })).getAllByRole('radio')
    expect(shifts()).toHaveLength(5)
    expect(dialog.getAllByRole('button', { name: '早间门诊' })).toHaveLength(1)
    expect(dialog.queryByRole('button', { name: '上午' })).not.toBeInTheDocument()

    for (const [code, label] of [['MORNING', '早间门诊'], ['AFTERNOON', '下午'], ['EVENING', '夜间门诊'], ['CUSTOM', 'CUSTOM']]) {
      await user.click(dialog.getByRole('button', { name: label }))
      const expected = available.filter((item) => item.sdDayPart === code)
      expect(shifts()).toHaveLength(expected.length)
      for (const item of expected) {
        expect(dialog.getByRole('radio', { name: new RegExp(`^${item.practitionerName}，`) })).toBeInTheDocument()
      }
    }
    await user.click(dialog.getByRole('button', { name: '全天' }))
    expect(shifts()).toHaveLength(5)

    await user.click(dialog.getByRole('button', { name: '夜间门诊' }))
    schedules.mockResolvedValue(available.filter((item) => item.sdDayPart !== 'EVENING'))
    await queryClient.invalidateQueries({ queryKey: ['future-appointment-schedules'] })
    await waitFor(() => expect(dialog.queryByRole('button', { name: '夜间门诊' })).not.toBeInTheDocument())
    expect(shifts()).toHaveLength(4)
  })

  it.each([
    [false, undefined, 'CNY', '未定价'],
    [false, 0, 'CNY', '未定价'],
    [true, undefined, 'CNY', '未定价'],
    [true, Number.NaN, 'CNY', '未定价'],
    [true, Number.POSITIVE_INFINITY, 'CNY', '未定价'],
    [true, 0, 'CNY', '¥0.00'],
    [true, 12.5, 'CNY', '¥12.50'],
    [true, 8, 'USD', 'US$8.00'],
  ] as const)('shows configured=%s amount=%s currency=%s consistently in the shift and confirmation', async (feeConfigured, registrationFee, feeCurrencyCode, expectedFee) => {
    const user = userEvent.setup()
    const api = {
      appointments: { list: vi.fn().mockResolvedValue([]) },
      scheduling: { schedules: vi.fn().mockResolvedValue([{ ...schedule, feeConfigured, registrationFee, feeCurrencyCode }]) },
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
    await user.click(await screen.findByRole('button', { name: /新建预约/ }))
    const dialog = within(await screen.findByRole('dialog'))
    const shifts = within(await dialog.findByRole('radiogroup', { name: '出诊班次列表' }))
    const shift = shifts.getByRole('radio')
    expect(shift).toHaveAccessibleName(expect.stringContaining(`，${expectedFee}，`))
    expect(within(shift).getByText(expectedFee, { exact: true })).toBeInTheDocument()
    await user.click(shift)
    expect(dialog.getByText('挂号诊查费').parentElement).toHaveTextContent(`挂号诊查费${expectedFee}`)
    expect(dialog.queryByText(/免诊查费|免收诊查费/)).not.toBeInTheDocument()
  })

  it('uses department IDs for filtering and shift grouping without treating service names as departments', async () => {
    const user = userEvent.setup()
    const available: ServiceSchedule[] = [
      { ...schedule, id: 'a', departmentId: 'dept-a', departmentName: '全科', availableCount: 11 },
      { ...schedule, id: 'b', departmentId: 'dept-b', departmentName: '全科', availableCount: 12 },
      { ...schedule, id: 'c', departmentId: 'dept-c', departmentName: '内科', serviceName: '全科', availableCount: 13 },
      { ...schedule, id: 'missing', departmentId: undefined, departmentName: '全科', serviceName: '全科', availableCount: 14 },
      { ...schedule, id: 'unnamed', departmentId: 'dept-unnamed', departmentName: ' ', availableCount: 15 },
      { ...schedule, id: 'a-other', departmentId: 'dept-a', departmentName: '全科', practitionerId: 'doctor-other', availableCount: 16 },
    ]
    const schedules = vi.fn().mockResolvedValue(available)
    const api = {
      appointments: { list: vi.fn().mockResolvedValue([]) },
      scheduling: { schedules },
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
    await user.click(await screen.findByRole('button', { name: /新建预约/ }))
    const dialog = within(await screen.findByRole('dialog'))
    await dialog.findByRole('button', { name: '全部科室 (4)' })
    const expectAvailableCounts = (counts: number[]) => {
      const shifts = within(dialog.getByRole('radiogroup', { name: '出诊班次列表' }))
      expect(shifts.getAllByRole('radio')).toHaveLength(counts.length)
      for (const count of counts) expect(shifts.getByRole('radio', { name: new RegExp(`，余${count}号$`) })).toBeInTheDocument()
    }
    expectAvailableCounts([11, 12, 13, 14, 15, 16])
    expect(dialog.queryByRole('button', { name: '全科' })).not.toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: '全科门诊' })).not.toBeInTheDocument()
    for (const [label, counts] of [
      ['全科（dept-a）', [11, 16]], ['全科（dept-b）', [12]], ['内科', [13]], ['dept-unnamed', [15]],
    ] as const) {
      await user.click(dialog.getByRole('button', { name: label }))
      expectAvailableCounts([...counts])
    }
    await user.click(dialog.getByRole('button', { name: '全部科室 (4)' }))
    expectAvailableCounts([11, 12, 13, 14, 15, 16])

    await user.click(dialog.getByRole('button', { name: '全科（dept-a）' }))
    schedules.mockResolvedValue(available.filter((item) => item.id === 'c' || item.id === 'missing'))
    await queryClient.invalidateQueries({ queryKey: ['future-appointment-schedules'] })
    await waitFor(() => expect(dialog.queryByRole('button', { name: '全科（dept-a）' })).not.toBeInTheDocument())
    expectAvailableCounts([13, 14])
    await user.click(dialog.getByRole('button', { name: '内科' }))
    expectAvailableCounts([13])
    await user.click(dialog.getByRole('button', { name: '全部科室 (1)' }))
    expectAvailableCounts([13, 14])
  })

  it('queries the displayed business week across year boundaries and retries a failed week without showing old slots', async () => {
    vi.mocked(Date.now).mockReturnValue(new Date('2026-12-30T15:30:00Z').getTime())
    const user = userEvent.setup()
    const dates = ['2026-12-31', '2027-01-05', '2027-01-12', '2027-01-19', '2027-01-26']
    const available = dates.map((serviceDate, index) => ({
      ...schedule, id: `week-${index}`, practitionerName: `第${index + 1}周医生`, serviceDate,
      startAt: `${serviceDate}T00:00:00Z`, endAt: `${serviceDate}T04:00:00Z`,
    }))
    let failThirdWeek = true
    const schedules = vi.fn(async (from: string, to: string) => {
      if (from === '2027-01-11' && failThirdWeek) {
        failThirdWeek = false
        throw new Error('本周号源暂时不可用')
      }
      return available.filter((item) => item.serviceDate >= from && item.serviceDate <= to)
    })
    const api = {
      appointments: { list: vi.fn().mockResolvedValue([]) },
      scheduling: { schedules },
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
    await user.click(await screen.findByRole('button', { name: /新建预约/ }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByText('第1周医生', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
    expect(schedules).toHaveBeenCalledWith('2026-12-30', '2027-01-03')
    expect(dialog.getByText('本周 (12/28 - 01/03)')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /12\/28/ })).toHaveAttribute('aria-disabled', 'true')
    expect(dialog.getByRole('button', { name: '上一周' })).toBeDisabled()

    const weekRanges = [
      ['2027-01-04', '2027-01-10'], ['2027-01-11', '2027-01-17'],
      ['2027-01-18', '2027-01-24'], ['2027-01-25', '2027-01-31'],
    ]
    for (const [index, [from, to]] of weekRanges.entries()) {
      await user.click(dialog.getByRole('button', { name: '下一周' }))
      if (from === '2027-01-11') {
        expect(await dialog.findByText('号源加载失败')).toBeInTheDocument()
        expect(dialog.queryByRole('radiogroup', { name: '出诊班次列表' })).not.toBeInTheDocument()
        expect(dialog.queryByText('暂无可预约班次')).not.toBeInTheDocument()
        expect(dialog.getByText('挂号诊查费').parentElement).toHaveTextContent('挂号诊查费--')
        await user.click(dialog.getByRole('button', { name: '重试' }))
      }
      expect(await dialog.findByText(`第${index + 2}周医生`, { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
      expect(schedules).toHaveBeenCalledWith(from, to)
      expect(dialog.queryByText(`第${index + 1}周医生`, { exact: true })).not.toBeInTheDocument()
      if (index === 0) await user.click(dialog.getByRole('button', { name: /01\/05/ }))
    }
    expect(dialog.getByRole('button', { name: '下一周' })).toBeEnabled()
    await user.click(dialog.getByRole('button', { name: '上一周' }))
    expect(await dialog.findByText('第4周医生', { selector: SHIFT_DOCTOR_NAME })).toBeInTheDocument()
    expect(dialog.queryByText('第5周医生', { exact: true })).not.toBeInTheDocument()
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
      gender: '1',
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
    expect(inDialog.getByText('专业分时号源')).toBeInTheDocument()
    expect(inDialog.getByText('专业分时模式')).toBeInTheDocument()

    // Verify both timed slots are rendered
    expect(inDialog.getAllByText(/08:00 - 08:30/).length).toBeGreaterThanOrEqual(1)
    expect(inDialog.getByText('08:30 - 09:00')).toBeInTheDocument()

    const timedSlotGroup = inDialog.getByRole('radiogroup', { name: '可选分时号源' })
    const timedSlotOptions = within(timedSlotGroup).getAllByRole('radio')
    expect(timedSlotOptions.filter((option) => option.tabIndex === 0)).toHaveLength(1)
    timedSlotOptions[0].focus()
    await user.keyboard('{ArrowDown}')
    expect(timedSlotOptions[1]).toHaveFocus()
    expect(timedSlotOptions[1]).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{Home}')
    expect(timedSlotOptions[0]).toHaveFocus()
    expect(timedSlotOptions[0]).toHaveAttribute('aria-checked', 'true')

    // Select resident
    const searchInput = inDialog.getByPlaceholderText('输入姓名、身份证、卡号或健康档案号')
    await user.type(searchInput, '刘德华')
    const confirmSearchBtn = inDialog.getByRole('button', { name: '查询' })
    await user.click(confirmSearchBtn)
    const candidate = await inDialog.findByText('刘德华')
    await user.click(candidate)

    // Choose the second timed slot and move directly to confirmation
    timedSlotOptions[1].focus()
    await user.keyboard('{Enter}')
    const submitBtn = inDialog.getByRole('button', { name: '确认预约' })
    await waitFor(() => expect(submitBtn).toHaveFocus())

    // Verify ticket preview updated to slot 2
    expect(inDialog.getAllByText(/08:30 - 09:00/).length).toBeGreaterThanOrEqual(2)

    // Submit appointment
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
      gender: '1',
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
    expect(dialog.querySelectorAll('.appointment-availability-workspace > section')).toHaveLength(2)
    expect(inDialog.getByText('号池共享模式')).toBeInTheDocument()
    expect(inDialog.getAllByText('可选时段').length).toBeGreaterThanOrEqual(1)

    const poolSlotGroup = inDialog.getByRole('radiogroup', { name: '意向就诊时段' })
    const poolSlotOptions = within(poolSlotGroup).getAllByRole('radio')
    expect(poolSlotOptions.filter((option) => option.tabIndex === 0)).toHaveLength(1)
    poolSlotOptions[0].focus()
    await user.keyboard('{ArrowDown}')
    expect(poolSlotOptions[1]).toHaveFocus()
    expect(poolSlotOptions[1]).toHaveAttribute('aria-checked', 'true')

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

    // Pick a pool time slice and move directly to confirmation
    poolSlotOptions[0].focus()
    await user.keyboard('{Enter}')
    const submitBtn = inDialog.getByRole('button', { name: '确认预约' })
    await waitFor(() => expect(submitBtn).toHaveFocus())

    // Fill appointment reason in right settings area
    const reasonInput = inDialog.getByPlaceholderText(/如复诊配药/)
    await user.type(reasonInput, '慢病复诊配药')

    // Verify right confirmation cashier amount banner
    expect(inDialog.getByText('挂号诊查费')).toBeInTheDocument()
    expect(inDialog.getAllByText('¥25.00').length).toBeGreaterThanOrEqual(2)

    // Submit appointment via right confirmation footer
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
