import type { ApiClient } from './httpClient'

export type OutpatientFlowStatus = 'WAITING_CONSULTATION' | 'IN_CONSULTATION' | 'CONSULTATION_SUSPENDED' | 'WAITING_SETTLEMENT'
  | 'WAITING_COORDINATION' | 'WAITING_TRANSFER'
  | 'WAITING_PHARMACY' | 'WAITING_DIAGNOSTICS' | 'WAITING_TREATMENT' | 'DOWNSTREAM_IN_PROGRESS'
  | 'EXCEPTION' | 'COMPLETED' | 'TRANSFERRED' | 'TERMINATED' | 'CANCELLED'

export type OutpatientStageStatus = 'WAITING' | 'IN_PROGRESS' | 'BLOCKED' | 'EXCEPTION' | 'COMPLETED' | 'CANCELLED'

export interface OutpatientFlowStage {
  stageCode: 'CLINICAL' | 'BILLING' | 'PHARMACY' | 'DIAGNOSTICS' | 'TREATMENT' | 'COORDINATION'
  stageName: string
  status: OutpatientStageStatus
  statusText: string
  totalCount: number
  pendingCount: number
  routePath?: string
}

export interface OutpatientFlowVisit {
  encounterId: string
  encounterNo: string
  residentId: string
  residentName: string
  healthRecordNo: string
  gender: string
  clinicalStatus: 'REGISTERED' | 'IN_PROGRESS' | 'SUSPENDED' | 'COMPLETED' | 'TRANSFERRED' | 'TERMINATED' | 'CANCELLED'
  flowStatus: OutpatientFlowStatus
  flowStatusText: string
  nextDestination: string
  nextRoute?: string
  nextActionText?: string
  attentionReason: string
  pendingSince?: string
  pendingMinutes: number
  outstandingAmount: number
  registeredAt: string
  startedAt?: string
  clinicalCompletedAt?: string
  stages: OutpatientFlowStage[]
}

export interface OutpatientFlowBoard {
  businessDate: string
  refreshedAt: string
  summary: {
    totalCount: number
    waitingConsultationCount: number
    inConsultationCount: number
    downstreamPendingCount: number
    exceptionCount: number
    completedCount: number
  }
  visits: OutpatientFlowVisit[]
}

export interface EncounterTerminationIssue {
  code: string
  message: string
  routePath: string
}

export interface EncounterTerminationReadiness {
  encounterId: string
  clinicalStatus: string
  ready: boolean
  issues: EncounterTerminationIssue[]
  checkedAt: string
}

export interface TerminateEncounterInput {
  commandCode: string
  terminationCode: 'PATIENT_LEFT' | 'PATIENT_REQUEST' | 'TRANSFERRED' | 'OTHER'
  reason: string
}

export interface EncounterTerminationResult {
  encounterId: string
  clinicalStatus: 'TERMINATED'
  terminationCode: TerminateEncounterInput['terminationCode']
  terminationReason: string
  terminatedAt: string
  message: string
}

export function createOutpatientFlowApi(client: ApiClient) {
  return {
    board: (date?: string, flowStatus?: OutpatientFlowStatus, keyword?: string) => {
      const query = new URLSearchParams()
      if (date) query.set('date', date)
      if (flowStatus) query.set('flowStatus', flowStatus)
      if (keyword?.trim()) query.set('keyword', keyword.trim())
      return client.request<OutpatientFlowBoard>(`/api/outpatient-flow${query.size ? `?${query}` : ''}`)
    },
    terminationReadiness: (encounterId: string) => client.request<EncounterTerminationReadiness>(
      `/api/outpatient-flow/${encounterId}/termination-readiness`,
    ),
    terminate: (encounterId: string, input: TerminateEncounterInput) => client.request<EncounterTerminationResult>(
      `/api/outpatient-flow/${encounterId}/terminate`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
  }
}
