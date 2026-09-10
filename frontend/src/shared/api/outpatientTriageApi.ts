import type { ApiClient } from './httpClient'

export type TriageLevel = 'LEVEL_1_CRITICAL' | 'LEVEL_2_URGENT' | 'LEVEL_3_ROUTINE_URGENT' | 'LEVEL_4_NON_URGENT'

export type TriageArrivalMethod = 'WALK_IN' | 'WHEELCHAIR' | 'STRETCHER' | 'AMBULANCE_120'

export type TriageCompanionType = 'NONE' | 'FAMILY' | 'ESCORT' | 'GREEN_CHANNEL_STAFF'

export type TriageConsciousness = 'ALERT' | 'VOICE' | 'PAIN' | 'UNRESPONSIVE'

export type TriageGreenChannel =
  | 'NONE'
  | 'CHEST_PAIN'
  | 'STROKE'
  | 'TRAUMA'
  | 'HIGH_RISK_MATERNAL'
  | 'CRITICAL_CHILD'
  | 'MILITARY_PRIORITY'
  | 'ELDERLY'

export type TriageDisposition =
  | 'WAITING_QUEUE'
  | 'REGISTER_GUIDE'
  | 'RESCUE_ROOM'
  | 'FEVER_CLINIC'
  | 'EMERGENCY_TRANSFER'

