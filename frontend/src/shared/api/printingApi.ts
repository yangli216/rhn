import type { ApiClient } from './httpClient'

export type PrintPurpose = 'CLINICAL_USE' | 'PATIENT_COPY' | 'ARCHIVE_COPY'

export interface PrintReceipt {
  jobId: string
  outputId: string
  originalJobId?: string | null
  requestType: 'ORIGINAL' | 'REPRINT'
  status: 'GENERATED' | 'FAILED'
  copies: number
  documentType: string
  templateCode: string
  templateVersion: number
  fileName: string
  contentDigestAlgorithm: string
  contentDigest: string
  requestedAt: string
  downloadUrl: string
  delivery: {
    id: string
    revision: number
    deviceId?: string | null
    deviceName: string
    channel: 'BROWSER_PDF' | 'LOCAL_BRIDGE'
    status: 'GENERATED' | 'QUEUED' | 'SENT' | 'DEVICE_CONFIRMED' | 'FAILED' | 'CANCELLED'
    attemptCount: number
  }
}

export interface PrintJobRecord {
  jobId: string
  originalJobId?: string | null
  requestType: 'ORIGINAL' | 'REPRINT'
  status: 'GENERATED' | 'FAILED'
  copies: number
  requestedAt: string
  requestedBy: string
}

export interface PrintRecord {
  outputId: string
  sourceType: string
  sourceId: string
  sourceVersion: number
  documentType: string
  residentId?: string | null
  encounterId?: string | null
  organizationId: string
  departmentId: string
  purpose: PrintPurpose
  fileName: string
  mediaType: string
  contentDigestAlgorithm: string
  contentDigest: string
  generatedAt: string
  generatedBy: string
  templateCode: string
  templateName: string
  templateVersion: number
  downloadUrl: string
  jobs: PrintJobRecord[]
}

export type PrintLayoutMode = 'FLOW' | 'CANVAS'
export type PrintDraftStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED'

export interface PrintDocumentDefinition {
  id: string
  documentType: string
  documentName: string
  category: string
  layoutMode: PrintLayoutMode
  dataSchema: string
  sourceType: string
  scope: 'PLATFORM' | 'TENANT'
}

export interface PrintMediaProfile {
  id: string
  mediaCode: string
  mediaName: string
  mediaKind: 'SHEET' | 'CONTINUOUS' | 'LABEL'
  widthMm: number
  heightMm?: number | null
  orientation: 'PORTRAIT' | 'LANDSCAPE'
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  horizontalGapMm: number
  verticalGapMm: number
  columns: number
  rows: number
  dpi: number
  sensorMode: 'NONE' | 'GAP' | 'BLACK_MARK'
  scope: 'PLATFORM' | 'TENANT'
}

export interface PrintAdministrationCatalog {
  documentDefinitions: PrintDocumentDefinition[]
  mediaProfiles: PrintMediaProfile[]
}

export interface PrintTemplateDraft {
  id: string
  revision: number
  templateId?: string | null
  publishedVersionId?: string | null
  templateCode: string
  templateName: string
  status: PrintDraftStatus
  layoutSchema: 'RHN_PRINT_FLOW_V1' | 'RHN_PRINT_CANVAS_V1'
  configJson: string
  documentDefinition: PrintDocumentDefinition
  mediaProfile: PrintMediaProfile
  updatedAt: string
  updatedBy: string
}

export interface PublishedPrintTemplate {
  id: string
  templateCode: string
  templateName: string
  documentType: string
  scope: 'PLATFORM' | 'TENANT'
  currentVersion: number
  layoutSchema: string
}

export interface SavePrintDraft {
  documentDefinitionId: string
  mediaProfileId: string
  templateCode: string
  templateName: string
  layoutSchema: 'RHN_PRINT_FLOW_V1' | 'RHN_PRINT_CANVAS_V1'
  configJson: string
}

export type ClinicalPrintDocumentType = 'ORAL_MEDICATION_CARD' | 'INFUSION_LABEL' | 'INFUSION_PATROL_CARD'
export type RoutedPrintDocumentType = ClinicalPrintDocumentType | 'OUTPATIENT_NOTE' | 'OUTPATIENT_PRESCRIPTION'
  | 'LABORATORY_APPLICATION' | 'EXAMINATION_APPLICATION' | 'TREATMENT_APPLICATION'
export type ClinicalPrintBatchStatus = 'BUILDING' | 'GENERATED' | 'QUEUED' | 'SENT'
  | 'DEVICE_CONFIRMED' | 'PARTIAL' | 'FAILED' | 'CANCELLED'

