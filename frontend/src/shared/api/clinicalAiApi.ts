import type { RecordAnnotation } from './recordAnnotations'
import type { DiagnosisInput } from './encountersApi'
import type { ApiClient } from './httpClient'
import { consumeClinicalAiStream, type ClinicalAiStreamStage } from './clinicalAiStream'

export type ClinicalAiMode = 'DISABLED' | 'LOCAL_ASSIST' | 'MODEL'
export type ClinicalAiConfigurationScope = 'PLATFORM' | 'TENANT'

export interface ClinicalAiConfigurationSetting {
  key: string
  group: string
  name: string
  description: string
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN'
  secret: boolean
  effectiveValue?: string | number | boolean | null
  sourceScope: 'PLATFORM' | 'TENANT' | 'DEFAULT' | 'DEPLOYMENT'
  inherited: boolean
  secretConfigured: boolean
  overridePresent: boolean
  overrideRevision?: number | null
  overrideActive: boolean
}

export interface ClinicalAiConfigurationView {
  scope: ClinicalAiConfigurationScope
  canManagePlatform: boolean
  encryptionAvailable: boolean
  encryptionKeyId: string
  runtime: {
    mode: ClinicalAiMode
    assistantReady: boolean
    modelReady: boolean
    speechReady: boolean
    knowledgeReady: boolean
    provider: string
    model?: string | null
  }
  settings: ClinicalAiConfigurationSetting[]
}

export interface ClinicalAiConfigurationUpdate {
  key: string
  value?: string | number | boolean
  secretValue?: string
  clearSecret?: boolean
  clearOverride?: boolean
  expectedRevision?: number | null
}

export interface ClinicalAiConfigurationTestInput {
  scope: ClinicalAiConfigurationScope
  target: 'MODEL' | 'SPEECH' | 'DECISION' | 'KNOWLEDGE'
  endpoint?: string
  model?: string
  secretValue?: string
  timeoutSeconds?: number
}

export interface ClinicalAiConfigurationTestResult {
  target: 'MODEL' | 'SPEECH' | 'DECISION' | 'KNOWLEDGE'
  success: boolean
  statusCode: number
  latencyMs: number
  message: string
  rawDetail?: string | null
}

export interface ClinicalAiCapabilities {
  mode: ClinicalAiMode
  available: boolean
  provider: string
  model?: string
  message: string
  features: string[]
}

export interface ClinicalAiRecordText {
  chiefComplaint?: string
  presentIllness?: string
  medicalHistory?: string
  physicalExam?: string
  treatmentPlan?: string
  allergyHistory?: string
  medicationHistory?: string
  auxiliaryExaminations?: string
  healthEducation?: string
  followUp?: string
}

export interface ClinicalAiVitalSigns {
  systolic?: number
  diastolic?: number
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  oxygenSaturation?: number
  heightCm?: number
  weightKg?: number
}

export interface ClinicalAiRecordDraft extends ClinicalAiRecordText, ClinicalAiVitalSigns { annotations?: RecordAnnotation[] }

export interface ClinicalAiDraftInput extends ClinicalAiRecordDraft {
  diagnoses: DiagnosisInput[]
}