export interface TriageRecord {
  id: string
  tenantId: string
  organizationId: string
  residentId?: string
  encounterId?: string
  registrationId?: string
  triageNo: string
  triageTime: string
  triageNurseId?: string
  triageNurseName?: string
  patientName: string
  gender: string
  age?: number
  birthDate?: string
  phone?: string
  idCardNo?: string
  healthRecordNo?: string
  arrivalMethod: TriageArrivalMethod
  companionType: TriageCompanionType
  chiefComplaint?: string
  symptoms?: string
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  systolic?: number
  diastolic?: number
  oxygenSaturation?: number
  bloodGlucose?: number
  painScore?: number
  consciousness: TriageConsciousness
  fever: boolean
  epidemicHistory?: string
  riskTags?: string
  triageLevel: TriageLevel
  triageReason?: string
  targetDepartmentId?: string
  targetDepartmentName?: string
  targetDoctorId?: string
  targetDoctorName?: string
  greenChannel: TriageGreenChannel
  disposition: TriageDisposition
  status: 'RECORDED' | 'REGISTERED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED'
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface CreateTriageInput {
  organizationId?: string
  residentId?: string
  encounterId?: string
  registrationId?: string
  patientName: string
  gender: string
  age?: number
  birthDate?: string
  phone?: string
  idCardNo?: string
  healthRecordNo?: string
  arrivalMethod?: TriageArrivalMethod
  companionType?: TriageCompanionType
  chiefComplaint?: string
  symptoms?: string
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  systolic?: number
  diastolic?: number
  oxygenSaturation?: number
  bloodGlucose?: number
  painScore?: number
  consciousness?: TriageConsciousness
  fever?: boolean
  epidemicHistory?: string
  riskTags?: string
  triageLevel: TriageLevel
  triageReason?: string
  targetDepartmentId?: string
  targetDepartmentName?: string
  targetDoctorId?: string
  targetDoctorName?: string
  greenChannel?: TriageGreenChannel
  disposition?: TriageDisposition
  notes?: string
  nurseId?: string
  nurseName?: string
}

export interface UpdateTriageInput extends Partial<CreateTriageInput> {
  status?: TriageRecord['status']
}

export interface TriageStatistics {
  totalCount: number
  level1CriticalCount: number
  level2UrgentCount: number
  level3RoutineUrgentCount: number
  level4NonUrgentCount: number
  feverCount: number
  greenChannelCount: number
}

export interface DepartmentRecommendation {
  departmentId: string
  departmentName: string
  score: number
  rationale: string
  availableScheduleCount: number
  alertNotice?: string | null
}

export interface PendingEncounter {
  encounterId: string
  registrationId: string
  residentId: string
  healthRecordNo: string
  residentName: string
  gender: string
  birthDate?: string
  age?: number
  phone?: string
  registrationNo: string
  ticketNo: string
  sequenceNo: number
  departmentId?: string
  departmentName: string
  practitionerName?: string
  registeredAt: string
  triaged: boolean
  triageLevel?: TriageLevel
  triageId?: string
  triageNo?: string
}

export interface TriageSearchFilter {
  date?: string
  triageLevel?: string
  status?: string
  query?: string
  page?: number
  size?: number
}

export interface OutpatientTriageApi {
  create: (input: CreateTriageInput) => Promise<TriageRecord>
  update: (id: string, input: UpdateTriageInput) => Promise<TriageRecord>
  get: (id: string) => Promise<TriageRecord>
  getByEncounter: (encounterId: string) => Promise<TriageRecord | null>
  search: (filter?: TriageSearchFilter) => Promise<{ content: TriageRecord[]; totalElements: number; totalPages: number }>
  statistics: (date?: string) => Promise<TriageStatistics>
  pendingEncounters: (date?: string) => Promise<PendingEncounter[]>
  recommendDepartments: (params: {
    chiefComplaint?: string
    symptoms?: string
    temperature?: number
    systolic?: number
    diastolic?: number
    oxygenSaturation?: number
    pulseRate?: number
    age?: number
    gender?: string
  }) => Promise<DepartmentRecommendation[]>
  bindEncounter: (id: string, encounterId: string, registrationId?: string) => Promise<TriageRecord>
}

export function createOutpatientTriageApi(client: ApiClient): OutpatientTriageApi {
  return {
    create: (input) => client.request<TriageRecord>('/api/outpatient/triage', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    update: (id, input) => client.request<TriageRecord>(`/api/outpatient/triage/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
    get: (id) => client.request<TriageRecord>(`/api/outpatient/triage/${id}`),
    getByEncounter: (encounterId) => client.request<TriageRecord | null>(`/api/outpatient/triage/by-encounter/${encounterId}`),
    search: (filter) => {
      const params = new URLSearchParams()
      if (filter?.date) params.set('date', filter.date)
      if (filter?.triageLevel && filter.triageLevel !== 'ALL') params.set('triageLevel', filter.triageLevel)
      if (filter?.status && filter.status !== 'ALL') params.set('status', filter.status)
      if (filter?.query) params.set('query', filter.query)
      if (filter?.page != null) params.set('page', String(filter.page))
      if (filter?.size != null) params.set('size', String(filter.size))
      const queryStr = params.toString()
      return client.request<{ content: TriageRecord[]; totalElements: number; totalPages: number }>(
        `/api/outpatient/triage${queryStr ? `?${queryStr}` : ''}`
      )
    },
    statistics: (date) => client.request<TriageStatistics>(
      `/api/outpatient/triage/statistics${date ? `?date=${date}` : ''}`
    ),
    pendingEncounters: (date) => client.request<PendingEncounter[]>(
      `/api/outpatient/triage/pending-encounters${date ? `?date=${date}` : ''}`
    ),
    recommendDepartments: (params) => {
      const sp = new URLSearchParams()
      if (params.chiefComplaint) sp.set('chiefComplaint', params.chiefComplaint)
      if (params.symptoms) sp.set('symptoms', params.symptoms)
      if (params.temperature != null) sp.set('temperature', String(params.temperature))
      if (params.systolic != null) sp.set('systolic', String(params.systolic))
      if (params.diastolic != null) sp.set('diastolic', String(params.diastolic))
      if (params.oxygenSaturation != null) sp.set('oxygenSaturation', String(params.oxygenSaturation))
      if (params.pulseRate != null) sp.set('pulseRate', String(params.pulseRate))
      if (params.age != null) sp.set('age', String(params.age))
      if (params.gender) sp.set('gender', params.gender)
      const q = sp.toString()
      return client.request<DepartmentRecommendation[]>(
        `/api/outpatient/triage/recommend-departments${q ? `?${q}` : ''}`
      )
    },
    bindEncounter: (id, encounterId, registrationId) => {
      const sp = new URLSearchParams({ encounterId })
      if (registrationId) sp.set('registrationId', registrationId)
      return client.request<TriageRecord>(
        `/api/outpatient/triage/${id}/bind-encounter?${sp.toString()}`,
        { method: 'POST' }
      )
    },
  }
}