export interface ClinicalPrintCandidate {
  sourceId: string
  sourceVersion: number
  taskNo: string
  status: string
  residentId: string
  residentName: string
  healthRecordNo: string
  encounterId: string
  createdAt: string
  medicationSummary: string
  routeSummary: string
  itemCount: number
  eligible: boolean
  exclusionCode?: string | null
  exclusionReason?: string | null
  printedBefore: boolean
  itemKey: string
}

export interface ClinicalPrintDevice {
  id?: string | null
  revision: number
  deviceCode: string
  deviceName: string
  channel: 'BROWSER_PDF' | 'LOCAL_BRIDGE'
  outputLanguage: 'PDF' | 'ZPL' | 'TSPL' | 'ESC_POS'
  queueName?: string | null
  defaultDevice: boolean
  lastSeenAt?: string | null
  status?: 'ACTIVE' | 'INACTIVE'
  capabilitiesJson?: string
}

export interface ClinicalPrintDeviceBinding {
  id: string
  revision: number
  documentType: RoutedPrintDocumentType
  mediaProfileId: string
  deviceId: string
  defaultDevice: boolean
  status: 'ACTIVE' | 'INACTIVE'
}

export interface ClinicalPrintDeviceManagement {
  devices: ClinicalPrintDevice[]
  bindings: ClinicalPrintDeviceBinding[]
}

export interface SaveClinicalPrintDevice {
  expectedRevision: number
  deviceCode: string
  deviceName: string
  channel: 'BROWSER_PDF' | 'LOCAL_BRIDGE'
  outputLanguage: 'PDF' | 'ZPL' | 'TSPL' | 'ESC_POS'
  queueName?: string
  capabilitiesJson?: string
  status: 'ACTIVE' | 'INACTIVE'
}

export interface ClinicalPrintPreparation {
  template: { id: string; templateCode: string; templateName: string; documentType: ClinicalPrintDocumentType
    versionId: string; version: number; layoutSchema: string }
  media: { id: string; mediaCode: string; mediaName: string; mediaKind: 'SHEET' | 'CONTINUOUS' | 'LABEL'
    widthMm: number; heightMm?: number | null; columns: number; rows: number; dpi: number }
  mediaProfiles: Array<{ id: string; mediaCode: string; mediaName: string; mediaKind: 'SHEET' | 'CONTINUOUS' | 'LABEL'
    widthMm: number; heightMm?: number | null; columns: number; rows: number; dpi: number }>
  devices: ClinicalPrintDevice[]
  defaultDeviceId?: string | null
  candidates: ClinicalPrintCandidate[]
}

export interface ClinicalPrintBatch {
  id: string
  revision: number
  documentType: ClinicalPrintDocumentType
  documentName: string
  status: ClinicalPrintBatchStatus
  templateName: string
  templateVersionId: string
  mediaName: string
  mediaCode: string
  deviceId?: string | null
  deviceName: string
  businessDate: string
  layoutStrategy: 'ONE_CARD_PER_PAGE' | 'SHEET_GRID'
  startSlot: number
  selectedCount: number
  includedCount: number
  excludedCount: number
  pageCount: number
  outputId?: string | null
  jobId?: string | null
  downloadUrl?: string | null
  createdAt: string
  createdBy: string
  delivery?: { id: string; revision: number; channel: 'BROWSER_PDF' | 'LOCAL_BRIDGE'; status: string
    attemptCount: number; errorCode?: string | null; errorMessage?: string | null; queuedAt?: string | null
    sentAt?: string | null; confirmedAt?: string | null } | null
  items: Array<{ id: string; sourceId: string; sourceVersion: number; residentId?: string | null
    encounterId?: string | null; status: 'INCLUDED' | 'EXCLUDED' | 'FAILED'; exclusionCode?: string | null
    exclusionReason?: string | null; pageNo?: number | null; slotNo?: number | null; reprintReason?: string | null }>
}

export interface CreateClinicalPrintBatch {
  documentType: ClinicalPrintDocumentType
  sourceIds: string[]
  mediaProfileId?: string | null
  deviceId?: string | null
  idempotencyKey: string
  layoutStrategy: 'ONE_CARD_PER_PAGE' | 'SHEET_GRID'
  startSlot?: number
  reprintReason?: string
}

