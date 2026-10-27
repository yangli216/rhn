import type { RecordAnnotation } from './recordAnnotations'
import type { Encounter } from '../model'
import type { components } from './generated'
import type { ApiClient } from './httpClient'
import type { MedicationKnowledge, ServiceCatalogItem } from './masterDataApi'

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

/** 本次就诊的血压测量要求，由服务端按机构参数和患者年龄判定。 */
export interface BloodPressureRequirement {
  required: boolean
  enforceAt: 'DRAFT' | 'COMPLETION'
  minAge: number
  message?: string | null
}

export type DiagnosisInput = DiagnosisInputContract & {
  conceptId?: string
  codeSystem?: string
  diagnosisDomain?: 'WESTERN_MEDICINE' | 'TCM_DISEASE' | 'TCM_SYNDROME' | null
  type: 'PRIMARY' | 'SECONDARY'
  diagnosisGroupId?: string
  managementResolutionStatus?: 'CONFIRMED' | 'UNCONFIRMED'
  managementPrograms?: Array<{
    id: string
    code: string
    name: string
    managementType: 'CHRONIC_CARE' | 'DISEASE_REPORT' | 'SPECIAL_REGISTRY'
    triggerAction: 'PROMPT_CONFIRMATION' | 'CREATE_FOLLOW_UP_TASK' | 'CREATE_REPORT_DRAFT'
    reportCardType?: string
    reportDeadlineHours?: number
  }> | null
}

