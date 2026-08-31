import type { ApiClient } from './httpClient'

export type InpatientEpisodeStatus = 'ADMITTED' | 'DISCHARGED'
export type InpatientBedStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'BLOCKED' | 'MAINTENANCE'

export interface InpatientBed {
  id: string
  revision: number
  organizationId: string
  departmentId: string
  departmentName: string
  wardId?: string
  wardName?: string
  roomId?: string
  roomName?: string
  code: string
  bedNo: string
  bedType: 'PHYSICAL' | 'EXTRA' | 'VIRTUAL' | 'HOME'
  genderRestriction: 'ANY' | 'MALE' | 'FEMALE'
  operationalStatus: Exclude<InpatientBedStatus, 'OCCUPIED'>
  displayStatus: InpatientBedStatus
  nursingGroupCode?: string
  dailyBedRate?: number
  episodeId?: string
  residentId?: string
  residentName?: string
  occupiedAt?: string
}

export interface InpatientEpisode {
  id: string
  revision: number
  episodeNo: string
  status: InpatientEpisodeStatus
  residentId: string
  residentName: string
  healthRecordNo: string
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  birthDate?: string
  organizationId: string
  departmentId: string
  departmentName: string
  encounterId: string
  encounterNo: string
  wardId?: string
  wardName?: string
  roomId?: string
  roomName?: string
  bedId?: string
  bedNo?: string
  admissionTypeCode?: string
  admissionSourceCode?: string
  admissionReason?: string
  admissionMethodCode?: 'WALKING' | 'WHEELCHAIR' | 'STRETCHER' | 'AMBULANCE'
  conditionCode?: 'GENERAL' | 'URGENT' | 'CRITICAL'
  paymentMethodCode?: 'SELF_PAY' | 'BASIC_MEDICAL_INSURANCE' | 'COMMERCIAL_INSURANCE' | 'OTHER'
  referralOrganizationName?: string
  emergencyContactName?: string
  emergencyContactRelationship?: string
  emergencyContactRelationshipText?: string
  emergencyContactPhone?: string
  admissionNote?: string
  nursingLevelCode?: string
  dietCode?: string
  primaryPractitionerId?: string
  admittedAt: string
  dischargedAt?: string
  dischargeDispositionCode?: string
  dischargeNote?: string
}

export interface InpatientBootstrap {
  beds: InpatientBed[]
  episodes: InpatientEpisode[]
}

export type InpatientWardAttentionLevel = 'EXCEPTION' | 'OVERDUE' | 'AWAITING_RECEIPT' | 'HIGH_CARE' | 'PENDING' | 'STABLE'

export interface InpatientWardPatient {
  episodeId: string
  encounterId: string
  residentId: string
  residentName: string
  episodeNo: string
  bedNo?: string
  wardName?: string
  nursingLevelCode?: string
  admittedAt: string
  pendingVerificationCount: number
  pendingTaskCount: number
  overdueTaskCount: number
  medicationTaskCount: number
  serviceTaskCount: number
  nursingTaskCount: number
  pendingDispatchCount: number
  awaitingReceiptCount: number
  deliveryDiscrepancyCount: number
  attentionLevel: InpatientWardAttentionLevel
  handoverSummary: string
}

export interface InpatientWardBoard {
  generatedAt: string
  from: string
  to: string
  metrics: {
    patientCount: number
    specialCareCount: number
    pendingVerificationCount: number
    pendingTaskCount: number
    overdueTaskCount: number
    awaitingReceiptPatientCount: number
    awaitingReceiptBatchCount: number
    exceptionPatientCount: number
  }
  patients: InpatientWardPatient[]
}

export type InpatientClinicalFactStatus = 'RECORDED' | 'SIGNED' | 'CORRECTED' | 'VOIDED'
export type InpatientTemperatureSite = 'AXILLARY' | 'ORAL' | 'RECTAL' | 'EAR' | 'FOREHEAD'
export type InpatientChartEventType =
  | 'ADMISSION'
  | 'BED_TRANSFER'
  | 'WARD_TRANSFER'
  | 'LEAVE'
  | 'RETURN'
  | 'SURGERY'
  | 'DELIVERY'
  | 'DISCHARGE'
  | 'DEATH'
  | 'OTHER'

