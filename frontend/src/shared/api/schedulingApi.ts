import type { ApiClient } from './httpClient'

export type ScheduleDayPart = 'MORNING' | 'AFTERNOON'

export const SCHEDULING_SYSTEM_ENUM = {
  visitType: 'SC_VISIT_TYPE',
  receptionStatus: 'SC_RECEPTION_STATUS',
} as const

export interface SchedulingBootstrap {
  sdManagementMode: 'SIMPLE' | 'PROFESSIONAL'
  sdManagementModeText: string
  defaultCapacity: number
  defaultGenerateDays: number
  morning: { start: string; end: string }
  afternoon: { start: string; end: string }
  practitioners: Array<{ id: string; code: string; name: string; assignmentId: string }>
}

export interface ServiceSchedule {
  id: string
  scheduleCode: string
  serviceDate: string
  sdDayPart: ScheduleDayPart
  sdDayPartText: string
  startAt: string
  endAt: string
  practitionerId: string
  practitionerName: string
  catalogItemId: string
  serviceCode: string
  serviceName: string
  locationName?: string
  totalCount: number
  heldCount: number
  occupiedCount: number
  frozenCount: number
  availableCount: number
  sdStatus: 'PUBLISHED' | 'SUSPENDED' | 'CANCELLED' | 'COMPLETED'
  sdStatusText: string
  sdManagementMode: 'SIMPLE' | 'PROFESSIONAL'
  sdManagementModeText: string
  sdBookingPolicy: 'SHARED' | 'CHANNEL_QUOTA'
  sdBookingPolicyText: string
  sdSlotMode: 'POOL' | 'TIMED'
  sdSlotModeText: string
}

export interface QuickScheduleInput {
  practitionerId: string
  catalogItemId: string
  dateFrom: string
  dateTo: string
  weekdays: number[]
  dayParts: ScheduleDayPart[]
  morningStart: string
  morningEnd: string
  afternoonStart: string
  afternoonEnd: string
  capacity: number
  locationName?: string
  idempotencyCode: string
}

export interface QuickScheduleResult {
  generationRunId: string
  replayed: boolean
  generatedCount: number
  skippedCount: number
  schedules: ServiceSchedule[]
}

export interface UpdateScheduleInput {
  startTime: string
  endTime: string
  capacity: number
  locationName?: string
  commandCode: string
  reason: string
}

export interface ChangeScheduleStatusInput {
  action: 'SUSPEND' | 'RESUME' | 'CANCEL'
  commandCode: string
  reason: string
}

export interface ReceptionQueueItem {
  registrationId: string
  appointmentId?: string
  scheduleId?: string
  encounterId: string
  residentId: string
  healthRecordNo: string
  residentName: string
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  birthDate: string
  registrationNo: string
  ticketNo: string
  sequenceNo: number
  priority: number
  registrationSource: 'WINDOW' | 'WALK_IN' | 'DIRECT' | 'EMERGENCY' | 'TRANSFER'
  visitType: 'GENERAL' | 'FOLLOW_UP' | 'EMERGENCY' | 'TRANSFER'
  registrationStatus: 'REGISTERED' | 'CANCELLED'
  status: 'WAITING' | 'IN_SERVICE' | 'SUSPENDED' | 'COMPLETED' | 'TRANSFERRED' | 'CANCELLED'
  practitionerName?: string
  serviceName?: string
  locationName?: string
  registeredAt: string
  calledAt?: string
}

function dates(dateFrom: string, dateTo: string) {
  const query = new URLSearchParams({ dateFrom, dateTo })
  return query.toString()
}

export function createSchedulingApi(client: ApiClient) {
  return {
    bootstrap: () => client.request<SchedulingBootstrap>('/api/outpatient/scheduling/bootstrap'),
    schedules: (dateFrom: string, dateTo: string) => client.request<ServiceSchedule[]>(
      `/api/outpatient/scheduling/schedules?${dates(dateFrom, dateTo)}`,
    ),
    receptionQueue: (dateOrFrom?: string, dateTo?: string) => {
      const params = new URLSearchParams()
      if (dateOrFrom && dateTo) {
        params.set('dateFrom', dateOrFrom)
        params.set('dateTo', dateTo)
      } else if (dateOrFrom) {
        params.set('date', dateOrFrom)
      }
      const queryStr = params.toString()
      return client.request<ReceptionQueueItem[]>(
        `/api/outpatient/reception/queue${queryStr ? `?${queryStr}` : ''}`,
      )
    },
    quickCreate: (input: QuickScheduleInput) => client.request<QuickScheduleResult>(
      '/api/outpatient/scheduling/quick-schedules', { method: 'POST', body: JSON.stringify(input) },
    ),
    update: (scheduleId: string, input: UpdateScheduleInput) => client.request<ServiceSchedule>(
      `/api/outpatient/scheduling/schedules/${scheduleId}`, { method: 'PUT', body: JSON.stringify(input) },
    ),
    changeStatus: (scheduleId: string, input: ChangeScheduleStatusInput) => client.request<ServiceSchedule>(
      `/api/outpatient/scheduling/schedules/${scheduleId}/actions`, { method: 'POST', body: JSON.stringify(input) },
    ),
  }
}
