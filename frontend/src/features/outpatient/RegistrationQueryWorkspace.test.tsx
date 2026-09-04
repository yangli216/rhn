import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { SystemEnumDefinition } from '../../shared/api/dictionaryApi'
import type { ReceptionQueueItem } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { RegistrationQueryWorkspace } from './RegistrationQueryWorkspace'

const waitingRegistration: ReceptionQueueItem = {
  registrationId: 'registration-1', scheduleId: 'schedule-1', encounterId: 'encounter-1', residentId: 'resident-1',
  healthRecordNo: 'HR0001', residentName: '张三', gender: 'MALE', birthDate: '1990-01-01',
  registrationNo: 'REG001', ticketNo: 'A001', sequenceNo: 1, priority: 0, registrationSource: 'WINDOW',
  visitType: 'GENERAL', registrationStatus: 'REGISTERED', status: 'WAITING', practitionerName: '李医生',
  serviceName: '全科门诊', locationName: '诊室 1', registeredAt: '2026-08-31T01:30:00Z',
}

const completedRegistration: ReceptionQueueItem = {
  ...waitingRegistration,
  registrationId: 'registration-2', encounterId: 'encounter-2', residentId: 'resident-2',
  healthRecordNo: 'HR0002', residentName: '王芳', gender: 'FEMALE', birthDate: '1986-03-08',
  registrationNo: 'REG002', ticketNo: 'A002', sequenceNo: 2, registrationStatus: 'REGISTERED',
  status: 'COMPLETED', registeredAt: '2026-08-31T02:00:00Z',
}

const visitTypes = {
  code: 'SC_VISIT_TYPE', name: '门诊就诊类型', items: [
    { code: 'GENERAL', name: '普通门诊', sortOrder: 10 },
    { code: 'FOLLOW_UP', name: '复诊', sortOrder: 20 },
    { code: 'EMERGENCY', name: '急诊', sortOrder: 30 },
    { code: 'TRANSFER', name: '转诊', sortOrder: 40 },
  ],
} as SystemEnumDefinition

const receptionStatuses = {
  code: 'SC_RECEPTION_STATUS', name: '门诊候诊状态', items: [
    { code: 'WAITING', name: '候诊中', sortOrder: 10 },
    { code: 'IN_SERVICE', name: '接诊中', sortOrder: 20 },
    { code: 'COMPLETED', name: '已诊毕', sortOrder: 30 },
    { code: 'CANCELLED', name: '已取消', sortOrder: 40 },
  ],
} as SystemEnumDefinition

const clinicalContext = {
  organization: { id: 'org-1', name: '基层医疗机构' },
  department: { id: 'dept-1', name: '全科医疗科' },
} as ClinicalContext

function renderWorkspace(api: RhnApi, onNavigate = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(<QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={['/outpatient/registration-query']}>
      <RegistrationQueryWorkspace api={api} clinicalContext={clinicalContext} onNavigate={onNavigate} />
    </MemoryRouter>
  </QueryClientProvider>)
  return { onNavigate, queryClient }
}

function apiWithPage(queue: ReceptionQueueItem[], cancel = vi.fn()) {
  const receptionPage = vi.fn((params: {
    dateFrom?: string
    dateTo?: string
    status?: string
    query?: string
    page?: number
    size?: number
  } = {}) => {
    const page = params.page ?? 0
    const size = params.size ?? 20
    const queryStr = params.query?.toLowerCase()
    const status = params.status
    const filtered = queue.filter((item) => {
      if (status && item.status !== status) return false
      if (queryStr) {
        return [item.residentName, item.healthRecordNo, item.registrationNo, item.ticketNo]
          .some((val) => val?.toLowerCase().includes(queryStr))
      }
      return true
    })
    const totalElements = filtered.length
    const totalPages = Math.ceil(totalElements / size)
    const content = filtered.slice(page * size, (page + 1) * size)
    return Promise.resolve({
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    })
  })

  return {
    scheduling: { receptionPage },
    dictionaries: { systemEnum: vi.fn((code: string) => Promise.resolve(
      code === 'SC_VISIT_TYPE' ? visitTypes : receptionStatuses,
    )) },
    encounters: { cancel },
  } as unknown as RhnApi
}

describe('RegistrationQueryWorkspace', () => {
  it('queries a selected day, filters records and opens the exact encounter', async () => {
    const api = apiWithPage([waitingRegistration, completedRegistration])
    const onNavigate = vi.fn()
    renderWorkspace(api, onNavigate)

    expect(await screen.findByText('REG001')).toBeInTheDocument()
    expect(screen.getByText('REG002')).toBeInTheDocument()
    expect(screen.getByText('共 2 条记录')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-08-28' } })
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-08-28' } })
    await waitFor(() => expect(api.scheduling.receptionPage).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: '2026-08-28', dateTo: '2026-08-28', page: 0,
    })))

    await userEvent.type(screen.getByPlaceholderText('姓名、档案号、挂号单或候诊号'), 'REG002')
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.scheduling.receptionPage).toHaveBeenCalledWith(expect.objectContaining({
      query: 'REG002', page: 0,
    })))
    expect(screen.queryByText('REG001')).not.toBeInTheDocument()
    expect(screen.getByText('REG002')).toBeInTheDocument()

    await userEvent.clear(screen.getByPlaceholderText('姓名、档案号、挂号单或候诊号'))
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    await userEvent.click(await screen.findByRole('button', { name: '查看就诊' }))
    expect(onNavigate).toHaveBeenCalledWith(
      '/outpatient/reception?residentId=resident-1&encounterId=encounter-1',
    )
  })

  it('withdraws a waiting registration and refreshes the independent query', async () => {
    const cancel = vi.fn().mockResolvedValue({
      encounterId: 'encounter-1', encounterStatus: 'CANCELLED', registrationStatus: 'CANCELLED',
      queueStatus: 'CANCELLED', appointmentStatus: 'CANCELLED', billingStatus: 'CANCELLED',
      refundOrderId: 'refund-1', refundStatus: 'REFUNDED', completed: true,
      message: '退号完成，候诊资格已关闭，相关号源已返还',
    })
    const api = apiWithPage([waitingRegistration], cancel)
    const { queryClient } = renderWorkspace(api)
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: '退号' }))
    expect(screen.getByRole('heading', { name: '办理退号' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '确认退号' }))

    await waitFor(() => expect(cancel).toHaveBeenCalledWith('encounter-1', expect.objectContaining({
      reason: '患者主动取消就诊', terminalCode: 'REGISTRATION-WINDOW-WEB',
    })))
    expect(await screen.findByText(/退号完成，候诊资格已关闭/)).toBeInTheDocument()
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['outpatient-registrations'] })
  })
})
