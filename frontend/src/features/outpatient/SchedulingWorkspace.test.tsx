import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { ProfessionalScheduleResult, ServiceSchedule } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { SchedulingWorkspace } from './SchedulingWorkspace'
import { getNextWeekRange } from '../../shared/utils/dateRange'

const clinicalContext = {
  organization: { id: 'org-1', name: '青禾镇中心卫生院' },
  department: { id: 'dept-1', name: '全科医疗科' },
} as ClinicalContext

describe('SchedulingWorkspace', () => {
  it('keeps scheduling selection local and groups schedules by their department', async () => {
    const date = new Date()
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const bootstrap = vi.fn().mockResolvedValue({ sdManagementMode: 'SIMPLE', defaultCapacity: 30, defaultGenerateDays: 7,
      morning: { start: '08:00:00', end: '12:00:00' }, afternoon: { start: '14:00:00', end: '17:00:00' }, practitioners: [] })
    const schedules = vi.fn().mockResolvedValue(['全科', '内科', '儿科'].map((name, index) => ({
      id: `schedule-${index}`, departmentId: `dept-${index + 1}`, departmentName: `${name}医疗科`, serviceDate: day,
      sdRegistrationScope: 'DEPARTMENT', sdDayPart: 'MORNING', sdDayPartText: '上午', serviceName: `${name}诊查`,
      totalCount: 50, availableCount: 50, occupiedCount: 0, sdStatus: 'PUBLISHED',
    })))
    const api = { scheduling: { bootstrap, schedules }, masterData: { services: vi.fn().mockResolvedValue([]) } } as unknown as RhnApi
    api.withWorkContext = vi.fn().mockReturnValue(api)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const options = ['全科', '内科', '儿科'].map((name, index) => ({ organizationId: 'org-1', organizationName: '机构',
      departmentId: `dept-${index + 1}`, departmentName: `${name}医疗科` }))
    render(<QueryClientProvider client={queryClient}><SchedulingWorkspace api={api} clinicalContext={clinicalContext}
      departmentOptions={options} /></QueryClientProvider>)
    expect(await screen.findByText('全科诊查')).toBeInTheDocument()
    expect(screen.getByText('内科诊查')).toBeInTheDocument()
    expect(screen.getByText('儿科诊查')).toBeInTheDocument()
    expect(screen.getByLabelText('排班号源摘要')).toHaveTextContent('150')
    await userEvent.click(screen.getByRole('combobox', { name: '当前科室' }))
    await userEvent.click(screen.getByRole('option', { name: '内科医疗科' }))
    expect(await screen.findByText('内科诊查')).toBeInTheDocument()
    expect(screen.queryByText('全科诊查')).not.toBeInTheDocument()
    expect(api.withWorkContext).toHaveBeenCalledWith({ organizationId: 'org-1', departmentId: 'dept-2' })
    await userEvent.click(screen.getByRole('combobox', { name: '当前科室' }))
    await userEvent.click(screen.getByRole('option', { name: '全部科室' }))
    for (const name of ['全科', '内科', '儿科']) {
      expect(screen.getByText(`${name}诊查`).closest('.schedule-matrix__row')).toHaveTextContent(`${name}医疗科`)
    }
    expect(screen.getByLabelText('排班号源摘要')).toHaveTextContent('150')
    expect(screen.queryByRole('button', { name: /\+ 排班/ })).not.toBeInTheDocument()
  })

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
        sdUsageType: 'OUTPATIENT', serviceSubtype: 'OUTPATIENT_VISIT', outpatientSchedulable: true, accountingCategory: 'REGISTRATION',
        prices: [{ id: 'price-1', revision: 1, organizationId: 'org-1', sdPriceType: 'SALE',
          sdPriceTypeText: '销售价', price: 12, currencyCode: 'CNY', validFrom: '2020-01-01',
          validTo: '2099-12-31', priceDocumentCode: '青医保价〔2026〕1号', sdStatus: 'ACTIVE', sdStatusText: '启用' }],
        organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true },
      }]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })

    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext}
        departmentOptions={[
          { organizationId: 'org-1', organizationName: '青禾镇中心卫生院', departmentId: 'dept-1', departmentName: '全科医疗科' },
          { organizationId: 'org-1', organizationName: '青禾镇中心卫生院', departmentId: 'dept-2', departmentName: '内科门诊' },
        ]} />
    </QueryClientProvider>)

    await userEvent.click(await screen.findByRole('button', { name: /批量排班/ }))
    expect(await screen.findByText('按科室挂号')).toBeInTheDocument()
    expect(screen.getByTestId('date-range-picker')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '清空日期' }))
    expect(screen.getByRole('button', { name: '生成排班' })).toBeDisabled()
    await userEvent.click(screen.getByTitle('点击切换快捷日期范围'))
    for (const label of ['本周剩余', '下周', '未来7天', '未来14天', '未来28天', '本月剩余', '下月']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('option', { name: '下周' }))
    const nextWeek = getNextWeekRange()
    expect(screen.getByLabelText('排班开始日期')).toHaveValue(nextWeek.from)
    expect(screen.getByLabelText('排班结束日期')).toHaveValue(nextWeek.to)
    expect(screen.queryByText('门诊诊查项目与机构价格')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: '门诊服务' }))
    expect(await screen.findByText('¥12.00')).toBeInTheDocument()
    expect(screen.getByText(/机构价 · 价格效期 2020-01-01 至 2099-12-31 · 青医保价〔2026〕1号/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /全科门诊/ }))
    expect(screen.getByLabelText('诊室/出诊地点')).toHaveValue('')
    await userEvent.type(screen.getByLabelText('诊室/出诊地点'), '原科室诊室')
    await userEvent.click(screen.getByRole('combobox', { name: '排班科室' }))
    await userEvent.click(await screen.findByRole('option', { name: '内科门诊' }))
    expect(screen.queryByText('请选择医生')).not.toBeInTheDocument()
    expect(screen.getByLabelText('诊室/出诊地点')).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: '生成排班' }))

    await waitFor(() => expect(quickCreate).toHaveBeenCalledWith(expect.objectContaining({
      registrationScope: 'DEPARTMENT', practitionerId: undefined, catalogItemId: 'service-1',
      dateFrom: nextWeek.from, dateTo: nextWeek.to,
      locationName: undefined,
    })))
    expect(await screen.findByText(/已为【内科门诊】生成 20 个排班/)).toBeInTheDocument()
  })

  it.each(['current department', 'batch department', 'batch manual override'] as const)('blocks configuration failure and uses the correct defaults: %s', async failingScope => {
    const configuration = { sdManagementMode: 'SIMPLE', defaultCapacity: 23, defaultGenerateDays: 7,
      morning: { start: '09:15:00', end: '11:45:00' }, afternoon: { start: '13:30:00', end: '16:15:00' }, practitioners: [] }
    const bootstrap = vi.fn().mockResolvedValue(configuration)
    const batchConfiguration = { ...configuration, defaultCapacity: 37,
      morning: { start: '07:30:00', end: '11:00:00' }, afternoon: { start: '14:30:00', end: '18:00:00' } }
    const batchBootstrap = vi.fn().mockRejectedValueOnce(new Error('目标科室配置加载失败')).mockResolvedValue(batchConfiguration)
    if (failingScope === 'current department') bootstrap.mockRejectedValueOnce(new Error('当前科室配置加载失败'))
    const quickCreate = vi.fn().mockResolvedValue({ generatedCount: 1, skippedCount: 0, schedules: [] })
    const batchCreate = vi.fn().mockResolvedValue({ generatedCount: 1, skippedCount: 0, schedules: [] })
    const api = {
      scheduling: { bootstrap, schedules: vi.fn().mockResolvedValue([]), quickCreate },
      withWorkContext: vi.fn().mockReturnValue({ scheduling: { bootstrap: batchBootstrap, quickCreate: batchCreate, schedules: vi.fn().mockResolvedValue([]) }, masterData: { services: vi.fn().mockResolvedValue([{ id: 'service-1', code: 'GENERAL', name: '配置验证门诊', orderable: true, chargeable: false, prices: [], sdUsageType: 'OUTPATIENT', outpatientSchedulable: true, accountingCategory: 'REGISTRATION', organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true } }]) } }),
      masterData: { services: vi.fn().mockResolvedValue([{ id: 'service-1', code: 'GENERAL', name: '配置验证门诊',
        orderable: true, chargeable: false, prices: [], sdUsageType: 'OUTPATIENT', outpatientSchedulable: true,
        accountingCategory: 'REGISTRATION', organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true } }]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} departmentOptions={[
        { organizationId: 'org-1', organizationName: '机构', departmentId: 'dept-1', departmentName: '全科医疗科' },
        { organizationId: 'org-1', organizationName: '机构', departmentId: 'dept-2', departmentName: '内科门诊' },
      ]} />
    </QueryClientProvider>)

    const openBatch = screen.getByRole('button', { name: '批量排班' })
    if (failingScope === 'current department') {
      await screen.findByText('当前科室配置加载失败')
      expect(openBatch).toBeDisabled()
      expect(screen.queryByRole('button', { name: /\+ 排班/ })).not.toBeInTheDocument()
      await userEvent.click(openBatch)
      expect(quickCreate).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: '重新加载排班配置' }))
    }
    await waitFor(() => expect(openBatch).toBeEnabled())
    await userEvent.click(openBatch)
    await userEvent.click(screen.getByRole('combobox', { name: '门诊服务' }))
    await userEvent.click(screen.getByRole('option', { name: /配置验证门诊/ }))
    const create = screen.getByRole('button', { name: '生成排班' })
    if (failingScope !== 'current department') {
      fireEvent.change(screen.getByLabelText(/^每时段放号数/), { target: { value: '29' } })
      await userEvent.click(screen.getByRole('combobox', { name: '排班科室' }))
      await userEvent.click(screen.getByRole('option', { name: '内科门诊' }))
      await screen.findByText('目标科室配置加载失败')
      expect(create).toBeDisabled()
      await userEvent.click(create)
      expect(batchCreate).not.toHaveBeenCalled()
      expect(quickCreate).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: '重新加载所选科室配置' }))
    }
    await waitFor(() => expect(create).toBeEnabled())
    const expectedDefaults = failingScope === 'current department' ? configuration : batchConfiguration
    expect(screen.getByLabelText(/^每时段放号数/)).toHaveValue(expectedDefaults.defaultCapacity)
    if (failingScope === 'batch manual override') {
      fireEvent.change(screen.getByLabelText(/^每时段放号数/), { target: { value: '41' } })
      await act(async () => { await queryClient.refetchQueries({ queryKey: ['scheduling-bootstrap', 'dept-2'] }) })
      expect(screen.getByLabelText(/^每时段放号数/)).toHaveValue(41)
    }
    await userEvent.click(create)
    const expectedCreate = failingScope === 'current department' ? quickCreate : batchCreate
    await waitFor(() => expect(expectedCreate).toHaveBeenCalledWith(expect.objectContaining({
      capacity: failingScope === 'batch manual override' ? 41 : expectedDefaults.defaultCapacity,
      morningStart: expectedDefaults.morning.start.slice(0, 5), morningEnd: expectedDefaults.morning.end.slice(0, 5),
      afternoonStart: expectedDefaults.afternoon.start.slice(0, 5), afternoonEnd: expectedDefaults.afternoon.end.slice(0, 5),
    })))
    if (failingScope !== 'current department') {
      await waitFor(() => expect(screen.queryByRole('button', { name: '生成排班' })).not.toBeInTheDocument())
      await userEvent.click((await screen.findAllByRole('button', { name: /\+ 排班/ }))[0])
      expect(screen.getByLabelText(/^放号数量/)).toHaveValue(batchConfiguration.defaultCapacity)
      expect(screen.getByRole('button', { name: '上午 (07:30–11:00)' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '确认排班' }))
      await waitFor(() => expect(batchCreate).toHaveBeenCalledWith(expect.objectContaining({
        capacity: batchConfiguration.defaultCapacity, morningStart: '07:30', morningEnd: '11:00',
        afternoonStart: '14:30', afternoonEnd: '18:00',
      })))
    }
  })

  it.each([
    ['08:00:00', '12:00:00', false],
    ['07:30:00', '11:15:00', false],
    ['07:30:00', '11:15:00', true],
  ] as const)('uses configured professional template hours %s–%s (manual override: %s)', async (start, end, override) => {
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
          defaultGenerateDays: 28, morning: { start, end },
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
        serviceSubtype: 'OUTPATIENT_VISIT', outpatientSchedulable: true, accountingCategory: 'REGISTRATION',
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
    expect(screen.getByLabelText(/^开始时间/)).toHaveValue(start.slice(0, 5))
    expect(screen.getByLabelText(/^结束时间/)).toHaveValue(end.slice(0, 5))
    expect(screen.getByLabelText('诊室/地点')).toHaveValue('')
    if (override) {
      fireEvent.change(screen.getByLabelText(/^开始时间/), { target: { value: '09:10' } })
      fireEvent.change(screen.getByLabelText(/^结束时间/), { target: { value: '12:40' } })
      await userEvent.type(screen.getByLabelText('诊室/地点'), ' 门诊楼三层302室 ')
      await userEvent.click(screen.getByRole('button', { name: '新增例外' }))
      expect(screen.getByLabelText(/^原因/)).toHaveValue('')
      const saveTemplate = screen.getByRole('button', { name: '保存模板并生成班次' })
      expect(saveTemplate).toBeDisabled()
      await userEvent.type(screen.getByLabelText(/^原因/), '   ')
      expect(saveTemplate).toBeDisabled()
      await userEvent.type(screen.getByLabelText(/^原因/), '院内业务培训 ')
      await userEvent.click(screen.getByLabelText(/^处理方式/))
      await userEvent.click(screen.getByRole('option', { name: '调整班次' }))
      expect(screen.getByLabelText(/^原因/)).toHaveValue('   院内业务培训 ')
    }
    await userEvent.click(screen.getByRole('button', { name: '保存模板并生成班次' }))

    await waitFor(() => expect(createProfessionalTemplate).toHaveBeenCalledWith(expect.objectContaining({
      templateName: '基层门诊分时排班', practitionerId: 'doctor-1', catalogItemId: 'service-1',
      weekdays: [1, 2, 3, 4, 5], startTime: override ? '09:10' : start.slice(0, 5),
      endTime: override ? '12:40' : end.slice(0, 5), slotMode: 'TIMED',
      slotMinutes: 30, capacity: 1, idempotencyCode: 'request-1',
      exceptions: override ? [expect.objectContaining({ exceptionType: 'OVERRIDE', reason: '院内业务培训' })] : [],
      locationName: override ? '门诊楼三层302室' : undefined,
    })))
    expect(await screen.findByText(/已保存，生成 40 个班次/)).toBeInTheDocument()
  })
})

  it.each([
    ['EDIT', '修改班次', '保存调整', '调整原因'],
    ['SUSPEND', '暂停预约', '确认', '操作原因'],
    ['RESUME', '恢复预约', '确认', '操作原因'],
    ['CANCEL', '取消排班', '确认', '操作原因'],
  ] as const)('requires an entered reason for schedule operation %s', async (action, openLabel, confirmLabel, reasonLabel) => {
    const today = new Intl.DateTimeFormat('en-CA').format(new Date())
    const schedule = {
      id: 'schedule-reason', serviceDate: today, startAt: `${today}T08:00:00`, endAt: `${today}T12:00:00`,
      scheduleCode: 'SCH001', sdDayPart: 'MORNING', sdDayPartText: '上午',
      departmentId: 'dept-1', departmentName: '全科医疗科', sdRegistrationScope: 'DEPARTMENT', sdRegistrationScopeText: '科室号',
      serviceName: '测试排班', serviceCode: 'TEST', catalogItemId: 'service-1', totalCount: 20,
      heldCount: 0, occupiedCount: 0, frozenCount: 0, availableCount: 20,
      sdStatus: action === 'RESUME' ? 'SUSPENDED' : 'PUBLISHED', sdStatusText: '班次状态',
      sdManagementMode: 'SIMPLE', sdSlotMode: 'POOL', sdBookingPolicy: 'SHARED',
      feeCurrencyCode: 'CNY', feeConfigured: false,
    } as ServiceSchedule
    const update = vi.fn().mockResolvedValue(schedule)
    const changeStatus = vi.fn().mockResolvedValue(schedule)
    const api = {
      scheduling: { bootstrap: vi.fn().mockResolvedValue({ sdManagementMode: 'SIMPLE', defaultCapacity: 20,
        defaultGenerateDays: 28, morning: { start: '08:00:00', end: '12:00:00' },
        afternoon: { start: '14:00:00', end: '17:00:00' }, practitioners: [] }),
        schedules: vi.fn().mockResolvedValue([schedule]), update, changeStatus },
      masterData: { services: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} />
    </QueryClientProvider>)
    await userEvent.click(await screen.findByText('测试排班'))
    await userEvent.click(screen.getByRole('button', { name: openLabel }))
    const reason = screen.getByLabelText(new RegExp(`^${reasonLabel}`))
    const confirm = screen.getByRole('button', { name: new RegExp(confirmLabel) })
    expect(reason).toHaveValue('')
    expect(confirm).toBeDisabled()
    await userEvent.type(reason, '   ')
    await userEvent.click(confirm)
    expect(update).not.toHaveBeenCalled()
    expect(changeStatus).not.toHaveBeenCalled()
    await userEvent.type(reason, '院内业务培训 ')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    const command = action === 'EDIT' ? update : changeStatus
    await waitFor(() => expect(command).toHaveBeenCalledWith(schedule.id, expect.objectContaining({
      reason: '院内业务培训', ...(action === 'EDIT' ? {} : { action }),
    })))
  })

  it.each([
    ['MORNING', '上午', '上午', false, undefined, 'CNY', '未定价'],
    ['AFTERNOON', '下午', '下午', true, 0, 'CNY', '¥0.00'],
    ['EVENING', '夜间门诊', '夜间门诊', true, 12.5, 'CNY', '¥12.50'],
    ['CUSTOM', '午间延时门诊', '午间延时门诊', true, undefined, 'CNY', '未定价'],
    ['CUSTOM', ' ', 'CUSTOM', false, 0, 'CNY', '未定价'],
    ['MORNING', '早间门诊', '早间门诊', true, 8, 'USD', 'US$8.00'],
  ] as const)('renders the actual %s daypart and fee details (%s)', async (sdDayPart, sdDayPartText, expectedLabel, feeConfigured, registrationFee, feeCurrencyCode, expectedFee) => {
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
            sdDayPart,
            sdDayPartText,
            startAt: `${todayIso}T08:00:00`,
            endAt: `${todayIso}T12:00:00`,
            sdRegistrationScope: 'PRACTITIONER',
            sdRegistrationScopeText: '医生号',
            practitionerId: 'doctor-1',
            practitionerName: '李医生',
            departmentId: 'dept-1', departmentName: '全科医疗科',
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
            feeCurrencyCode,
            feeConfigured,
            registrationFee,
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
    await userEvent.click(screen.getByRole('combobox', { name: '当前科室' }))
    await userEvent.click(screen.getByRole('option', { name: '全科医疗科' }))
    expect(screen.getByText('出诊资源')).toBeInTheDocument()
    expect(screen.getByText('李医生')).toBeInTheDocument()
    expect(screen.getByText('王医生')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /上周/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下周/ })).toBeInTheDocument()

    // 验证排班卡片在矩阵中正确呈现
    // screen.debug()
    expect(await screen.findByText('全科专家门诊', {}, { timeout: 4000 })).toBeInTheDocument()
    const chip = screen.getByText('全科专家门诊').closest('.schedule-chip')
    expect(chip?.querySelector('.ui-badge')).toHaveTextContent(expectedLabel)
    expect(screen.getByText(/一诊室/)).toBeInTheDocument()
    expect(screen.getAllByText('35').length).toBeGreaterThanOrEqual(1)
    await userEvent.click(screen.getByText('全科专家门诊'))
    expect(screen.getByText('挂号费用').parentElement).toHaveTextContent(expectedFee)
    expect(screen.getByText('挂号费用').parentElement).not.toHaveTextContent('免收')
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))

    // 测试点击周导航切换周
    await userEvent.click(screen.getByRole('button', { name: /下周/ }))
    expect(api.scheduling.schedules).toHaveBeenCalled()
  })

  it.each([undefined, '门诊楼二层201室'])('creates a quick cell schedule with only the entered location: %s', async locationName => {
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
        prices: [], sdUsageType: 'OUTPATIENT', serviceSubtype: 'OUTPATIENT_VISIT', outpatientSchedulable: true,
        accountingCategory: 'REGISTRATION', organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true },
      }]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} />
    </QueryClientProvider>)

    expect(await screen.findByText('出诊资源')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: '当前科室' }))
    await userEvent.click(screen.getByRole('option', { name: '全科医疗科' }))
    const addBtns = await screen.findAllByRole('button', { name: /\+ 排班/ })
    expect(addBtns.length).toBeGreaterThan(0)
    await userEvent.click(addBtns[0])

    expect(await screen.findByRole('heading', { name: '点位快速排班' })).toBeInTheDocument()
    expect(screen.getByLabelText('诊室/地点')).toHaveValue('')
    if (locationName) await userEvent.type(screen.getByLabelText('诊室/地点'), ` ${locationName} `)
    await userEvent.click(screen.getByRole('button', { name: '确认排班' }))
    await waitFor(() => expect(quickCreate).toHaveBeenCalledWith(expect.objectContaining({ locationName })))
  })
