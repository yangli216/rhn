import type { DiagnosisInput } from './encountersApi'
import type { ApiClient } from './httpClient'

export type ClinicalAiMode = 'DISABLED' | 'LOCAL_ASSIST' | 'MODEL'

export interface ClinicalAiCapabilities {
  mode: ClinicalAiMode
  available: boolean
  provider: string
  model?: string
  message: string
  features: string[]
}

export interface ClinicalAiRecordDraft {
  chiefComplaint?: string
  presentIllness?: string
  medicalHistory?: string
  physicalExam?: string
  treatmentPlan?: string
}

export interface ClinicalAiDraftInput extends ClinicalAiRecordDraft {
  systolic?: number
  diastolic?: number
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  oxygenSaturation?: number
  diagnoses: DiagnosisInput[]
}

export interface ClinicalAiDraftContext extends ClinicalAiDraftInput {
  heightCm?: number
  weightKg?: number
  encounterId: string
  residentId: string
  encounterStatus: string
  documentVersion: number
  documentStatus: string
  structuredContextFingerprint: string
  medicationDraftFingerprint: string
  serviceDraftFingerprint: string
  allergyContextFingerprint: string
  allergyState: 'LOADING' | 'ERROR' | 'READY'
  busy: boolean
}

export interface ClinicalAiDiagnosisCandidate extends DiagnosisInput {
  confidence: number
  rationale: string
}

export interface ClinicalAiSafetyAlert {
  level: 'INFO' | 'WARNING' | 'CRITICAL'
  title: string
  detail: string
}

export interface ClinicalAiRecommendedPlan {
  templateId: string
  name: string
  description?: string
  rationale: string
}

export interface ClinicalAiSuggestion {
  id: string
  status: 'GENERATED' | 'PARTIALLY_ADOPTED' | 'ADOPTED' | 'IGNORED' | 'EXPIRED' | 'FAILED'
  contextHash: string
  clientContextFingerprint: string
  provider: string
  model?: string
  generatedAt: string
  expiresAt: string
  summary: string
  recordDraft: ClinicalAiRecordDraft
  diagnosisCandidates: ClinicalAiDiagnosisCandidate[]
  differentialDiagnoses: ClinicalAiDiagnosisCandidate[]
  missingInformation: string[]
  safetyAlerts: ClinicalAiSafetyAlert[]
  recommendedPlans: ClinicalAiRecommendedPlan[]
  disclaimer: string
}

export interface GenerateClinicalAiSuggestionInput {
  clientContextFingerprint: string
  question?: string
  draft: ClinicalAiDraftInput
}

export type ClinicalAiSuggestionEventType =
  | 'VIEWED'
  | 'ADOPTED'
  | 'IGNORED'
  | 'FEEDBACK_POSITIVE'
  | 'FEEDBACK_NEGATIVE'

export interface RecordClinicalAiSuggestionEventInput {
  commandCode: string
  eventType: ClinicalAiSuggestionEventType
  sectionCode?: string
  contextHash: string
  detail?: string
}

export function createClinicalAiApi(client: ApiClient) {
  return {
    capabilities: () => client.request<ClinicalAiCapabilities>('/api/ai/clinical-assistant/capabilities'),
    generate: (encounterId: string, input: GenerateClinicalAiSuggestionInput) =>
      client.request<ClinicalAiSuggestion>(
        `/api/ai/clinical-assistant/encounters/${encounterId}/suggestions`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    history: (encounterId: string) => client.request<ClinicalAiSuggestion[]>(
      `/api/ai/clinical-assistant/encounters/${encounterId}/suggestions`,
    ),
    recordEvent: (suggestionId: string, input: RecordClinicalAiSuggestionEventInput) =>
      client.request<void>(`/api/ai/clinical-assistant/suggestions/${suggestionId}/events`, {
        method: 'POST', body: JSON.stringify(input),
      }),
  }
}
