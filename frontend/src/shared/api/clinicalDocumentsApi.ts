import type { ApiClient } from './httpClient'

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
}

export interface ClinicalDocument {
  id: string
  residentId: string
  encounterId?: string | null
  organizationId?: string | null
  departmentId?: string | null
  documentType: string
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
    sign: (documentId: string, expectedCurrentVersion: number, signatureMeaning = 'AUTHOR') =>
      client.request<ClinicalDocument>(`/api/clinical-documents/${documentId}/sign`, {
        method: 'POST', body: JSON.stringify({ expectedCurrentVersion, signatureMeaning }),
      }),
  }
}
