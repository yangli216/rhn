import type { Encounter } from '../model'
import type { components } from './generated'
import type { ApiClient } from './httpClient'

type DiagnosisInputContract = components['schemas']['DiagnosisInput']
type ClinicalRecordContract = components['schemas']['RecordClinicalDataRequest']

export type DiagnosisInput = DiagnosisInputContract & {
  conceptId?: string
  diagnosisDomain?: 'WESTERN_MEDICINE' | 'TCM_DISEASE' | 'TCM_SYNDROME'
  type: 'PRIMARY' | 'SECONDARY'
  diagnosisGroupId?: string
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

export type ClinicalRecordInput = Omit<ClinicalRecordContract, 'diagnoses'> & {
  commandCode: string
  presentIllness?: string
  medicalHistory?: string
  physicalExam?: string
  treatmentPlan?: string
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  heightCm?: number
  weightKg?: number
  oxygenSaturation?: number
  noteFormVersionId?: string
  structuredData?: Record<string, unknown>
  diagnoses: DiagnosisInput[]
}

export interface RegisterEncounterInput {
  residentId: string
  organizationId: string
  departmentId: string
  scheduleId?: string
  slotHoldId?: string
  idempotencyCode: string
  registrationSource?: 'WINDOW' | 'WALK_IN' | 'DIRECT' | 'EMERGENCY'
  visitType?: 'GENERAL' | 'FOLLOW_UP' | 'EMERGENCY'
}

export interface StartEncounterInput {
  commandCode: string
  factorResults: Record<string, boolean>
  terminalCode?: string
}

export interface CompleteEncounterInput {
  commandCode: string
  dispositionCode: 'HOME' | 'FOLLOW_UP' | 'OBSERVATION' | 'REFERRAL' | 'ADMISSION'
  dispositionNote?: string
}

export interface SuspendEncounterInput {
  commandCode?: string
  reason: string
}

export interface ResumeEncounterInput {
  commandCode?: string
  terminalCode?: string
}

export interface CancelEncounterInput {
  commandCode: string
  reason: string
  terminalCode?: string
}

export interface CancelEncounterResult {
  encounterId: string
  encounterStatus: 'REGISTERED' | 'CANCELLED'
  registrationStatus: 'REGISTERED' | 'CANCELLED'
  queueStatus: 'WAITING' | 'CANCELLED'
  appointmentStatus?: 'REGISTERED' | 'CANCELLED'
  billingStatus: string
  refundOrderId?: string
  refundStatus?: string
  completed: boolean
  message: string
}

export interface ServiceRequest {
  id: string
  revision: number
  residentId: string
  encounterId: string
  requestNo: string
  status: 'ACTIVE' | 'CANCELLED'
  catalogItemId: string
  businessDate: string
  itemCode: string
  itemName: string
  unitCode: string
  localCode?: string
  localName?: string
  adoptionId: string
  adoptionRevision: number
  priceId?: string
  priceRevision?: string
  priceType?: string
  quantity: number
  unitPrice?: number
  totalAmount?: number
  currencyCode?: string
  itemAttributeSnapshot: Record<string, unknown>
  itemAttributeHash: string
  itemAttributeResolvedAt: string
  standardMappings: unknown[]
  serviceType: 'LABORATORY' | 'EXAMINATION' | 'TREATMENT' | 'OTHER'
  specimenType?: string
  examinationType?: string
  clinicalDescription?: string
  authoredAt: string
  cancelReason?: string
}

export interface CreateServiceRequestInput {
  catalogItemId: string
  quantity: number
  unitCode?: string
  priceType?: string
  pricingRequired?: boolean
  businessDate?: string
  reason?: string
  clinicalDescription?: string
}

export interface MedicationRequest {
  id: string
  revision: number
  residentId: string
  encounterId: string
  requestNo: string
  status: 'DRAFT' | 'ACTIVE' | 'CANCELLED'
  prescriptionId?: string
  parentRequestId?: string
  catalogItemId?: string
  medicationId: string
  packageId?: string
  itemCode: string
  itemName: string
  localCode?: string
  localName?: string
  medicationCode: string
  medicationName: string
  medicationType: string
  doseForm?: string
  preparationSpec?: string
  preparationUnit?: string
  skinTestRequired: boolean
  antimicrobial: boolean
  antimicrobialLevel?: string
  doseValue?: number
  doseUnit?: string
  routeCode?: string
  frequencyCode?: string
  frequencyId?: string
  frequencyName?: string
  frequencyRule?: Record<string, unknown>
  medicationInstruction?: string
  durationValue?: number
  durationUnit?: string
  quantity: number
  quantityUnit: string
  baseQuantity: number
  baseUnit: string
  packageFactor: number
  packageUnitName?: string
  packageSpec?: string
  substitutionAllowed: boolean
  selfProvided: boolean
  unitPrice?: number
  priceQuantity?: number
  totalAmount?: number
  currencyCode?: string
  itemAttributeSnapshot: Record<string, unknown>
  itemAttributeHash: string
  medicationSnapshot: Record<string, unknown>
  standardMappings: unknown[]
  authoredAt: string
  cancelReason?: string
}

export interface CreateMedicationRequestInput {
  prescriptionId?: string
  medicationId?: string
  catalogItemId?: string
  packageId?: string
  doseValue?: number
  doseUnit?: string
  routeCode?: string
  frequencyCode?: string
  parentRequestId?: string
  durationValue?: number
  durationUnit?: string
  quantity: number
  quantityUnit?: string
  substitutionAllowed: boolean
  selfProvided: boolean
  medicationInstruction?: string
  allergyReviewConfirmed?: boolean
  allergyOverrideReason?: string
  priceType?: string
  pricingRequired?: boolean
  businessDate?: string
  reason?: string
}

export interface Prescription {
  id: string
  revision: number
  residentId: string
  encounterId: string
  prescriptionNo: string
  categoryCode: string
  status: 'DRAFT' | 'ACTIVE' | 'CANCELLED'
  performerOrganizationId: string
  performerDepartmentId: string
  authoredAt: string
  submittedAt?: string
  cancelledAt?: string
  cancelReason?: string
  note?: string
  medicationRequests: MedicationRequest[]
}

export function createEncountersApi(client: ApiClient) {
  return {
    byResident: (residentId: string) => client.request<Encounter[]>(
      `/api/encounters?residentId=${encodeURIComponent(residentId)}`,
    ),
    register: (input: RegisterEncounterInput) =>
      client.request<Encounter>('/api/encounters', {
        method: 'POST', body: JSON.stringify(input),
      }),
    start: (encounterId: string, input: StartEncounterInput) => client.request<Encounter>(
      `/api/encounters/${encounterId}/start`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    suspend: (encounterId: string, input: SuspendEncounterInput) => client.request<Encounter>(
      `/api/encounters/${encounterId}/suspend`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    resume: (encounterId: string, input: ResumeEncounterInput) => client.request<Encounter>(
      `/api/encounters/${encounterId}/resume`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    cancel: (encounterId: string, input: CancelEncounterInput) => client.request<CancelEncounterResult>(
      `/api/encounters/${encounterId}/cancel`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    recordClinicalData: (encounterId: string, input: ClinicalRecordInput) =>
      client.request<Encounter>(`/api/encounters/${encounterId}/clinical-record`, {
        method: 'PUT', body: JSON.stringify(input),
      }),
    complete: (encounterId: string, input?: CompleteEncounterInput) => client.request<Encounter>(
      `/api/encounters/${encounterId}/complete`, {
        method: 'POST', ...(input ? { body: JSON.stringify(input) } : {}),
      },
    ),
    serviceRequests: (encounterId: string) => client.request<ServiceRequest[]>(
      `/api/encounters/${encounterId}/service-requests`,
    ),
    createServiceRequest: (encounterId: string, input: CreateServiceRequestInput) =>
      client.request<ServiceRequest>(`/api/encounters/${encounterId}/service-requests`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    cancelServiceRequest: (encounterId: string, requestId: string, expectedRevision: number, reason: string) =>
      client.request<ServiceRequest>(`/api/encounters/${encounterId}/service-requests/${requestId}/cancel`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
      }),
    medicationRequests: (encounterId: string) => client.request<MedicationRequest[]>(
      `/api/encounters/${encounterId}/medication-requests`,
    ),
    createMedicationRequest: (encounterId: string, input: CreateMedicationRequestInput) =>
      client.request<MedicationRequest>(`/api/encounters/${encounterId}/medication-requests`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    cancelMedicationRequest: (encounterId: string, requestId: string, expectedRevision: number, reason: string) =>
      client.request<MedicationRequest>(`/api/encounters/${encounterId}/medication-requests/${requestId}/cancel`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
      }),
    prescriptions: (encounterId: string) => client.request<Prescription[]>(
      `/api/encounters/${encounterId}/prescriptions`,
    ),
    createPrescription: (encounterId: string, categoryCode = 'OUTPATIENT', note?: string) => client.request<Prescription>(
      `/api/encounters/${encounterId}/prescriptions`, {
        method: 'POST', body: JSON.stringify({ categoryCode, note }),
      },
    ),
    submitPrescription: (encounterId: string, prescriptionId: string, expectedRevision: number) =>
      client.request<Prescription>(`/api/encounters/${encounterId}/prescriptions/${prescriptionId}/submit`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
    cancelPrescription: (encounterId: string, prescriptionId: string, expectedRevision: number, reason: string) =>
      client.request<Prescription>(`/api/encounters/${encounterId}/prescriptions/${prescriptionId}/cancel`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
      }),
  }
}
