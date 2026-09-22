import type { Encounter } from '../model'
import type { components } from './generated'
import type { ApiClient } from './httpClient'
import type { MedicationKnowledge } from './masterDataApi'

export interface OrderableMedicationKnowledge extends MedicationKnowledge {
  stockSiteId: string
  stockSiteName: string
  stockItemId: string
  availableBaseQuantity: number
  availablePackageQuantity: number
  baseUnitCode: string
  packageUnitName?: string
  packageFactor?: number
}
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

export interface OrderDocumentInfo {
  diagnoses: Array<{ code: string; display: string; primary: boolean }>
  externalPrescription: boolean
  specialDisease?: string | null
  examinationPurpose?: string | null
}

export interface ServiceRequest {
  documentInfoEditable?: boolean
  documentInfo?: OrderDocumentInfo
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
  manufacturerName?: string
  doseForm?: string
  preparationSpec?: string
  preparationUnit?: string
  skinTestRequired: boolean
  skinTestExempt?: boolean
  skinTestExemptReason?: string
  exemptEvidenceEventId?: string
  antimicrobial: boolean
  antimicrobialLevel?: string
  doseValue?: number
  doseUnit?: string
  routeId?: string
  routeCode?: string
  routeName?: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
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
  skinTestExempt?: boolean
  skinTestExemptReason?: string
  exemptEvidenceEventId?: string
  medicationInstruction?: string
  allergyReviewConfirmed?: boolean
  allergyOverrideReason?: string
  priceType?: string
  pricingRequired?: boolean
  businessDate?: string
  reason?: string
}

export type MedicationSafetyStatus = 'PASS' | 'WARN' | 'REQUIRE_OVERRIDE' | 'BLOCK' | 'UNAVAILABLE'
export type MedicationSafetySeverity = 'INFO' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export interface MedicationSafetyFinding {
  findingId: string
  ruleCode: string
  ruleVersion: number
  category: string
  severity: MedicationSafetySeverity
  decision: MedicationSafetyStatus
  message: string
  medicationRequestIds: string[]
  evidence: Array<{
    sourceType: string
    sourceTitle: string
    sourceVersion: string
    sourceLocator: string
    section: string
    excerpt: string
    usageScope: string
  }>
  overridePolicy: 'NOT_ALLOWED' | 'ACKNOWLEDGE' | 'REASON_REQUIRED'
  suggestedAction?: string
}

export interface MedicationSafetyDecision {
  evaluationId?: string | null
  prescriptionId: string
  prescriptionRevision: number
  inputHash: string
  ruleSetVersion: string
  engineVersion: string
  mode: string
  decision: MedicationSafetyStatus
  findings: MedicationSafetyFinding[]
  ruleExecutions: Array<{
    ruleCode: string
    ruleVersion: number
    outcome: string
    failureCode?: string | null
  }>
  failureCodes: string[]
}

export interface Prescription {
  documentInfo?: OrderDocumentInfo
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
  safetyEvaluation?: MedicationSafetyDecision | null
}

