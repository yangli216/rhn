import type { ApiClient } from './httpClient'

export type TreatmentTaskType = 'SERVICE' | 'MEDICATION'
export type TreatmentTaskStatus = 'WAITING_SETTLEMENT' | 'WAITING_DISPENSE' | 'READY' | 'IN_PROGRESS'
  | 'WAITING_SKIN_TEST' | 'COMPLETED' | 'CANCELLED' | 'EXCEPTION'

export type SkinTestStatus = 'WAITING_SETTLEMENT' | 'WAITING_DISPENSE' | 'PENDING' | 'IN_PROGRESS'
  | 'NEGATIVE' | 'POSITIVE' | 'UNCERTAIN' | 'INVALID'
export type SkinTestResult = 'NEGATIVE' | 'POSITIVE' | 'UNCERTAIN' | 'INVALID'

export interface TreatmentExecutionItem {
  id: string
  sourceType: 'SERVICE_REQUEST' | 'MEDICATION_REQUEST'
  sourceId: string
  parentSourceId?: string
  requestNo: string
  itemCode: string
  itemName: string
  doseValue?: number
  doseUnit?: string
  routeCode?: string
  frequencyCode?: string
  frequencyId?: string
  frequencyName?: string
  frequencyRule?: string
  durationValue?: number
  durationUnit?: string
  skinTestRequired: boolean
  skinTestStatus: 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | SkinTestResult
  skinTestResult?: SkinTestResult
  skinTestEventId?: string
  settlementRequired: boolean
  settlementId?: string
  fulfillmentRequired: boolean
  fulfillmentId?: string
  fulfillmentStatus?: string
  cancelled: boolean
  ready: boolean
  createdAt: string
}

export interface TreatmentExecutionTask {
  id: string
  revision: number
  taskNo: string
  taskType: TreatmentTaskType
  status: TreatmentTaskStatus
  residentId: string
  residentName: string
  healthRecordNo: string
  encounterId: string
  organizationId: string
  departmentId: string
  sourceGroupId?: string
  createdAt: string
  startedAt?: string
  startedBy?: string
  verificationMethod?: 'NAME_AND_IDENTIFIER' | 'CARD' | 'MANUAL'
  executionSite?: string
  startNote?: string
  completedAt?: string
  completedBy?: string
  resultCode?: 'COMPLETED' | 'INTERRUPTED' | 'NOT_COMPLETED'
  completionNote?: string
  adverseReaction: boolean
  adverseReactionDetail?: string
  exceptionNote?: string
  items: TreatmentExecutionItem[]
}

export interface StartTreatmentInput {
  expectedRevision: number
  identityVerified: boolean
  verificationMethod: 'NAME_AND_IDENTIFIER' | 'CARD' | 'MANUAL'
  executionSite?: string
  note?: string
}

export interface CompleteTreatmentInput {
  expectedRevision: number
  resultCode: 'COMPLETED' | 'INTERRUPTED' | 'NOT_COMPLETED'
  note?: string
  adverseReaction: boolean
  adverseReactionDetail?: string
}

export interface SkinTestWorkItem {
  medicationRequestId: string
  medicationRequestRevision: number
  requestNo: string
  residentId: string
  residentName: string
  healthRecordNo: string
  gender?: string
  birthDate?: string
  encounterId: string
  organizationId: string
  departmentId: string
  medicationId: string
  medicationCode: string
  medicationName: string
  itemName: string
  routeCode?: string
  doseValue?: number
  doseUnit?: string
  configuredTestMethod?: 'INTRADERMAL' | 'PRICK' | 'OTHER'
  configuredSolutionMode?: 'ORIGINAL_SOLUTION' | 'DILUTED_SOLUTION'
  configuredObservationMinutes?: number
  resultValidityHours?: number
  configurationInstructions?: string
  settlementRequiredBeforeStart: boolean
  dispenseRequiredBeforeStart: boolean
  status: SkinTestStatus
  gateMessage?: string
  eventId?: string
  eventRevision?: number
  attemptNo?: number
  testMethod?: 'INTRADERMAL' | 'PRICK' | 'OTHER'
  originalSolution: boolean
  solutionCatalogItemId?: string
  solutionName?: string
  stockLotId?: string
  lotNo?: string
  concentration?: number
  concentrationUnit?: string
  bodySite?: string
  verificationMethod?: 'NAME_AND_IDENTIFIER' | 'CARD' | 'MANUAL'
  observationMinutes?: number
  startedAt?: string
  completedAt?: string
  result?: SkinTestResult
  whealDiameterMm?: number
  flareDiameterMm?: number
  reactionDescription?: string
  earlyReadReason?: string
  performedByUserId?: string
  performedByPractitionerId?: string
  readByUserId?: string
  readByPractitionerId?: string
  verifiedByUserId?: string
  verifiedByPractitionerId?: string
  verifiedByName?: string
  verifiedAt?: string
}

