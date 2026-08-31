import type { ApiClient } from './httpClient'
import type { OutpatientNoteFormSection } from './outpatientNoteFormsApi'

export interface ClinicalDocumentVersion {
  version: number
  changeType: string
  changeReason: string
  createdBy: string
  createdAt: string
  signedBy?: string | null
  signedAt?: string | null
  signatureMeaning?: string | null
  contentDigestAlgorithm?: string | null
  contentDigest?: string | null
  integrityEvidenceId?: string | null
  signatureEvidenceId?: string | null
}

export interface OutpatientNoteContent {
  chiefComplaint?: string
  presentIllness?: string
  medicalHistory?: string
  physicalExam?: string
  treatmentPlan?: string
  vitalSigns?: {
    systolic?: number
    diastolic?: number
    temperature?: number
    pulseRate?: number
    respiratoryRate?: number
    heightCm?: number
    weightKg?: number
    oxygenSaturation?: number
  }
  diagnoses?: Array<{ code: string; display: string; type: string }>
  structuredForm?: {
    versionId: string
    formCode: string
    version: number
    name: string
    description?: string | null
    specialtyCode: string
    definitionSchema: 'RHN.OUTPATIENT_NOTE_FORM_DEFINITION.V1'
    sections: OutpatientNoteFormSection[]
    publishedAt: string
  }
  structuredData?: Record<string, unknown>
}

export interface ClinicalDocument {
  id: string
  residentId: string
  encounterId?: string | null
  organizationId?: string | null
  departmentId?: string | null
  documentType: string
  instanceKey: string
  title: string
  status: 'DRAFT' | 'SIGNED' | 'AMENDMENT_IN_PROGRESS' | 'ARCHIVED'
  currentVersion: number
  content: OutpatientNoteContent & Record<string, unknown>
  contentSchema: string
  createdBy: string
  createdAt: string
  updatedAt: string
  history: ClinicalDocumentVersion[]
}

export function createClinicalDocumentsApi(client: ApiClient) {
  return {
    byEncounter: (encounterId: string) => client.request<ClinicalDocument[]>(
      `/api/clinical-documents?encounterId=${encodeURIComponent(encounterId)}`,
    ),
    create: (input: {
      residentId: string
      encounterId: string
      organizationId: string
      departmentId: string
      documentType: string
      instanceKey?: string
      title: string
      contentSchema: string
      content: Record<string, unknown>
      changeReason: string
    }) => client.request<ClinicalDocument>('/api/clinical-documents', {
      method: 'POST', body: JSON.stringify(input),
    }),
    updateDraft: (documentId: string, input: {
      expectedCurrentVersion: number
      contentSchema: string
      content: Record<string, unknown>
      changeReason: string
    }) => client.request<ClinicalDocument>(`/api/clinical-documents/${documentId}/draft`, {
      method: 'PUT', body: JSON.stringify(input),
    }),
    amend: (documentId: string, input: {
      expectedCurrentVersion: number
      contentSchema: string
      content: Record<string, unknown>
      changeReason: string
    }) => client.request<ClinicalDocument>(`/api/clinical-documents/${documentId}/amendments`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    sign: (documentId: string, expectedCurrentVersion: number, signatureMeaning = 'AUTHOR') =>
      client.request<ClinicalDocument>(`/api/clinical-documents/${documentId}/sign`, {
        method: 'POST', body: JSON.stringify({ expectedCurrentVersion, signatureMeaning }),
      }),
  }
}
