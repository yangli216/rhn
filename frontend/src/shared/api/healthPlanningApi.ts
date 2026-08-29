import type { ApiClient } from './httpClient'

export interface HypertensionEvidenceObservation {
  id: string
  system: string
  code: string
  value: number
  unit: string
}

export interface HypertensionScreeningEvidence {
  contractVersion: string
  decision: 'SUSPECTED' | 'URGENT_RECHECK'
  diagnosticMeaning: 'CANDIDATE_NOT_DIAGNOSIS'
  residentAge: number
  encounterId: string
  measuredAt: string
  systolic: HypertensionEvidenceObservation
  diastolic: HypertensionEvidenceObservation
  thresholds: {
    systolic: number
    diastolic: number
    severeSystolic: number
    severeDiastolic: number
  }
  rule: {
    code: string
    version: string
    guidanceVersion: string
    standard: string
  }
  recheckDueAt: string
}

export interface CareTaskEvidenceEvent {
  id: string
  eventType: 'CREATE' | 'EVIDENCE_RECORDED'
  commandCode: string
  resultDescription: string
  ruleCode: string
  ruleVersion: string
  evidence: HypertensionScreeningEvidence
  evidenceHash: string
  occurredAt: string
}

export interface HypertensionCandidate {
  taskId: string
  revision: number
  taskCode: string
  status: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  residentId: string
  residentName: string
  encounterId: string
  conditionId: string
  conditionCode: string
  conditionName: string
  verificationStatus: 'SUSPECTED' | 'CONFIRMED' | 'REFUTED'
  organizationId: string
  departmentId: string
  dueAt: string
  title: string
  description: string
  createdAt: string
  evidenceEvents: CareTaskEvidenceEvent[]
}

export function createHealthPlanningApi(client: ApiClient) {
  return {
    hypertensionCandidates: (residentId?: string) => client.request<HypertensionCandidate[]>(
      `/api/health-planning/hypertension-candidates${residentId ? `?residentId=${encodeURIComponent(residentId)}` : ''}`,
    ),
  }
}