export interface StartSkinTestInput {
  expectedMedicationRevision: number
  identityVerified: boolean
  verificationMethod: 'NAME_AND_IDENTIFIER' | 'CARD' | 'MANUAL'
  testMethod: 'INTRADERMAL' | 'PRICK' | 'OTHER'
  originalSolution: boolean
  solutionCatalogItemId?: string
  solutionName?: string
  stockLotId?: string
  lotNo?: string
  concentration?: number
  concentrationUnit?: string
  bodySite?: string
  observationMinutes: number
}

export interface CompleteSkinTestInput {
  expectedRevision: number
  result: SkinTestResult
  whealDiameterMm?: number
  flareDiameterMm?: number
  reactionDescription?: string
  earlyReadReason?: string
  verifiedByPractitionerId?: string
  verifiedByName?: string
}

export function createTreatmentApi(client: ApiClient) {
  return {
    worklist: (taskType?: TreatmentTaskType, status?: TreatmentTaskStatus, keyword?: string) => {
      const query = new URLSearchParams()
      if (taskType) query.set('taskType', taskType)
      if (status) query.set('status', status)
      if (keyword?.trim()) query.set('keyword', keyword.trim())
      return client.request<TreatmentExecutionTask[]>(`/api/treatments/worklist${query.size ? `?${query}` : ''}`)
    },
    start: (taskId: string, input: StartTreatmentInput) =>
      client.request<TreatmentExecutionTask>(`/api/treatments/tasks/${taskId}/start`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    complete: (taskId: string, input: CompleteTreatmentInput) =>
      client.request<TreatmentExecutionTask>(`/api/treatments/tasks/${taskId}/complete`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    skinTestWorklist: (status?: SkinTestStatus, keyword?: string, encounterId?: string) => {
      const query = new URLSearchParams()
      if (status) query.set('status', status)
      if (keyword?.trim()) query.set('keyword', keyword.trim())
      if (encounterId) query.set('encounterId', encounterId)
      return client.request<SkinTestWorkItem[]>(`/api/treatments/skin-tests/worklist${query.size ? `?${query}` : ''}`)
    },
    validNegativeSkinTests: (residentId: string, medicationId: string, validityHours?: number) => {
      const query = new URLSearchParams()
      query.set('residentId', residentId)
      query.set('medicationId', medicationId)
      if (validityHours) query.set('validityHours', String(validityHours))
      return client.request<SkinTestWorkItem[]>(`/api/treatments/skin-tests/valid-negative?${query}`)
    },
    startSkinTest: (medicationRequestId: string, input: StartSkinTestInput) =>
      client.request<SkinTestWorkItem>(
        `/api/treatments/skin-tests/medication-requests/${encodeURIComponent(medicationRequestId)}/start`, {
          method: 'POST', body: JSON.stringify(input),
        }),
    completeSkinTest: (eventId: string, input: CompleteSkinTestInput) =>
      client.request<SkinTestWorkItem>(`/api/treatments/skin-tests/events/${encodeURIComponent(eventId)}/complete`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    cancelSkinTest: (eventId: string, expectedRevision: number, reason: string) =>
      client.request<SkinTestWorkItem>(`/api/treatments/skin-tests/events/${encodeURIComponent(eventId)}/cancel`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
      }),
  }
}
