import type { ApiClient } from './httpClient'

export type ScheduleDayPart = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM'
export type ProfessionalSlotMode = 'POOL' | 'TIMED'
export type ScheduleExceptionType = 'CLOSED' | 'OVERRIDE'
export type ScheduleRegistrationScope = 'DEPARTMENT' | 'PRACTITIONER'

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
  sdRegistrationScope: ScheduleRegistrationScope
  sdRegistrationScopeText: string
  practitionerId?: string
  practitionerName?: string
  departmentId?: string
  departmentName?: string
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
  registrationFee?: number
  feeCurrencyCode: string
  feeConfigured: boolean
  feePriceDocumentCode?: string
}

export interface QuickScheduleInput {
  registrationScope: ScheduleRegistrationScope
  practitionerId?: string
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

export interface ProfessionalScheduleExceptionInput {
  exceptionDate: string
  exceptionType: ScheduleExceptionType
  startTime?: string
  endTime?: string
  capacity?: number
  slotMinutes?: number
  reason: string
}

export interface ProfessionalScheduleInput {
  templateName: string
  registrationScope: ScheduleRegistrationScope
  practitionerId?: string
  catalogItemId: string
  dateFrom: string
  dateTo: string
  weekdays: number[]
  startTime: string
  endTime: string
  capacity: number
  slotMode: ProfessionalSlotMode
  slotMinutes?: number
  locationName?: string
  exceptions: ProfessionalScheduleExceptionInput[]
  idempotencyCode: string
}

export interface ProfessionalTemplatePeriod {
  dayOfWeek: number
  startTime: string
  endTime: string
  capacity: number
  sdSlotMode: ProfessionalSlotMode
  sdSlotModeText: string
  slotMinutes?: number
}

export interface ProfessionalScheduleException {
  id: string
  exceptionDate: string
  exceptionType: ScheduleExceptionType
  startTime?: string
  endTime?: string
  capacity?: number
  slotMinutes?: number
  reason: string
}

export interface ProfessionalTemplate {
  id: string
  templateCode: string
  templateName: string
  sdRegistrationScope: ScheduleRegistrationScope
  sdRegistrationScopeText: string
  practitionerId?: string
  practitionerName: string
  catalogItemId: string
  serviceCode: string
  serviceName: string
  validFrom: string
  validTo: string
  status: string
  periods: ProfessionalTemplatePeriod[]
  exceptions: ProfessionalScheduleException[]
}

export interface ProfessionalScheduleResult {
  generationRunId: string
  replayed: boolean
  generatedCount: number
  skippedCount: number
  template: ProfessionalTemplate
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
  ticketId?: string
  serviceQueueId?: string
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
  status: import('./queueingApi').QueueTicketStatus
  practitionerName?: string
  serviceName?: string
  registeredByName?: string
  departmentName?: string
  sdDayPartText?: string
  locationName?: string
  registeredAt: string
  readyAt?: string
  calledAt?: string
  startedAt?: string
  callCount?: number
  missedCount?: number
  currentLocationId?: string
  validUntil?: string
}

export const REGISTRATION_SOURCE_LABELS: Record<ReceptionQueueItem['registrationSource'], string> = {
  WINDOW: '窗口挂号',
  WALK_IN: '现场自助',
  DIRECT: '诊间直挂',
  EMERGENCY: '急诊通道',
  TRANSFER: '转诊挂号',
}

export interface RegistrationPageView {
  content: ReceptionQueueItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
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
    receptionQueue: (dateOrFrom?: string, dateTo?: string, scope?: 'DEPARTMENT' | 'ORGANIZATION') => {
      const params = new URLSearchParams()
      if (dateOrFrom && dateTo) {
        params.set('dateFrom', dateOrFrom)
        params.set('dateTo', dateTo)
      } else if (dateOrFrom) {
        params.set('date', dateOrFrom)
      }
      if (scope) params.set('scope', scope)
      const queryStr = params.toString()
      return client.request<ReceptionQueueItem[]>(
        `/api/outpatient/reception/queue${queryStr ? `?${queryStr}` : ''}`,
      )
    },
    receptionPage: async (params: {
      dateFrom?: string
      dateTo?: string
      status?: string
      query?: string
      page?: number
      size?: number
      scope?: 'DEPARTMENT' | 'ORGANIZATION'
    } = {}) => {
      const query = new URLSearchParams()
      if (params.dateFrom) query.set('dateFrom', params.dateFrom)
      if (params.dateTo) query.set('dateTo', params.dateTo)
      if (params.status) query.set('status', params.status)
      if (params.query) query.set('query', params.query)
      if (params.page !== undefined) query.set('page', String(params.page))
      if (params.size !== undefined) query.set('size', String(params.size))
      if (params.scope) query.set('scope', params.scope)
      const queryStr = query.toString()
      try {
        return await client.request<RegistrationPageView>(
          `/api/outpatient/reception/page${queryStr ? `?${queryStr}` : ''}`,
        )
      } catch (err: unknown) {
        // 当后端服务尚未部署或识别 /page 端点时，平滑降级调用 /queue 并适配为分页视图
        const fallbackParams = new URLSearchParams()
        if (params.dateFrom && params.dateTo) {
          fallbackParams.set('dateFrom', params.dateFrom)
          fallbackParams.set('dateTo', params.dateTo)
        } else if (params.dateFrom) {
          fallbackParams.set('date', params.dateFrom)
        }
        if (params.scope) fallbackParams.set('scope', params.scope)
        const fallbackQueryStr = fallbackParams.toString()
        const items = await client.request<ReceptionQueueItem[]>(
          `/api/outpatient/reception/queue${fallbackQueryStr ? `?${fallbackQueryStr}` : ''}`,
        )
        const page = params.page ?? 0
        const size = params.size ?? 20
        const queryNormalized = params.query?.trim().toLocaleLowerCase('zh-CN')
        const filtered = items.filter((item) => {
          if (params.status && item.status !== params.status) return false
          if (queryNormalized) {
            const matches = [
              item.residentName, item.healthRecordNo, item.registrationNo, item.ticketNo,
              item.practitionerName, item.serviceName, item.locationName,
            ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(queryNormalized))
            if (!matches) return false
          }
          return true
        })
        const totalElements = filtered.length
        const totalPages = Math.ceil(totalElements / size)
        const start = page * size
        const content = filtered.slice(start, start + size)
        return {
          content,
          page,
          size,
          totalElements,
          totalPages,
          first: page === 0,
          last: totalPages === 0 || page >= totalPages - 1,
        }
      }
    },
    quickCreate: (input: QuickScheduleInput) => client.request<QuickScheduleResult>(
      '/api/outpatient/scheduling/quick-schedules', { method: 'POST', body: JSON.stringify(input) },
    ),
    professionalTemplates: () => client.request<ProfessionalTemplate[]>(
      '/api/outpatient/scheduling/professional/templates',
    ),
    createProfessionalTemplate: (input: ProfessionalScheduleInput) => client.request<ProfessionalScheduleResult>(
      '/api/outpatient/scheduling/professional/templates', { method: 'POST', body: JSON.stringify(input) },
    ),
    update: (scheduleId: string, input: UpdateScheduleInput) => client.request<ServiceSchedule>(
      `/api/outpatient/scheduling/schedules/${scheduleId}`, { method: 'PUT', body: JSON.stringify(input) },
    ),
    changeStatus: (scheduleId: string, input: ChangeScheduleStatusInput) => client.request<ServiceSchedule>(
      `/api/outpatient/scheduling/schedules/${scheduleId}/actions`, { method: 'POST', body: JSON.stringify(input) },
    ),
  }
}
