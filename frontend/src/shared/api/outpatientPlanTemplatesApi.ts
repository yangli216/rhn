import type { CreateMedicationRequestInput, CreateServiceRequestInput, DiagnosisInput } from './encountersApi'
import type { ApiClient } from './httpClient'

export type OutpatientPlanTemplateScope = 'PERSONAL' | 'DEPARTMENT'

export interface OutpatientPlanTemplateMedication extends Omit<CreateMedicationRequestInput,
  'prescriptionId' | 'parentRequestId' | 'allergyReviewConfirmed' | 'allergyOverrideReason'> {
  medicationId: string
  editorMode: 'regular' | 'herbal'
  categoryCode: string
  medicationCode: string
  medicationName: string
  preparationSpec?: string
  productName?: string
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
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  diagnoses: DiagnosisInput[]
  medications: OutpatientPlanTemplateMedication[]
  services: OutpatientPlanTemplateService[]
  createdAt: string
  updatedAt: string
}

export interface SaveOutpatientPlanTemplateInput {
  scopeType: OutpatientPlanTemplateScope
  name: string
  description?: string
  sortOrder?: number
  diagnoses: DiagnosisInput[]
  medications: Array<Omit<OutpatientPlanTemplateMedication,
    'editorMode' | 'categoryCode' | 'medicationCode' | 'medicationName' | 'preparationSpec' | 'productName'>>
  services: CreateServiceRequestInput[]
}

export function createOutpatientPlanTemplatesApi(client: ApiClient) {
  return {
    list: (keyword = '') => client.request<OutpatientPlanTemplate[]>(
      `/api/outpatient/plan-templates${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
    create: (input: SaveOutpatientPlanTemplateInput) => client.request<OutpatientPlanTemplate>(
      '/api/outpatient/plan-templates', { method: 'POST', body: JSON.stringify(input) }),
    use: (id: string) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}/use`, { method: 'POST' }),
    disable: (id: string, expectedRevision: number) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}/disable`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
  }
}