export type ClinicalRecordInput = Omit<ClinicalRecordContract, 'diagnoses' | 'annotations'> & {
  annotations?: RecordAnnotation[]
  commandCode: string
  presentIllness?: string
  medicalHistory?: string
  physicalExam?: string
  treatmentPlan?: string
  allergyHistory?: string
  medicationHistory?: string
  auxiliaryExaminations?: string
  healthEducation?: string
  followUp?: string
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

export interface CancelEncounterCompletionInput {
  commandCode?: string
  terminalCode?: string
  reason: string
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
  performerOrganizationId?: string
  performerDepartmentId?: string
  documentInfoEditable?: boolean
  /** Set by the server when fulfillment has started and the request can no longer be cancelled. */
  cancelBlockedReason?: string | null
  /** 不能修改或取消签署的原因（已撤销、已执行或已进结算单）；为空时可在原申请上修改。 */
  editBlockedReason?: string | null
  documentInfo?: OrderDocumentInfo
  /** 所属申请单；为空表示历史或单条开立的一项一单。 */
  documentId?: string | null
  documentNo?: string | null
  /** 检查申请开立时所选部位，按选择顺序；未选部位为空数组。 */
  bodySites?: ServiceRequestBodySite[]
  id: string
  revision: number
  residentId: string
  encounterId: string
  requestNo: string
  /** DRAFT 只属于开立医生；一次开立命令转为 ACTIVE 后才记账、下发执行科室。 */
  status: 'DRAFT' | 'ACTIVE' | 'CANCELLED'
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

export interface ServiceRequestBodySite {
  code: string
  name: string
  methodType?: string | null
  mutualRecognitionCode?: string | null
}

/** 有界的项目＋单部位检索候选；service 保留原目录事实，site 仅供预填。 */
export interface ExaminationOrderCandidate {
  catalogItemId: string
  site: { variantId: string; code: string; name: string }
}

export interface ExaminationOrderSearchResult {
  services: ServiceCatalogItem[]
  candidates: ExaminationOrderCandidate[]
}

/** 检查项目可选部位与数量换算规则；configured=false 表示项目未维护检查部位配置。 */
export interface ExaminationSiteOptions {
  catalogItemId: string
  configured: boolean
  bodySiteRequired: boolean
  multiBodySite: boolean
  maxBodySiteCount?: number | null
  sitePricingMode?: string | null
  maxChargeableSiteCount?: number | null
  sites: { code: string; name: string; methodType?: string | null; chargeableSiteUnits?: number }[]
}

export interface CreateServiceRequestInput {
  catalogItemId: string
  /** 检查部位编码，按选择顺序；按部位计价的数量以服务端换算为准。 */
  bodySiteCodes?: string[]
  quantity: number
  unitCode?: string
  priceType?: string
  pricingRequired?: boolean
  businessDate?: string
  reason?: string
  clinicalDescription?: string
  performerOrganizationId?: string
  performerDepartmentId?: string
}

export interface MedicationRequest {
  /** Set by the server when the drug has been dispensed or executed and the request can no longer be cancelled. */
  cancelBlockedReason?: string | null
  /** 不能修改或取消签署的原因（已撤销、药房已接收或已进结算单）；为空时可在原医嘱上修改。 */
  editBlockedReason?: string | null
  stockSiteId?: string | null
  stockSiteName?: string | null
  stockSiteSource?: 'RESERVATION' | 'ROUTING' | null
  id: string
  revision: number
  residentId: string
  encounterId: string
  requestNo: string | null
  prescriptionNo?: string | null
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
  priceType?: string
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
  decisionText?: string
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
  overridePolicyText?: string
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
  decisionText?: string
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
    /** 一张申请单内的多个项目共用单据信息，一次请求批量写入，每项各自校验版本。 */
    updateServiceDocumentInfoBatch: (encounterId: string,
      members: Array<{ id: string; expectedRevision: number }>, documentInfo: OrderDocumentInfo) =>
      client.request<ServiceRequest[]>(`/api/encounters/${encounterId}/service-requests/document-info`, {
        method: 'PUT', body: JSON.stringify({ members, documentInfo }),
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
    get: (encounterId: string) => client.request<Encounter>(`/api/encounters/${encodeURIComponent(encounterId)}`),
    bloodPressureRequirement: (encounterId: string) => client.request<BloodPressureRequirement>(
      `/api/encounters/${encodeURIComponent(encounterId)}/blood-pressure-requirement`),
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
    cancelCompletion: (encounterId: string, input: CancelEncounterCompletionInput) => client.request<Encounter>(
      `/api/encounters/${encounterId}/cancel-completion`, {
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
    /** 取消签署：整张处方退回未签署，未进结算单的记账作废。 */
    withdrawPrescriptionSignature: (encounterId: string, prescriptionId: string, expectedRevision: number) =>
      client.request<Prescription>(`/api/encounters/${encounterId}/prescriptions/${prescriptionId}/withdraw-signature`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
    withdrawServiceSignature: (encounterId: string, requestId: string, expectedRevision: number) =>
      client.request<ServiceRequest>(`/api/encounters/${encounterId}/service-requests/${requestId}/withdraw-signature`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
    cancelPrescription: (encounterId: string, prescriptionId: string, expectedRevision: number, reason: string) =>
      client.request<Prescription>(`/api/encounters/${encounterId}/prescriptions/${prescriptionId}/cancel`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
      }),
    autoSplitPreview: (encounterId: string, items: BatchOrderMedicationItem[]) => client.request<SplitPrescriptionPlan[]>(
      `/api/encounters/${encounterId}/prescriptions/auto-split-preview`, {
        method: 'POST', body: JSON.stringify(items),
      },
    ),
    saveOrderDrafts: (encounterId: string, input: OrderDraftSaveInput) => client.request<OrderDraftSaveReceipt>(
      `/api/encounters/${encounterId}/order-drafts`, { method: 'POST', body: JSON.stringify(input) },
    ),
    submitOrders: (encounterId: string, input: OrderSubmissionInput) => client.request<OrderSubmissionResult>(
      `/api/encounters/${encounterId}/order-submissions`, { method: 'POST', body: JSON.stringify(input) },
    ),
    searchExaminationOrders: (encounterId: string, query: string) => client.request<ExaminationOrderSearchResult>(
      `/api/encounters/${encodeURIComponent(encounterId)}/service-requests/examination-search?query=${encodeURIComponent(query)}`,
    ),
    examinationSiteOptions: (encounterId: string, catalogItemId: string) => client.request<ExaminationSiteOptions>(
      `/api/encounters/${encodeURIComponent(encounterId)}/service-requests/examination-sites?catalogItemId=${encodeURIComponent(catalogItemId)}`),
    previewServiceDocuments: (encounterId: string, items: CreateServiceRequestInput[]) => client.request<ServiceDocumentPlan[]>(
      `/api/encounters/${encounterId}/service-requests/document-preview`, { method: 'POST', body: JSON.stringify(items) },
    ),
    orderingPolicy: (encounterId: string) => client.request<OrderingPolicy>(
      `/api/encounters/${encodeURIComponent(encounterId)}/ordering-policy`),
    batchOrderPrescriptions: (encounterId: string, input: BatchOrderPrescriptionInput) => client.request<Prescription[]>(
      `/api/encounters/${encounterId}/prescriptions/batch-order`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    orderableMedications: (encounterId: string, query?: string) => client.request<OrderableMedicationKnowledge[]>(
      `/api/encounters/${encounterId}/orderable-medications${query ? `?query=${encodeURIComponent(query)}` : ''}`,
    ),
    orderableMedicationsBatch: (encounterId: string, queries: string[]) => {
      const params = new URLSearchParams()
      for (const value of queries) params.append('queries', value)
      return client.request<Record<string, OrderableMedicationKnowledge[]>>(
        `/api/encounters/${encounterId}/orderable-medications/batch?${params.toString()}`,
      )
    },
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
  genderText?: string | null
  birthDate?: string | null
  phone?: string | null
  organizationId: string
  departmentId: string
  departmentName?: string | null
  registrationId?: string | null
  registrationNo?: string | null
  registrationSource?: string | null
  registrationSourceText?: string
  visitType?: string | null
  visitTypeText?: string
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
  stockSiteId?: string | null
  stockSiteName?: string | null
  administrationGroupKey?: string
  routeExecutionType?: string
  categoryCode?: string
  skinTestExempt?: boolean
  skinTestExemptReason?: string
  exemptEvidenceEventId?: string
  reason?: string
}

/** 原地修改的医嘱：已签署且未进结算单的先退回未签署再改；药品、项目本身不能更换。 */
export interface RevisedOrder {
  kind: 'MEDICATION' | 'SERVICE'
  id: string
  expectedRevision: number
  medication?: BatchOrderMedicationItem
  service?: CreateServiceRequestInput
}

export interface OrderDraftSaveInput {
  commandCode: string
  medicationItems: BatchOrderMedicationItem[]
  serviceItems: CreateServiceRequestInput[]
  revisedOrders?: RevisedOrder[]
}

/** 一次开立命令：prescriptions 须与当前全部处方草稿一致；documentInfo 为空时由服务端默认关联主诊断。 */
export interface OrderSubmissionInput {
  prescriptions: Array<{ id: string; expectedRevision: number; documentInfo?: OrderDocumentInfo; safetyReason?: string }>
  serviceDocuments: Array<{ id: string; expectedRevision: number; documentInfo?: OrderDocumentInfo }>
  acknowledgedReviewKey?: string
  /** 只核对草稿集合并返回合理用药审查结果，不写入单据。 */
  dryRun?: boolean
}

export interface OrderSubmissionResult {
  status: 'SUBMITTED' | 'REVIEW_REQUIRED' | 'READY'
  reviewKey?: string | null
  reviews: MedicationSafetyDecision[]
  prescriptions: Prescription[]
  services: ServiceRequest[]
}

/** 后端合单结果；itemIndexes 指向提交的服务项目下标，与整批保存使用同一规则。 */
export interface ServiceDocumentPlan {
  serviceType: string
  title: string
  performerOrganizationId: string
  performerDepartmentId: string
  groupingRule: 'PER_ITEM' | 'BY_DEPT' | 'BY_DEPT_SPECIMEN' | 'BY_DEPT_EXAM_TYPE'
  groupingValue?: string | null
  ruleReasons: string[]
  itemIndexes: number[]
}

export interface OrderingPolicy {
  reviewMode: 'STANDARD' | 'SIMPLE'
  mergeWesternAndPatent: boolean
  separateInfusion: boolean
  maxItemsPerPrescription: number
}

export interface OrderDraftSaveReceipt {
  commandCode: string
  encounterId: string
  prescriptions: Prescription[]
  services: ServiceRequest[]
  /** 原地修改后的医嘱，均为未签署。 */
  revisedMedications?: MedicationRequest[]
  revisedServices?: ServiceRequest[]
}

export interface BatchOrderPrescriptionInput {
  items: BatchOrderMedicationItem[]
  autoSubmit?: boolean
}

export interface SplitPrescriptionPlan {
  categoryCode: string
  title: string
  stockSiteId: string | number | null
  stockSiteName: string | null
  routeGroupType: string
  ruleReasons: string[]
  items: Array<{
    item: BatchOrderMedicationItem
    groupLeader: boolean
    groupKey?: string
  }>
}
