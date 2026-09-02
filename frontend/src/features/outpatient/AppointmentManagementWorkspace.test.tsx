import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
})