export interface ClinicalAiDraftContext extends ClinicalAiDraftInput {
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
  rationale?: string | null
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

export interface ClinicalAiTreatmentRecommendation {
  type: 'MEDICATION' | 'LABORATORY' | 'EXAMINATION'
  catalogItemId: string
  medicationId?: string
  code: string
  name: string
  specification?: string
  rationale?: string | null
  /** Catalog-backed, physician-editable details; revalidated when accepting into order drafts. */
  orderDraft?: {
    packageId?: string
    doseValue?: number
    doseUnit?: string
    routeCode?: string
    frequencyCode?: string
    durationValue?: number
    quantity: number
    instruction?: string
    performerOrganizationId?: string
    performerDepartmentId?: string
  }
}

export interface ClinicalAiTreatmentMatch {
  key: string
  intent: { type: string; name: string; specification?: string; rationale?: string | null }
  status: string
  reason: string
  candidates: ClinicalAiTreatmentRecommendation[]
}

export interface ClinicalAiSuggestion {
  treatmentRecommendations?: ClinicalAiTreatmentRecommendation[]
  treatmentMatches?: ClinicalAiTreatmentMatch[]
  id: string
  parentSuggestionId?: string
  status: 'GENERATED' | 'PARTIALLY_ADOPTED' | 'ADOPTED' | 'IGNORED' | 'EXPIRED' | 'FAILED'
  contextHash: string
  clientContextFingerprint: string
  provider: string
  model?: string
  promptVersion: string
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

export type ReceptionSceneType = 'FIRST_VISIT' | 'CHRONIC_REFILL' | 'REPORT_FOLLOW_UP'

export interface GenerateClinicalAiSuggestionInput {
  receptionScene?: ReceptionSceneType
  receptionSceneContext?: { selectedConditions: string[]; selectedReportIds: string[] }
  clientContextFingerprint: string
  question?: string
  voiceTranscript?: string
  draft: ClinicalAiDraftInput
  parentSuggestionId?: string
}

export interface ClinicalAiTranscription {
  text: string
  provider: string
  model: string
  contentType: string
  audioBytes: number
  transcribedAt: string
}

export interface ClinicalAiKnowledgeReference {
  id: string
  title: string
  excerpt?: string
  score?: number
  sourceName: string
  sourceId?: string
  publishYear?: string
  resourcePosition?: string
}

export interface ClinicalAiKnowledgeSearch {
  query: string
  provider: string
  results: ClinicalAiKnowledgeReference[]
  retrievedAt: string
}

export type ClinicalAiPreflightStatus = 'READY' | 'WARNING' | 'BLOCKED'
export type ClinicalAiCheckStatus = 'PASS' | 'WARNING' | 'BLOCKED' | 'NOT_EVALUATED'

export interface ClinicalAiPlanPreflightCheck {
  code: string
  status: ClinicalAiCheckStatus
  message: string
}

export interface ClinicalAiMedicationPreflight {
  lineId: string
  medicationId: string
  catalogItemId?: string
  packageId?: string
  medicationCode: string
  medicationName: string
  productName?: string
  status: ClinicalAiPreflightStatus
  checks: ClinicalAiPlanPreflightCheck[]
}

export interface ClinicalAiEvaluationBoundary {
  status: 'NOT_EVALUATED'
  message: string
}

export interface ClinicalAiPlanPreflight {
  templateId: string
  templateRevision: number
  status: ClinicalAiPreflightStatus
  blockingCount: number
  warningCount: number
  medications: ClinicalAiMedicationPreflight[]
  drugInteractions: ClinicalAiEvaluationBoundary
  contraindications: ClinicalAiEvaluationBoundary
  checkedAt: string
}

export interface ClinicalAiPlanPreflightInput {
  selectedMedicationLineIds: string[]
  allergyReviewConfirmed: boolean
  allergyOverrideReason?: string
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
    administrationConfiguration: (scope: ClinicalAiConfigurationScope) =>
      client.request<ClinicalAiConfigurationView>(`/api/ai/administration/configuration?scope=${scope}`),
    updateAdministrationConfiguration: (scope: ClinicalAiConfigurationScope,
      settings: ClinicalAiConfigurationUpdate[], reason?: string) =>
      client.request<ClinicalAiConfigurationView>('/api/ai/administration/configuration', {
        method: 'PUT', body: JSON.stringify({ scope, settings, reason }),
      }),
    testAdministrationConfiguration: (input: ClinicalAiConfigurationTestInput) =>
      client.request<ClinicalAiConfigurationTestResult>('/api/ai/administration/configuration/test', {
        method: 'POST', body: JSON.stringify(input),
      }),
    capabilities: () => client.request<ClinicalAiCapabilities>('/api/ai/clinical-assistant/capabilities'),
    recommendPlans: (encounterId: string, input: GenerateClinicalAiSuggestionInput, signal?: AbortSignal) =>
      client.request<ClinicalAiRecommendedPlan[]>(`/api/ai/clinical-assistant/encounters/${encounterId}/plan-recommendations`, {
        method: 'POST', body: JSON.stringify(input), signal,
      }),
    generate: (encounterId: string, input: GenerateClinicalAiSuggestionInput, signal?: AbortSignal) =>
      client.request<ClinicalAiSuggestion>(
        `/api/ai/clinical-assistant/encounters/${encounterId}/suggestions`,
        { method: 'POST', body: JSON.stringify(input), signal },
      ),
    generateStream: async (encounterId: string, input: GenerateClinicalAiSuggestionInput,
      signal: AbortSignal, onDelta: (text: string) => void, onStage?: (stage: ClinicalAiStreamStage) => void) => consumeClinicalAiStream(
        await client.eventStream(`/api/ai/clinical-assistant/encounters/${encounterId}/suggestions/stream`,
          signal, undefined, { method: 'POST', body: JSON.stringify(input) }), onDelta, onStage),
    transcribe: (encounterId: string, audio: Blob) => {
      const body = new FormData()
      const extension = audio.type.includes('wav') ? 'wav' : audio.type.includes('mp4') ? 'mp4'
        : audio.type.includes('mpeg') ? 'mp3' : 'webm'
      body.append('file', audio, `clinical-dictation.${extension}`)
      return client.request<ClinicalAiTranscription>(
        `/api/ai/clinical-assistant/encounters/${encounterId}/transcriptions`,
        { method: 'POST', body },
      )
    },
    searchKnowledge: (encounterId: string, query: string) => client.request<ClinicalAiKnowledgeSearch>(
      `/api/ai/clinical-assistant/encounters/${encounterId}/knowledge-searches`,
      { method: 'POST', body: JSON.stringify({ query }) },
    ),
    getEvidenceChain: (encounterId: string, input: ClinicalAiEvidenceChainQuery) => client.request<ClinicalAiEvidenceChainResult>(
      `/api/ai/clinical-assistant/encounters/${encounterId}/evidence-chain`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
    resolveTreatments: (encounterId: string, intents: ClinicalAiTreatmentMatch['intent'][]) => client.request<ClinicalAiTreatmentMatch[]>(
      `/api/ai/clinical-assistant/encounters/${encounterId}/treatment-matches`,
      { method: 'POST', body: JSON.stringify({ intents }) },
    ),
    getWikiDoc: (query: { name?: string; id?: string; type?: string }) => {
      const search = new URLSearchParams()
      if (query.name) search.set('name', query.name)
      if (query.id) search.set('id', query.id)
      if (query.type) search.set('type', query.type)
      return client.request<ClinicalAiWikiDocResult>(
        `/api/ai/clinical-assistant/wiki/doc?${search.toString()}`,
      )
    },
    preflightPlan: (encounterId: string, templateId: string, input: ClinicalAiPlanPreflightInput) =>
      client.request<ClinicalAiPlanPreflight>(
        `/api/ai/clinical-assistant/encounters/${encounterId}/plan-templates/${templateId}/preflight`,
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

export interface ClinicalAiEvidenceCheckpoint {
  status: 'MET' | 'SUGGESTED'
  type: string
  label: string
  detail: string
  sourceQuote?: string
}

export interface ClinicalAiGapOrder {
  id: string
  name: string
  category: 'LABORATORY' | 'EXAMINATION'
  orderType: string
  dept: string
  spec?: string
  indication: string
  defaultChecked: boolean
}

export interface ClinicalAiGuidelineRef {
  id: string
  title: string
  chapter: string
  authority: string
  publishYear: string
  docPath: string
  keyExcerpts: string[]
}

export interface ClinicalAiEvidenceChainResult {
  success: boolean
  protocolId: string
  protocolTitle: string
  diagnosis: { code: string; name: string }
  summary: string
  checkpoints: ClinicalAiEvidenceCheckpoint[]
  gapOrders: ClinicalAiGapOrder[]
  guidelines: ClinicalAiGuidelineRef[]
}

export interface ClinicalAiEvidenceChainQuery {
  diagnosis?: string
  diagnosisCode?: string
  chiefComplaint?: string
  presentIllness?: string
  physicalExam?: string
  medicalHistory?: string
  vitals?: Record<string, unknown>
}

export interface ClinicalAiWikiDocResult {
  id: string
  title: string
  type: string
  category?: string
  genericName?: string
  englishName?: string
  atcCode?: string
  approvalCategory?: string
  tradeNames?: string[]
  formsAndSpecs?: string[]
  maxDailyDose?: string
  standardMaintenanceDose?: string
  keyContraindications?: string[]
  specialPopulations?: Record<string, unknown>
  storage?: string
  sources?: string[]
  tags?: string[]
  relPath?: string
  markdown?: string
  html?: string
}