export function createEncountersApi(client: ApiClient) {
  return {
    updatePrescriptionDocumentInfo: (encounterId: string, id: string, expectedRevision: number, documentInfo: OrderDocumentInfo) =>
      client.request<Prescription>(`/api/encounters/${encounterId}/prescriptions/${id}/document-info`, {
        method: 'PUT', body: JSON.stringify({ expectedRevision, documentInfo }),
      }),
    updateServiceDocumentInfo: (encounterId: string, id: string, expectedRevision: number, documentInfo: OrderDocumentInfo) =>
      client.request<ServiceRequest>(`/api/encounters/${encounterId}/service-requests/${id}/document-info`, {
        method: 'PUT', body: JSON.stringify({ expectedRevision, documentInfo }),
      }),
    directVisitSettings: () => client.request<{ enabled: boolean; catalogItemId?: string | null }>(
      '/api/encounters/direct-visit/settings'),
    directVisit: (input: { residentId: string; encounterId?: string; commandCode: string;
      factorResults: Record<string, boolean>; terminalCode?: string }) => client.request<{
        outcome: 'CREATED' | 'REUSED' | 'SELECT_REGISTRATION'; encounter: Encounter | null; candidates: Encounter[];
      }>('/api/encounters/direct-visit', { method: 'POST', body: JSON.stringify(input) }),
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
    submitPrescription: (encounterId: string, prescriptionId: string, expectedRevision: number, reason?: string) =>
      client.request<Prescription>(`/api/encounters/${encounterId}/prescriptions/${prescriptionId}/submit`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
      }),
    evaluatePrescriptionSafety: (encounterId: string, prescriptionId: string) =>
      client.request<MedicationSafetyDecision>(
        `/api/encounters/${encounterId}/prescriptions/${prescriptionId}/safety-evaluations`,
        { method: 'POST' },
      ),
    cancelPrescription: (encounterId: string, prescriptionId: string, expectedRevision: number, reason: string) =>
      client.request<Prescription>(`/api/encounters/${encounterId}/prescriptions/${prescriptionId}/cancel`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
      }),
    autoSplitPreview: (encounterId: string, items: BatchOrderMedicationItem[]) => client.request<SplitPrescriptionPlan[]>(
      `/api/encounters/${encounterId}/prescriptions/auto-split-preview`, {
        method: 'POST', body: JSON.stringify(items),
      },
    ),
    batchOrderPrescriptions: (encounterId: string, input: BatchOrderPrescriptionInput) => client.request<Prescription[]>(
      `/api/encounters/${encounterId}/prescriptions/batch-order`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    orderableMedications: (encounterId: string, query?: string) => client.request<OrderableMedicationKnowledge[]>(
      `/api/encounters/${encounterId}/orderable-medications${query ? `?query=${encodeURIComponent(query)}` : ''}`,
    ),
    page: async (params: {
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
      return client.request<EncounterPageView>(
        `/api/encounters/page${queryStr ? `?${queryStr}` : ''}`,
      )
    },
  }
}

export interface EncounterQueryItem {
  id: string
  encounterNo: string
  residentId: string
  healthRecordNo?: string | null
  residentName?: string | null
  gender?: string | null
  birthDate?: string | null
  phone?: string | null
  organizationId: string
  departmentId: string
  departmentName?: string | null
  registrationId?: string | null
  registrationNo?: string | null
  registrationSource?: string | null
  visitType?: string | null
  clinicianId?: string | null
  clinicianName?: string | null
  status: string
  chiefComplaint?: string | null
  systolic?: number | null
  diastolic?: number | null
  primaryDiagnosisName?: string | null
  primaryDiagnosisCode?: string | null
  diagnosisCount: number
  serviceName?: string | null
  locationName?: string | null
  registeredAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export interface EncounterPageView {
  content: EncounterQueryItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface BatchOrderMedicationItem {
  medicationId?: string
  catalogItemId?: string
  packageId?: string
  doseValue?: number
  doseUnit?: string
  routeCode?: string
  frequencyCode?: string
  durationValue?: number
  durationUnit?: string
  quantity: number
  quantityUnit?: string
  substitutionAllowed?: boolean
  selfProvided?: boolean
  medicationInstruction?: string
  allergyReviewConfirmed?: boolean
  allergyOverrideReason?: string
  priceType?: string
  pricingRequired?: boolean
  stockSiteId?: string
  stockSiteName?: string
  administrationGroupKey?: string
  routeExecutionType?: string
  categoryCode?: string
  skinTestExempt?: boolean
  skinTestExemptReason?: string
  exemptEvidenceEventId?: string
  reason?: string
}

export interface BatchOrderPrescriptionInput {
  items: BatchOrderMedicationItem[]
  autoSubmit?: boolean
}

export interface SplitPrescriptionPlan {
  categoryCode: string
  title: string
  stockSiteId: string | number
  stockSiteName: string
  routeGroupType: string
  ruleReasons: string[]
  items: Array<{
    item: BatchOrderMedicationItem
    groupLeader: boolean
    groupKey?: string
  }>
}