export function createPrintingApi(client: ApiClient) {
  async function download(file: Pick<PrintReceipt, 'downloadUrl' | 'fileName'>) {
    const blob = await client.download(file.downloadUrl)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return {
    templates: () => client.request<PublishedPrintTemplate[]>('/api/platform/printing/templates'),
    administrationCatalog: () => client.request<PrintAdministrationCatalog>(
      '/api/platform/printing/administration/catalog'),
    templateDrafts: () => client.request<PrintTemplateDraft[]>('/api/platform/printing/administration/drafts'),
    createTemplateDraft: (value: SavePrintDraft) => client.request<PrintTemplateDraft>(
      '/api/platform/printing/administration/drafts', { method: 'POST', body: JSON.stringify(value) }),
    updateTemplateDraft: (draftId: string, value: Omit<SavePrintDraft, 'templateCode'> & { expectedRevision: number }) =>
      client.request<PrintTemplateDraft>(`/api/platform/printing/administration/drafts/${draftId}`, {
        method: 'PUT', body: JSON.stringify(value),
      }),
    transitionTemplateDraft: (draftId: string, action: 'submit' | 'reject' | 'publish', expectedRevision: number) =>
      client.request<PrintTemplateDraft>(`/api/platform/printing/administration/drafts/${draftId}/${action}`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
    clonePublishedTemplate: (templateId: string) => client.request<PrintTemplateDraft>(
      `/api/platform/printing/administration/templates/${templateId}/drafts`, { method: 'POST' }),
    previewTemplateDraft: (draftId: string, sampleData: Record<string, unknown>) => client.download(
      `/api/platform/printing/administration/drafts/${draftId}/preview`, {
        method: 'POST', body: JSON.stringify({ sampleData }),
      }),
    clinicalDocument: (documentId: string, purpose: PrintPurpose = 'PATIENT_COPY', copies = 1) =>
      client.request<PrintReceipt>(`/api/clinical-documents/${documentId}/print-jobs`, {
        method: 'POST', body: JSON.stringify({ purpose, copies }),
      }),
    prescription: (encounterId: string, prescriptionId: string,
      purpose: PrintPurpose = 'PATIENT_COPY', copies = 1) =>
      client.request<PrintReceipt>(
        `/api/encounters/${encounterId}/prescriptions/${prescriptionId}/print-jobs`, {
          method: 'POST', body: JSON.stringify({ purpose, copies }),
        },
      ),
    serviceRequest: (encounterId: string, requestId: string,
      purpose: PrintPurpose = 'PATIENT_COPY', copies = 1) =>
      client.request<PrintReceipt>(
        `/api/encounters/${encounterId}/service-requests/${requestId}/print-jobs`, {
          method: 'POST', body: JSON.stringify({ purpose, copies }),
        },
      ),
    reprint: (jobId: string, copies = 1) => client.request<PrintReceipt>(
      `/api/platform/printing/jobs/${jobId}/reprints`, {
        method: 'POST', body: JSON.stringify({ copies }),
      },
    ),
    recordsByEncounter: (encounterId: string) => client.request<PrintRecord[]>(
      `/api/platform/printing/records?encounterId=${encodeURIComponent(encounterId)}`,
    ),
    clinicalPrintCandidates: (documentType: ClinicalPrintDocumentType, keyword?: string, mediaProfileId?: string) => {
      const query = new URLSearchParams({ documentType })
      if (keyword?.trim()) query.set('keyword', keyword.trim())
      if (mediaProfileId) query.set('mediaProfileId', mediaProfileId)
      return client.request<ClinicalPrintPreparation>(`/api/platform/printing/batches/candidates?${query}`)
    },
    clinicalPrintBatches: () => client.request<ClinicalPrintBatch[]>('/api/platform/printing/batches'),
    clinicalPrintDeviceManagement: () => client.request<ClinicalPrintDeviceManagement>(
      '/api/platform/printing/device-management'),
    createClinicalPrintDevice: (value: SaveClinicalPrintDevice) => client.request<ClinicalPrintDevice>(
      '/api/platform/printing/devices', { method: 'POST', body: JSON.stringify(value) }),
    updateClinicalPrintDevice: (deviceId: string, value: SaveClinicalPrintDevice) =>
      client.request<ClinicalPrintDevice>(`/api/platform/printing/devices/${deviceId}`, {
        method: 'PUT', body: JSON.stringify(value),
      }),
    bindClinicalPrintDevice: (value: { expectedRevision: number; documentType: RoutedPrintDocumentType
      mediaProfileId: string; deviceId: string }) => client.request<ClinicalPrintDeviceBinding>(
      '/api/platform/printing/device-bindings', { method: 'POST', body: JSON.stringify(value) }),
    createClinicalPrintBatch: (value: CreateClinicalPrintBatch) => client.request<ClinicalPrintBatch>(
      '/api/platform/printing/batches', { method: 'POST', body: JSON.stringify(value) }),
    dispatchClinicalPrintBatch: (batchId: string, deviceId?: string | null) => client.request<ClinicalPrintBatch>(
      `/api/platform/printing/batches/${batchId}/dispatch`, {
        method: 'POST', body: JSON.stringify(deviceId ? { deviceId } : {}),
      }),
    clinicalPrintOutput: (downloadUrl: string) => client.download(downloadUrl),
    download,
  }
}
