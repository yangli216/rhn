import type { ApiClient } from './httpClient'

export type OutpatientNoteFormFieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'BOOLEAN' | 'DATE'

export interface OutpatientNoteFormOption {
  value: string
  label: string
}

export interface OutpatientNoteFormField {
  code: string
  label: string
  type: OutpatientNoteFormFieldType
  required: boolean
  unit?: string | null
  placeholder?: string | null
  maxLength?: number | null
  minimum?: number | null
  maximum?: number | null
  options: OutpatientNoteFormOption[]
}

export interface OutpatientNoteFormSection {
  code: string
  title: string
  description?: string | null
  fields: OutpatientNoteFormField[]
}

export interface OutpatientNoteForm {
  id: string
  formCode: string
  version: number
  specialtyCode: string
  name: string
  description?: string | null
  definitionSchema: 'RHN.OUTPATIENT_NOTE_FORM_DEFINITION.V1'
  sections: OutpatientNoteFormSection[]
  status: 'PUBLISHED' | 'RETIRED'
  publishedBy: string
  publishedAt: string
}

export type SaveOutpatientNoteFormInput = Omit<OutpatientNoteForm,
  'id' | 'version' | 'definitionSchema' | 'status' | 'publishedBy' | 'publishedAt'>

export type ReviseOutpatientNoteFormInput = Omit<SaveOutpatientNoteFormInput, 'formCode'>

export function createOutpatientNoteFormsApi(client: ApiClient) {
  return {
    list: (specialtyCode = 'GENERAL_PRACTICE') => client.request<OutpatientNoteForm[]>(
      `/api/outpatient/note-forms?specialtyCode=${encodeURIComponent(specialtyCode)}`,
    ),
    create: (input: SaveOutpatientNoteFormInput) => client.request<OutpatientNoteForm>(
      '/api/outpatient/note-forms', { method: 'POST', body: JSON.stringify(input) },
    ),
    revise: (formCode: string, expectedVersion: number, input: ReviseOutpatientNoteFormInput) =>
      client.request<OutpatientNoteForm>(`/api/outpatient/note-forms/${encodeURIComponent(formCode)}/versions`, {
        method: 'POST', body: JSON.stringify({ expectedVersion, ...input }),
      }),
  }
}
