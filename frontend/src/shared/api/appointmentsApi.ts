import type { ApiClient } from './httpClient'

export type AppointmentStatus = 'BOOKED' | 'REGISTERED' | 'VISITED' | 'CANCELLED' | 'NO_SHOW'
export type AppointmentSource = 'WINDOW' | 'PHONE' | 'INTERNAL' | 'PATIENT_APP' | 'WECHAT' | 'THIRD_PARTY'

export const APPOINTMENT_SYSTEM_ENUM = {
  status: 'SC_APPOINTMENT_STATUS',
  source: 'SC_APPOINTMENT_SOURCE',
} as const

export interface Appointment {
  id: string
  revision: number
  appointmentNo: string
  residentId: string
  healthRecordNo: string
  residentName: string
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  birthDate: string
  scheduleId: string
  scheduleCode: string
  serviceDate: string
  sdDayPart: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM'
  sdDayPartText: string
  startAt: string
  endAt: string
  practitionerId?: string
  practitionerName?: string
  serviceCode: string
  serviceName: string
  locationName?: string
  sdStatus: AppointmentStatus
  sdStatusText: string
  sdBookingSource: AppointmentSource
  sdBookingSourceText: string
  confirmedAt: string
  checkedInAt?: string
  cancelledAt?: string
  cancellationReason?: string
  rescheduledFromId?: string
  createdAt: string
  updatedAt: string
}

export interface CreateAppointmentInput {
  residentId: string
  scheduleId: string
  bookingSource: AppointmentSource
  reason?: string
  idempotencyCode: string
}

export interface AppointmentListQuery {
  dateFrom: string
  dateTo: string
  status?: AppointmentStatus | ''
  query?: string
}

function queryString(input: AppointmentListQuery) {
  const query = new URLSearchParams({ dateFrom: input.dateFrom, dateTo: input.dateTo })
  if (input.status) query.set('status', input.status)
  if (input.query?.trim()) query.set('query', input.query.trim())
  return query.toString()
}

export function createAppointmentsApi(client: ApiClient) {
  return {
    get: (appointmentId: string) => client.request<Appointment>(
      `/api/outpatient/appointments/${encodeURIComponent(appointmentId)}`,
    ),
    list: (query: AppointmentListQuery) => client.request<Appointment[]>(
      `/api/outpatient/appointments?${queryString(query)}`,
    ),
    create: (input: CreateAppointmentInput) => client.request<Appointment>('/api/outpatient/appointments', {
      method: 'POST', body: JSON.stringify(input),
    }),
    cancel: (appointmentId: string, commandCode: string, reason: string) => client.request<Appointment>(
      `/api/outpatient/appointments/${appointmentId}/cancel`, {
        method: 'POST', body: JSON.stringify({ commandCode, reason }),
      },
    ),
    reschedule: (appointmentId: string, targetScheduleId: string, commandCode: string, reason: string) =>
      client.request<Appointment>(`/api/outpatient/appointments/${appointmentId}/reschedule`, {
        method: 'POST', body: JSON.stringify({ targetScheduleId, commandCode, reason }),
      }),
  }
}
