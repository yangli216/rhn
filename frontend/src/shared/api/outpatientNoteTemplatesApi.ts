import type { ApiClient } from './httpClient'

export type OutpatientNoteTemplateScope = 'PERSONAL' | 'DEPARTMENT'

export interface OutpatientNoteTemplateContent {
  chiefComplaint?: string
  presentIllness?: string
  medicalHistory?: string
  physicalExam?: string
  treatmentPlan?: string
}

export interface OutpatientNoteTemplate {
  id: string
  revision: number
  scopeType: OutpatientNoteTemplateScope
  name: string
  description?: string
  specialtyCode: string
  documentType: 'OUTPATIENT_NOTE'
  contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1'
  content: OutpatientNoteTemplateContent
  status: 'ACTIVE' | 'INACTIVE'
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

export interface SaveOutpatientNoteTemplateInput {
  scopeType: OutpatientNoteTemplateScope
  name: string
  description?: string
  specialtyCode?: string
  sortOrder?: number
  content: OutpatientNoteTemplateContent
}

export function createOutpatientNoteTemplatesApi(client: ApiClient) {
  return {
    list: (keyword = '', specialtyCode = 'GENERAL_PRACTICE') => {
      const params = new URLSearchParams({ specialtyCode })
      if (keyword) params.set('keyword', keyword)
      return client.request<OutpatientNoteTemplate[]>(`/api/outpatient/note-templates?${params}`)
    },
    create: (input: SaveOutpatientNoteTemplateInput) => client.request<OutpatientNoteTemplate>(
      '/api/outpatient/note-templates', { method: 'POST', body: JSON.stringify(input) },
    ),
    use: (id: string) => client.request<OutpatientNoteTemplate>(
      `/api/outpatient/note-templates/${id}/use`, { method: 'POST' },
    ),
    disable: (id: string, expectedRevision: number) => client.request<OutpatientNoteTemplate>(
      `/api/outpatient/note-templates/${id}/disable`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      },
    ),
  }
}
