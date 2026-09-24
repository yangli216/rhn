import type { CreateMedicationRequestInput, CreateServiceRequestInput, DiagnosisInput } from './encountersApi'
import type { ApiClient } from './httpClient'

export type OutpatientPlanTemplateScope = 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL'
export type OutpatientPlanTemplateSourceType = 'MANUAL' | 'AI_INPUT' | 'AI_MINED' | 'AI_GUIDELINE'

export interface OutpatientPlanTemplateMedication extends Omit<CreateMedicationRequestInput,
  'prescriptionId' | 'parentRequestId' | 'allergyReviewConfirmed' | 'allergyOverrideReason'> {
  lineId: string
  medicationId: string
  editorMode: 'regular' | 'herbal'
  categoryCode: string
  medicationCode: string
  medicationName: string
  preparationSpec?: string
  productName?: string
  routeName?: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
}

export interface OutpatientPlanTemplateService extends CreateServiceRequestInput {
  itemCode: string
  itemName: string
  serviceType: 'LABORATORY' | 'EXAMINATION' | 'TREATMENT' | 'OTHER'
}

export interface OutpatientPlanTemplate {
  id: string
  revision: number
  scopeType: OutpatientPlanTemplateScope
  name: string
  description?: string
  status: 'ACTIVE' | 'INACTIVE'
  sourceType?: OutpatientPlanTemplateSourceType
  guidelineReference?: string
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  diagnoses: DiagnosisInput[]
  medications: OutpatientPlanTemplateMedication[]
  services: OutpatientPlanTemplateService[]
  createdAt: string
  updatedAt: string
}

export interface CompiledPlanMedicationItem extends Omit<CreateMedicationRequestInput,
  'prescriptionId' | 'parentRequestId' | 'allergyReviewConfirmed' | 'allergyOverrideReason'> {
  medicationName?: string
  preparationSpec?: string
}

export interface CompiledPlanServiceItem extends CreateServiceRequestInput {
  itemCode?: string
  itemName?: string
  serviceType?: 'LABORATORY' | 'EXAMINATION' | 'TREATMENT' | 'OTHER'
}

export interface SaveOutpatientPlanTemplateInput {
  scopeType: OutpatientPlanTemplateScope
  name: string
  description?: string
  sourceType?: OutpatientPlanTemplateSourceType
  guidelineReference?: string
  sortOrder?: number
  diagnoses: DiagnosisInput[]
  medications: CompiledPlanMedicationItem[]
  services: CompiledPlanServiceItem[]
}

export interface MinedPlanSuggestion {
  patternKey: string
  suggestedName: string
  description: string
  occurrenceCount: number
  diagnoses: DiagnosisInput[]
  medications: CompiledPlanMedicationItem[]
  services: CompiledPlanServiceItem[]
}

export interface HistoricalStablePlan {
  encounterId: string
  sourceEncounterId: string
  sourceEncounterTime?: string
  conditionTitle: string
  summary: string
  diagnoses: DiagnosisInput[]
  medications: Array<Omit<OutpatientPlanTemplateMedication,
    'lineId' | 'editorMode' | 'categoryCode' | 'medicationCode' | 'medicationName' | 'preparationSpec' | 'productName'>>
  services: CreateServiceRequestInput[]
  guidanceNotes: string[]
}

export interface UpdateOutpatientPlanTemplateInput {
  expectedRevision: number
  scopeType: OutpatientPlanTemplateScope
  name: string
  description?: string
  guidelineReference?: string
  sortOrder?: number
  diagnoses: DiagnosisInput[]
  medications: CompiledPlanMedicationItem[]
  services: CompiledPlanServiceItem[]
}

export function createOutpatientPlanTemplatesApi(client: ApiClient) {
  return {
    list: (keyword = '') => client.request<OutpatientPlanTemplate[]>(
      `/api/outpatient/plan-templates${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
    create: (input: SaveOutpatientPlanTemplateInput) => client.request<OutpatientPlanTemplate>(
      '/api/outpatient/plan-templates', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: UpdateOutpatientPlanTemplateInput) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    use: (id: string) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}/use`, { method: 'POST' }),
    disable: (id: string, expectedRevision: number) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}/disable`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
    compileDraft: (naturalInput: string, scopeType: OutpatientPlanTemplateScope = 'PERSONAL') =>
      client.request<SaveOutpatientPlanTemplateInput>('/api/ai/clinical-assistant/plan-templates/draft', {
        method: 'POST',
        body: JSON.stringify({ naturalInput, scopeType }),
      }),
    compileGuideline: (guidelineText: string, guidelineName: string, versionYear?: string, scopeType: OutpatientPlanTemplateScope = 'HOSPITAL') =>
      client.request<SaveOutpatientPlanTemplateInput>('/api/ai/clinical-assistant/plan-templates/guideline-extract', {
        method: 'POST',
        body: JSON.stringify({ guidelineText, guidelineName, versionYear, scopeType }),
      }),
    minedSuggestions: () =>
      client.request<MinedPlanSuggestion[]>('/api/ai/clinical-assistant/plan-templates/mined-suggestions'),
    getHistoricalStablePlan: (encounterId: string) =>
      client.request<HistoricalStablePlan | null>(`/api/ai/clinical-assistant/encounters/${encounterId}/historical-stable-plan`),
  }
}