/** An immutable observation returned by the inpatient clinical record service. */
export interface InpatientVitalObservation {
  id: string
  observedAt: string
  temperatureCelsius?: number
  temperatureSite?: InpatientTemperatureSite
  coolingTemperatureCelsius?: number
  coolingObservedAt?: string
  pulseRate?: number
  respiratoryRate?: number
  systolicBloodPressure?: number
  diastolicBloodPressure?: number
  oxygenSaturation?: number
  bodyWeightKg?: number
  intakeVolumeMl?: number
  outputVolumeMl?: number
  status: InpatientClinicalFactStatus
  recorderName?: string
  signedAt?: string
}

/** A timestamped clinical event drawn on the temperature chart. */
export interface InpatientChartEvent {
  id: string
  eventType: InpatientChartEventType
  occurredAt: string
  displayText: string
  status: InpatientClinicalFactStatus
  recorderName?: string
  signedAt?: string
}

export interface InpatientTemperatureChartDaySummary {
  date: string
  bloodPressure?: string
  oxygenSaturation?: number
  bodyWeightKg?: number
  intakeVolumeMl?: number
  outputVolumeMl?: number
}

export interface InpatientTemperatureChart {
  episodeId: string
  weekStart: string
  weekEnd: string
  readOnly: boolean
  observations: InpatientVitalObservation[]
  events: InpatientChartEvent[]
  dailySummaries?: InpatientTemperatureChartDaySummary[]
}

export interface InpatientVitalObservationInput {
  observedAt: string
  temperatureCelsius?: number
  temperatureSite?: InpatientTemperatureSite
  coolingTemperatureCelsius?: number
  coolingObservedAt?: string
  pulseRate?: number
  respiratoryRate?: number
  systolicBloodPressure?: number
  diastolicBloodPressure?: number
  oxygenSaturation?: number
  bodyWeightKg?: number
  intakeVolumeMl?: number
  outputVolumeMl?: number
  commandCode: string
}

export interface InpatientChartEventInput {
  eventType: InpatientChartEventType
  occurredAt: string
  displayText: string
  commandCode: string
}

export type InpatientOrderCategory = 'MEDICATION' | 'SERVICE' | 'NURSING'
export type InpatientOrderDurationType = 'LONG_TERM' | 'TEMPORARY'
export type InpatientOrderStatus = 'DRAFT' | 'SIGNED' | 'ACTIVE' | 'COMPLETED' | 'STOPPED'
export type InpatientOrderTaskStatus = 'PLANNED' | 'EXECUTED' | 'SKIPPED' | 'CANCELLED'
export type InpatientMedicationClosureStatus = 'NOT_REQUIRED' | 'NOT_INTAKE' | 'CANCELLED' | 'RETURN_REQUIRED' | 'STOPPED'
export type InpatientMedicationClosureAction = 'NONE' | 'AUTO_CANCELLED' | 'PHARMACY_RETURN' | 'WARD_RETURN' | 'WAIT_RECEIPT'

export interface InpatientMedicationClosure {
  status?: InpatientMedicationClosureStatus | null
  dispenseTaskId?: string
  pharmacyTaskStatus?: string
  dispensedQuantity?: number
  consumedQuantity?: number
  returnedQuantity?: number
  returnableQuantity?: number
  unitCode?: string
  deliveryId?: string
  deliveryStatus?: string
  action?: InpatientMedicationClosureAction | null
}

export interface InpatientMedicationConsumption {
  id: string
  dispenseTaskLineId: string
  dispenseId: string
  dispenseLineId: string
  consumedQuantity: number
  dispenseUnitCode: string
  consumedBaseQuantity: number
  baseUnitCode: string
  commandCode: string
  consumedAt: string
}

export interface InpatientOrderTask {
  id: string
  revision: number
  orderId: string
  orderNo: string
  orderCategory: InpatientOrderCategory
  durationType: InpatientOrderDurationType
  episodeId: string
  encounterId: string
  residentId: string
  residentName: string
  organizationId: string
  departmentId: string
  itemCode: string
  itemName: string
  unitCode?: string
  dosageAmount?: number
  dosageUnit?: string
  routeCode?: string
  frequencyCode?: string
  instructions?: string
  occurrenceNo: number
  scheduledAt: string
  status: InpatientOrderTaskStatus
  outcomeCode?: string
  executionNote?: string
  completedAt?: string
  completedBy?: string
  cancelledAt?: string
  cancelReason?: string
  pharmacyFulfillmentRequired: boolean
  pharmacyFulfilled: boolean
  dispenseId?: string
  netDispensedQuantity?: number
  pharmacyFulfillmentStatus?: string
  medicationConsumptions: InpatientMedicationConsumption[]
}

