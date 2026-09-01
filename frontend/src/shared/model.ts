import type { Department as OrganizationDepartment, OrganizationUnit } from './api/organizationApi'
import type { components } from './api/generated'
import type { WorkContextOption } from './api/portalApi'

type Contract = components['schemas']
type RequiredFields<T, K extends keyof T> = Required<Pick<T, K>>

export interface Session extends RequiredFields<Contract['SessionResponse'], 'username' | 'tenantId' | 'authorities'> {
  userId?: string | null
  username: string
  tenantId: string
  authorities: string[]
  workContexts: WorkContextOption[]
  activeWorkContext?: { organizationId: string; departmentId?: string | null } | null
  refreshLoginEnabled: boolean
}

export type Organization = OrganizationUnit
export type Department = OrganizationDepartment

export interface ResidentIdentifier extends RequiredFields<Contract['IdentifierView'], 'id' | 'system' | 'maskedValue' | 'useType' | 'status'> {
  id: string
  system: string
  maskedValue: string
  useType: 'OFFICIAL' | 'SECONDARY' | 'TEMP'
  status: string
}

export interface Resident extends RequiredFields<Contract['ResidentResponse'], 'id' | 'healthRecordNo' | 'fullName' | 'gender' | 'birthDate' | 'createdAt' | 'status' | 'identifiers'> {
  id: string
  healthRecordNo: string
  fullName: string
  maskedNationalId?: string | null
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  birthDate: string
  phone?: string
  deceased: boolean
  deceasedAt?: string | null
  createdAt: string
  status: 'ACTIVE' | 'MERGED' | 'INACTIVE'
  mergedIntoId?: string | null
  version: number
  identifiers: ResidentIdentifier[]
}

export interface Diagnosis extends RequiredFields<Contract['DiagnosisResponse'], 'code' | 'display' | 'type'> {
  conceptId?: string
  systemCode?: string
  systemVersion?: string
  diagnosisDomain?: 'WESTERN_MEDICINE' | 'TCM_DISEASE' | 'TCM_SYNDROME'
  diagnosisGroupId?: string
  code: string
  display: string
  type: 'PRIMARY' | 'SECONDARY'
  managementPrograms?: Array<{
    id: string
    code: string
    name: string
    managementType: 'CHRONIC_CARE' | 'DISEASE_REPORT' | 'SPECIAL_REGISTRY'
    triggerAction: 'PROMPT_CONFIRMATION' | 'CREATE_FOLLOW_UP_TASK' | 'CREATE_REPORT_DRAFT'
    reportCardType?: string
    reportDeadlineHours?: number
  }>
}

export interface Encounter extends Omit<RequiredFields<Contract['EncounterResponse'], 'id' | 'residentId' | 'encounterNo' | 'organizationId' | 'departmentId' | 'status' | 'diagnoses' | 'registeredAt'>, 'status'> {
  id: string
  residentId: string
  encounterNo: string
  organizationId: string
  departmentId: string
  registrationId?: string
  scheduleId?: string
  appointmentId?: string
  registrationSource?: 'WINDOW' | 'WALK_IN' | 'DIRECT' | 'EMERGENCY' | 'TRANSFER'
  visitType?: 'GENERAL' | 'FOLLOW_UP' | 'EMERGENCY' | 'TRANSFER'
  clinicianId?: string
  status: 'REGISTERED' | 'IN_PROGRESS' | 'SUSPENDED' | 'COMPLETED' | 'TRANSFERRED' | 'TERMINATED' | 'CANCELLED'
  chiefComplaint?: string
  systolic?: number
  diastolic?: number
  diagnoses: Diagnosis[]
  registeredAt: string
  startedAt?: string
  completedAt?: string
  terminationCode?: string
  terminationReason?: string
  terminatedAt?: string
  terminatedBy?: string
}

export interface TimelineEvent extends RequiredFields<Contract['TimelineEventResponse'], 'id' | 'eventType' | 'summary' | 'details' | 'occurredAt' | 'recordedBy'> {
  id: string
  encounterId?: string
  eventType: string
  summary: string
  details: Record<string, unknown>
  occurredAt: string
  recordedBy: string
}

export interface ApiError {
  code: string
  message: string
  correlationId?: string
  violations?: { field: string; message: string }[]
}