export interface InpatientOrder {
  id: string
  revision: number
  orderNo: string
  orderCategory: InpatientOrderCategory
  durationType: InpatientOrderDurationType
  status: InpatientOrderStatus
  episodeId: string
  episodeNo: string
  encounterId: string
  residentId: string
  residentName: string
  organizationId: string
  departmentId: string
  catalogItemId?: string
  medicationId?: string
  itemCode: string
  itemName: string
  unitCode?: string
  dosageAmount?: number
  dosageUnit?: string
  routeCode?: string
  frequencyCode?: string
  instructions?: string
  authoredPractitionerId?: string
  authoredBy: string
  authoredAt: string
  signedBy?: string
  signedAt?: string
  verifiedBy?: string
  verifiedAt?: string
  stoppedBy?: string
  stoppedAt?: string
  stopReason?: string
  medicationClosure?: InpatientMedicationClosure | null
  tasks: InpatientOrderTask[]
}

export interface InpatientDoctorOrderWorklist {
  orders: InpatientOrder[]
}

export interface InpatientNurseOrderWorklist {
  tasks: InpatientOrderTask[]
}

export interface InpatientOrderDraftInput {
  episodeId: string
  orderCategory: InpatientOrderCategory
  durationType: InpatientOrderDurationType
  catalogItemId?: string
  itemCode?: string
  itemName?: string
  dosageAmount?: number
  dosageUnit?: string
  routeCode?: string
  frequencyCode?: string
  instructions?: string
  commandCode: string
}

export interface InpatientAdmissionInput {
  residentId: string
  bedId: string
  admissionTypeCode: 'GENERAL' | 'EMERGENCY' | 'TRANSFER'
  admissionSourceCode: 'OUTPATIENT' | 'EMERGENCY' | 'REFERRAL' | 'DIRECT'
  admissionReason?: string
  nursingLevelCode: 'SPECIAL' | 'LEVEL_I' | 'LEVEL_II' | 'LEVEL_III'
  dietCode?: string
  responsibleNurseId?: string
  admittedAt?: string
  admissionMethodCode: 'WALKING' | 'WHEELCHAIR' | 'STRETCHER' | 'AMBULANCE'
  conditionCode: 'GENERAL' | 'URGENT' | 'CRITICAL'
  paymentMethodCode: 'SELF_PAY' | 'BASIC_MEDICAL_INSURANCE' | 'COMMERCIAL_INSURANCE' | 'OTHER'
  referralOrganizationName?: string
  emergencyContactName?: string
  emergencyContactRelationship?: string
  emergencyContactPhone?: string
  admissionNote?: string
  commandCode: string
}

export interface InpatientDischargeDocument {
  documentType: string
  title: string
  documentId?: string
  currentVersion?: number
  status?: string
  satisfied: boolean
}

export interface InpatientDischargeDiagnosis {
  id?: string
  diagnosisStage: 'DISCHARGE'
  code: string
  display: string
  diagnosisType: 'PRIMARY' | 'SECONDARY'
  verificationStatus?: string
  diagnosisStatus?: string
}

export interface InpatientAdmissionDiagnosis {
  id?: string
  diagnosisStage: 'ADMISSION'
  code: string
  display: string
  diagnosisType: 'PRIMARY' | 'SECONDARY'
  verificationStatus: 'CONFIRMED' | 'PROVISIONAL'
  diagnosisStatus?: string
}

export interface InpatientDischargeIssue {
  code: string
  message: string
  objectType: string
  count: number
  objectIds: string[]
}

export interface InpatientDischargeReadiness {
  episodeId: string
  encounterId: string
  episodeStatus: InpatientEpisodeStatus
  dischargeCompleted: boolean
  ready: boolean
  checkedAt: string
  openLongTermOrderCount: number
  incompleteTemporaryOrderCount: number
  pendingTaskCount: number
  requiredDocuments: InpatientDischargeDocument[]
  dischargeDiagnoses: InpatientDischargeDiagnosis[]
  blockers: InpatientDischargeIssue[]
}

export interface InpatientCostLine {
  category: string
  sourceType: string
  sourceId?: string
  itemCode: string
  itemName: string
  status: string
  quantity: number
  unitCode?: string
  unitPrice: number
  totalAmount: number
  currencyCode: string
  occurredAt: string
  posted: boolean
}

export interface InpatientBillingAccount {
  episodeId: string
  encounterId: string
  patientAccountId: string
  accountStatus: string
  clinicalStatus: InpatientEpisodeStatus
  currencyCode: string
  postedChargeAmount: number
  estimatedOrderAmount: number
  estimatedBedAmount: number
  estimatedTotalAmount: number
  depositAmount: number
  ledgerBalance: number
  estimatedOutstandingAmount: number
  estimatedCreditAmount: number
  paymentDue: boolean
  financialWarningOnly: boolean
  financialSettlement?: InpatientFinancialSettlement
  deposits: InpatientDepositRecord[]
  costLines: InpatientCostLine[]
}

export interface InpatientDepositRecord {
  paymentId: string
  paymentNo: string
  originalAmount: number
  allocatedAmount: number
  refundedAmount: number
  availableAmount: number
  currencyCode: string
  paymentMethodCode: string
  paidAt: string
  externalTransactionNo?: string
  description?: string
}

export interface InpatientFinancialSettlement {
  invoiceId: string
  settlementId: string
  revision: number
  invoiceNo: string
  settlementNo: string
  settlementStatus: 'PRICED' | 'PAYMENT_PENDING' | 'PARTIAL' | 'SETTLED'
  financialStatus: 'PENDING_PAYMENT' | 'PENDING_REFUND' | 'PAYMENT_REVIEW' | 'SETTLED'
  netAmount: number
  prepaymentAmount: number
  paidAmount: number
  outstandingAmount: number
  refundableAmount: number
  currencyCode: string
  finalizedAt?: string
}

export interface InpatientDeposit {
  paymentId: string
  paymentNo: string
  amount: number
  currencyCode: string
  paymentMethodCode: string
  paidAt: string
  duplicate: boolean
  account: InpatientBillingAccount
}

export interface InpatientBedDayPosting {
  episodeId: string
  encounterId: string
  throughDate: string
  createdCount: number
  existingCount: number
  postedAmount: number
  account: InpatientBillingAccount
}

export interface InpatientDailyStatement {
  episodeId: string
  encounterId: string
  businessDate: string
  postedAmount: number
  estimatedAmount: number
  categorySummaries: Array<{
    category: string; categoryName: string; postedAmount: number; estimatedAmount: number; amount: number
  }>
  lines: InpatientCostLine[]
  asOf: string
}

export interface InpatientFinalSettlement {
  episodeId: string
  encounterId: string
  invoiceId: string
  settlementId: string
  invoiceNo: string
  settlementNo: string
  status: 'PRICED' | 'PAYMENT_PENDING' | 'PARTIAL' | 'SETTLED'
  netAmount: number
  prepaymentAmount: number
  paidAmount: number
  outstandingAmount: number
  refundableAmount: number
  financialStatus: InpatientFinancialSettlement['financialStatus']
  currencyCode: string
  duplicate: boolean
  account: InpatientBillingAccount
}

export interface InpatientFinancialAction {
  paymentIds: string[]
  duplicate: boolean
  settlement: InpatientFinancialSettlement
  account: InpatientBillingAccount
}

export type InpatientNursingRecordType =
  | 'ASSESSMENT' | 'ROUTINE' | 'CONDITION' | 'INTERVENTION' | 'MEDICATION' | 'SAFETY' | 'EDUCATION' | 'OTHER'

export interface InpatientNursingContent {
  focus?: string
  observation?: string
  intervention?: string
  response?: string
  education?: string
  note?: string
}

export interface InpatientNursingObservationSummary {
  temperatureCelsius?: number
  pulseRate?: number
  respiratoryRate?: number
  systolicBloodPressure?: number
  diastolicBloodPressure?: number
  oxygenSaturation?: number
  intakeVolumeMl?: number
  outputVolumeMl?: number
  painScore?: number
  consciousnessCode?: 'ALERT' | 'DROWSY' | 'STUPOR' | 'COMA' | 'OTHER'
  riskFlags: string[]
}

export interface InpatientNursingAssessment {
  assessmentType: 'ADMISSION' | 'REASSESSMENT'
  admissionMethod: 'WALKING' | 'WHEELCHAIR' | 'STRETCHER' | 'AMBULANCE'
  communicationStatus: 'NORMAL' | 'IMPAIRED' | 'UNABLE'
  selfCareLevel: 'INDEPENDENT' | 'PARTIAL_ASSISTANCE' | 'DEPENDENT'
  mobilityLevel: 'INDEPENDENT' | 'ASSISTED' | 'BEDBOUND'
  skinStatus: 'INTACT' | 'AT_RISK' | 'DAMAGED'
  nutritionStatus: 'NORMAL' | 'AT_RISK' | 'MALNOURISHED'
  fallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  pressureInjuryRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  painScore?: number
  riskFlags: string[]
  conclusion?: string
  immediateActions: string[]
}

export interface InpatientNursingRecord {
  id: string
  episodeId: string
  encounterId: string
  residentId: string
  organizationId: string
  departmentId: string
  occurredAt: string
  recordType: InpatientNursingRecordType
  content: InpatientNursingContent
  observationSummary?: InpatientNursingObservationSummary
  assessment?: InpatientNursingAssessment
  recordedBySubjectId: string
  recordedByPractitionerId?: string
  recorderName: string
  recordedAt: string
  contentDigestAlgorithm: string
  contentDigest: string
  integrityEvidenceId: string
}

export interface InpatientHandoffPatient {
  id: string
  episodeId: string
  encounterId: string
  residentId: string
  residentName: string
  bedNo?: string
  situation: string
  pendingActions: string[]
  riskFlags: string[]
  sortOrder: number
}

export interface InpatientHandoffSignature {
  id: string
  stage: 'HANDOVER' | 'TAKEOVER'
  signatureMeaning: string
  signerSubjectId: string
  signerPractitionerId?: string
  signerName: string
  signedAt: string
  signatureEvidenceId: string
}

export interface InpatientShiftHandoff {
  id: string
  revision: number
  organizationId: string
  departmentId: string
  from: string
  to: string
  wardSummary: string
  generalItems: string[]
  status: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED'
  createdBySubjectId: string
  createdByPractitionerId?: string
  creatorName: string
  createdAt: string
  updatedAt: string
  contentDigestAlgorithm: string
  contentDigest: string
  integrityEvidenceId: string
  patients: InpatientHandoffPatient[]
  signatures: InpatientHandoffSignature[]
}

export function createInpatientApi(client: ApiClient) {
  return {
    bootstrap: (status: 'ACTIVE' | 'ALL' = 'ACTIVE', keyword?: string) => {
      const query = new URLSearchParams({ status })
      if (keyword?.trim()) query.set('keyword', keyword.trim())
      return client.request<InpatientBootstrap>(`/api/inpatient/bootstrap?${query}`)
    },
    wardBoard: (from: string, to: string) => {
      const query = new URLSearchParams({ from, to })
      return client.request<InpatientWardBoard>(`/api/inpatient/ward-board?${query}`)
    },
    admit: (input: InpatientAdmissionInput) => client.request<InpatientEpisode>('/api/inpatient/admissions', {
      method: 'POST', body: JSON.stringify(input),
    }),
    transfer: (episodeId: string, input: {
      expectedRevision: number
      targetBedId: string
      reason: string
      commandCode: string
    }) => client.request<InpatientEpisode>(`/api/inpatient/episodes/${episodeId}/transfer`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    discharge: (episodeId: string, input: {
      expectedRevision: number
      dispositionCode: 'HOME' | 'TRANSFER' | 'DEATH' | 'OTHER'
      note?: string
      commandCode: string
    }) => client.request<InpatientEpisode>(`/api/inpatient/episodes/${episodeId}/discharge`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    dischargeReadiness: (episodeId: string) => client.request<InpatientDischargeReadiness>(
      `/api/inpatient/episodes/${episodeId}/discharge-readiness`,
    ),
    dischargeDiagnoses: (episodeId: string) => client.request<{
      episodeId: string
      encounterId: string
      diagnoses: InpatientDischargeDiagnosis[]
    }>(`/api/inpatient/episodes/${episodeId}/discharge-diagnoses`),
    saveDischargeDiagnoses: (episodeId: string, input: {
      expectedEpisodeRevision: number
      diagnoses: Array<Pick<InpatientDischargeDiagnosis, 'code' | 'display' | 'diagnosisType'>>
      commandCode: string
    }) => client.request<{ episodeId: string; encounterId: string; diagnoses: InpatientDischargeDiagnosis[] }>(
      `/api/inpatient/episodes/${episodeId}/discharge-diagnoses`, {
        method: 'PUT', body: JSON.stringify(input),
      },
    ),
    billing: (episodeId: string, currencyCode = 'CNY') => client.request<InpatientBillingAccount>(
      `/api/inpatient/episodes/${episodeId}/billing?${new URLSearchParams({ currencyCode })}`,
    ),
    registerDeposit: (episodeId: string, input: {
      paymentNo: string
      amount: number
      currencyCode: string
      paymentMethodCode: string
      paidAt?: string
      externalTransactionNo?: string
      description?: string
    }) => client.request<InpatientDeposit>(`/api/inpatient/episodes/${episodeId}/billing/deposits`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    admissionDiagnoses: (episodeId: string) => client.request<{
      episodeId: string
      encounterId: string
      diagnoses: InpatientAdmissionDiagnosis[]
    }>(`/api/inpatient/episodes/${episodeId}/admission-diagnoses`),
    saveAdmissionDiagnoses: (episodeId: string, input: {
      expectedEpisodeRevision: number
      diagnoses: Array<Pick<InpatientAdmissionDiagnosis,
        'code' | 'display' | 'diagnosisType' | 'verificationStatus'>>
      commandCode: string
    }) => client.request<{ episodeId: string; encounterId: string; diagnoses: InpatientAdmissionDiagnosis[] }>(
      `/api/inpatient/episodes/${episodeId}/admission-diagnoses`, {
        method: 'PUT', body: JSON.stringify(input),
      },
    ),
    postBedDays: (episodeId: string, input: {
      throughDate: string
      currencyCode: string
      commandCode: string
    }) => client.request<InpatientBedDayPosting>(`/api/inpatient/episodes/${episodeId}/billing/bed-days/post`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    dailyStatement: (episodeId: string, businessDate: string, currencyCode = 'CNY') => {
      const query = new URLSearchParams({ businessDate, currencyCode })
      return client.request<InpatientDailyStatement>(
        `/api/inpatient/episodes/${episodeId}/billing/daily-statement?${query}`,
      )
    },
    finalSettlement: (episodeId: string, input: {
      invoiceNo: string
      currencyCode: string
      issuedAt?: string
      terminalCode?: string
      commandCode: string
    }) => client.request<InpatientFinalSettlement>(
      `/api/inpatient/episodes/${episodeId}/billing/final-settlement`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    collectFinalPayment: (episodeId: string, input: {
      expectedRevision: number
      commandCode: string
      paymentMethodCode: string
      amount: number
      currencyCode: string
      paidAt?: string
      externalTransactionNo?: string
      description?: string
    }) => client.request<InpatientFinancialAction>(
      `/api/inpatient/episodes/${episodeId}/billing/final-settlement/payments`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    refundSurplus: (episodeId: string, input: {
      expectedRevision: number
      commandCode: string
      amount: number
      currencyCode: string
      refundedAt?: string
      externalTransactionNo?: string
      reason: string
    }) => client.request<InpatientFinancialAction>(
      `/api/inpatient/episodes/${episodeId}/billing/final-settlement/refunds`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    changeBedStatus: (bedId: string, input: {
      expectedRevision: number
      status: Exclude<InpatientBedStatus, 'OCCUPIED'>
      reason?: string
      commandCode: string
    }) => client.request<InpatientBed>(`/api/inpatient/beds/${bedId}/status`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    temperatureChart: (episodeId: string, weekStart: string) => {
      const query = new URLSearchParams({ weekStart })
      return client.request<InpatientTemperatureChart>(
        `/api/inpatient/episodes/${episodeId}/temperature-chart?${query}`,
      )
    },
    recordVitalObservation: (episodeId: string, input: InpatientVitalObservationInput) =>
      client.request<InpatientVitalObservation>(`/api/inpatient/episodes/${episodeId}/vital-observations`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    recordChartEvent: (episodeId: string, input: InpatientChartEventInput) =>
      client.request<InpatientChartEvent>(`/api/inpatient/episodes/${episodeId}/chart-events`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    nursingRecords: (episodeId: string, from: string, to: string) => {
      const query = new URLSearchParams({ from, to })
      return client.request<InpatientNursingRecord[]>(
        `/api/inpatient/episodes/${episodeId}/nursing-records?${query}`,
      )
    },
    appendNursingRecord: (episodeId: string, input: {
      occurredAt: string
      recordType: InpatientNursingRecordType
      content: InpatientNursingContent
      observationSummary?: Partial<InpatientNursingObservationSummary>
      assessment?: InpatientNursingAssessment
      commandCode: string
    }) => client.request<InpatientNursingRecord>(`/api/inpatient/episodes/${episodeId}/nursing-records`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    shiftHandoffs: (from: string, to: string, status?: InpatientShiftHandoff['status']) => {
      const query = new URLSearchParams({ from, to })
      if (status) query.set('status', status)
      return client.request<InpatientShiftHandoff[]>(`/api/inpatient/shift-handoffs?${query}`)
    },
    createShiftHandoff: (input: {
      from: string
      to: string
      wardSummary: string
      generalItems: string[]
      patients: Array<{
        episodeId: string
        situation: string
        pendingActions: string[]
        riskFlags: string[]
      }>
      commandCode: string
    }) => client.request<InpatientShiftHandoff>('/api/inpatient/shift-handoffs', {
      method: 'POST', body: JSON.stringify(input),
    }),
    submitShiftHandoff: (handoffId: string, commandCode: string) =>
      client.request<InpatientShiftHandoff>(`/api/inpatient/shift-handoffs/${handoffId}/submit`, {
        method: 'POST', body: JSON.stringify({ commandCode }),
      }),
    acceptShiftHandoff: (handoffId: string, commandCode: string) =>
      client.request<InpatientShiftHandoff>(`/api/inpatient/shift-handoffs/${handoffId}/accept`, {
        method: 'POST', body: JSON.stringify({ commandCode }),
      }),
    doctorOrderWorklist: (episodeId: string, status: InpatientOrderStatus | 'ALL' = 'ALL') => {
      const query = new URLSearchParams({ episodeId, status })
      return client.request<InpatientDoctorOrderWorklist>(`/api/inpatient/orders/doctor-worklist?${query}`)
    },
    nurseOrderWorklist: (episodeId: string, status: InpatientOrderTaskStatus | 'ALL' = 'ALL', from?: string, to?: string) => {
      const query = new URLSearchParams({ episodeId, status })
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      return client.request<InpatientNurseOrderWorklist>(`/api/inpatient/order-tasks/nurse-worklist?${query}`)
    },
    createOrderDraft: (input: InpatientOrderDraftInput) => client.request<InpatientOrder>('/api/inpatient/orders', {
      method: 'POST', body: JSON.stringify(input),
    }),
    signOrder: (orderId: string, expectedRevision: number, commandCode: string,
      allergyReviewConfirmed?: boolean, allergyOverrideReason?: string) =>
      client.request<InpatientOrder>(`/api/inpatient/orders/${orderId}/sign`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, allergyReviewConfirmed,
          allergyOverrideReason, commandCode }),
      }),
    verifyOrder: (orderId: string, expectedRevision: number, commandCode: string) =>
      client.request<InpatientOrder>(`/api/inpatient/orders/${orderId}/verify`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, commandCode }),
      }),
    planOrder: (orderId: string, expectedRevision: number, plannedTimes: string[], commandCode: string) =>
      client.request<InpatientOrder>(`/api/inpatient/orders/${orderId}/plans`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, plannedTimes, commandCode }),
      }),
    stopOrder: (orderId: string, expectedRevision: number, reason: string, commandCode: string) =>
      client.request<InpatientOrder>(`/api/inpatient/orders/${orderId}/stop`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason, commandCode }),
      }),
    executeOrderTask: (taskId: string, expectedRevision: number, outcomeCode: string | undefined,
      note: string | undefined, commandCode: string) => client.request<InpatientOrderTask>(
        `/api/inpatient/order-tasks/${taskId}/execute`, {
          method: 'POST', body: JSON.stringify({ expectedRevision, outcomeCode, note, commandCode }),
        }),
    skipOrderTask: (taskId: string, expectedRevision: number, outcomeCode: string,
      note: string | undefined, commandCode: string) => client.request<InpatientOrderTask>(
        `/api/inpatient/order-tasks/${taskId}/skip`, {
          method: 'POST', body: JSON.stringify({ expectedRevision, outcomeCode, note, commandCode }),
        }),
  }
}
