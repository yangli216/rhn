import type { DiagnosticTemplateVersion } from './diagnosticTemplateTypes'
import type { ApiClient } from './httpClient'

export type DiagnosticReportStatus = 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'CANCELLED'

export interface ExternalMessageReceipt {
  id: string
  revision: number
  endpointCode: string
  direction: 'INBOUND' | 'OUTBOUND'
  messageType: string
  businessMessageId: string
  correlationId?: string
  status: 'PENDING' | 'SENT' | 'FAILED' | 'ACKNOWLEDGED' | 'REJECTED' | 'RECEIVED' | 'PROCESSED'
  organizationId: string
  departmentId: string
  payloadDigestAlgorithm: string
  payloadDigest: string
  relatedResourceType?: string
  relatedResourceId?: string
  relatedResourceVersion?: number
  createdAt: string
  sentAt?: string
  receivedAt?: string
  processedAt?: string
  errorCode?: string
  errorMessage?: string
  duplicate: boolean
}

export interface DiagnosticObservation {
  id: string
  sortOrder: number
  codeSystemUri: string
  codeRelease?: string
  observationCode: string
  observationName: string
  status: DiagnosticReportStatus
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'CODE' | 'DATETIME'
  effectiveAt: string
  valueString?: string
  valueNumber?: number
  valueBoolean?: boolean
  valueCode?: string
  valueDateTime?: string
  unitCode?: string
  referenceRangeLow?: number
  referenceRangeHigh?: number
  interpretationCode?: string
  performerCode?: string
  performerName?: string
  valueComparator?: 'EQ' | 'LT' | 'LE' | 'GT' | 'GE'
  ruleStatus?: string
  ruleSnapshot?: string
}

export interface DiagnosticReport {
  id: string
  residentId: string
  encounterId: string
  requestId: string
  endpointCode: string
  externalReportId: string
  reportVersion: number
  replacesReportId?: string
  reportType: 'LABORATORY' | 'IMAGING'
  status: DiagnosticReportStatus
  reportCode: string
  reportName: string
  issuedAt: string
  receivedAt: string
  conclusion?: string
  findings?: string
  authorId?: string
  signerId?: string
  signerName?: string
  selfVerified?: boolean
  correctionReason?: string
  doubleSignatureRequired?: boolean
  images?: DiagnosticImage[]
  templateVersionId?: string
  templateSnapshot?: string
  authorCode?: string
  authorName?: string
  contentDigestAlgorithm: string
  contentDigest: string
  inboundMessageId: string
  observations: DiagnosticObservation[]
}

export interface CriticalValueAlert {
  id: string
  revision: number
  reportId: string
  observationId: string
  residentId: string
  encounterId: string
  requestId: string
  organizationId: string
  departmentId: string
  recipientUserId: string
  severity: 'CRITICAL'
  observationCode: string
  observationName: string
  triggerEvidence: string
  status: 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED' | 'ESCALATED' | 'SUPERSEDED'
  detectedAt: string
  acknowledgeDeadlineAt: string
  acknowledgedBy?: string | null
  acknowledgedAt?: string | null
  acknowledgeNote?: string | null
  closedBy?: string | null
  closedAt?: string | null
  dispositionCode?: string | null
  closeNote?: string | null
  supersededByReportId?: string | null
  escalationLevel: number
}

export type DiagnosticTaskStatus = 'WAITING_SETTLEMENT' | 'READY' | 'COLLECTED' | 'IN_PROGRESS'
  | 'COMPLETED' | 'CANCELLED' | 'EXCEPTION'

export interface DiagnosticExecutionTask {
  id: string
  revision: number
  taskNo: string | null
  requestNo: string
  requestType: 'LABORATORY' | 'EXAMINATION'
  status: DiagnosticTaskStatus
  residentId: string
  residentName: string
  healthRecordNo: string
  gender?: 'MALE' | 'FEMALE' | 'UNKNOWN'
  genderText?: string
  birthDate?: string
  /** 检查申请所选部位，按开立顺序以顿号连接；未选部位为空。 */
  bodySiteText?: string | null
  encounterId: string
  requestId: string
  organizationId: string
  departmentId: string
  settlementId?: string
  reportId?: string
  itemCode: string
  itemName: string
  specimenType?: string
  examinationType?: string
  examinationTypeText?: string
  createdAt: string
  collectedAt?: string
  specimenNo?: string
  collectionNote?: string
  startedAt?: string
  completedAt?: string
  completionNote?: string
  exceptionNote?: string
}

export interface LocalDiagnosticReportInput {
  expectedRevision: number
  valueType?: 'NUMBER' | 'STRING'
  observationValue?: string
  unitCode?: string
  referenceRangeLow?: number
  referenceRangeHigh?: number
  interpretationCode?: 'N' | 'H' | 'HH' | 'L' | 'LL' | 'A' | 'CRITICAL' | 'PANIC'
  conclusion?: string
  findings?: string
  observations?: LocalDiagnosticObservationInput[]
  expectedDraftRevision?: number
  correctionReason?: string
  commandId?: string
  templateVersionId?: string
  templateSnapshot?: string
}

export interface LocalDiagnosticObservationInput {
  observationCode: string
  observationName: string
  valueType: 'NUMBER' | 'STRING' | 'CODE'
  observationValue: string
  unitCode?: string
  referenceRangeLow?: number
  referenceRangeHigh?: number
  interpretationCode?: LocalDiagnosticReportInput['interpretationCode']
  valueComparator?: DiagnosticObservation['valueComparator']
  instrumentCode?: string
  populationCode?: string
  ruleStatus?: string
  ruleSnapshot?: string
}

export interface DiagnosticWorklistPage {
  content: DiagnosticExecutionTask[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface DiagnosticReportQueryRow {
  id: string; taskId?: string; residentId: string; residentName?: string; healthRecordNo?: string
  encounterId: string; requestId: string; requestNo?: string; itemCode?: string; itemName?: string; specimenNo?: string
  reportCode: string; reportName: string; reportVersion: number; replacesReportId?: string
  reportType: 'LABORATORY' | 'IMAGING'; status: DiagnosticReportStatus; issuedAt: string; signerName?: string; current: boolean
}
export interface DiagnosticReportQueryFilters {
  keyword: string; status?: DiagnosticReportStatus; issuedFrom?: string; issuedBefore?: string
}
export interface DiagnosticReportQueryPage {
  content: DiagnosticReportQueryRow[]; totalElements: number; totalPages: number; page: number; size: number
}

export interface DiagnosticWorklistFilters {
  activeAndRecent?: boolean
  status?: DiagnosticTaskStatus
  createdFrom?: string
  createdBefore?: string
}

export interface DiagnosticReportDraft {
  revision: number
  content?: LocalDiagnosticReportInput
  authorId?: string
  authorName?: string
  updatedAt?: string
  doubleSignatureRequired: boolean
}

export interface DiagnosticSpecimen {
  id: string; revision: number; specimenNo: string; specimenType: string; specimenName: string
  containerCode?: string; containerName?: string; status: 'READY' | 'COLLECTED' | 'RECEIVED' | 'REJECTED'
  collectedAt?: string; receivedAt?: string; rejectionReason?: string; previousSpecimenId?: string; taskIds: string[]
}

/** 后端按主数据分管规则试算的标本容器与管数，与生成条码时实际结果一致。 */
export interface DiagnosticSpecimenPlanGroup {
  groupCode: string; specimenCode?: string; specimenName: string; containerCode?: string; containerName?: string
  sharingMode: string; tubeCount: number; taskIds: string[]
}
export interface DiagnosticSpecimenPlan { groups: DiagnosticSpecimenPlanGroup[] }

export interface DiagnosticImage {
  id: string; contentHash: string; mediaType: 'image/jpeg' | 'image/png'; byteSize: number
  width: number; height: number; caption?: string; uploadedBy: string; uploadedAt: string
}

export function createDiagnosticsApi(client: ApiClient) {
  return {
    reportTemplate: (taskId: string) => client.request<DiagnosticTemplateVersion | null>(`/api/diagnostics/tasks/${taskId}/report-template`),
    draftImages: (taskId: string) => client.request<DiagnosticImage[]>(`/api/diagnostics/tasks/${taskId}/images`),
    uploadImage: (taskId: string, expectedRevision: number, expectedDraftRevision: number,
      commandId: string, file: File, caption: string) => {
      const body = new FormData()
      body.set('file', file); body.set('expectedRevision', String(expectedRevision))
      body.set('expectedDraftRevision', String(expectedDraftRevision)); body.set('commandId', commandId); body.set('caption', caption)
      return client.request<DiagnosticImage>(`/api/diagnostics/tasks/${taskId}/images`, { method: 'POST', body })
    },
    removeImage: (taskId: string, imageId: string, expectedRevision: number, expectedDraftRevision: number) =>
      client.request<void>(`/api/diagnostics/tasks/${taskId}/images/${imageId}`, {
        method: 'DELETE', body: JSON.stringify({ expectedRevision, expectedDraftRevision }),
      }),
    draftImageContent: (taskId: string, imageId: string) =>
      client.download(`/api/diagnostics/tasks/${taskId}/images/${imageId}/content`),
    reportImageContent: (reportId: string, imageId: string) =>
      client.download(`/api/diagnostics/reports/${reportId}/images/${imageId}/content`),
    task: (taskId: string) => client.request<DiagnosticExecutionTask>(`/api/diagnostics/tasks/${taskId}`),
    specimens: (taskId: string) => client.request<DiagnosticSpecimen[]>(`/api/diagnostics/tasks/${taskId}/specimens`),
    scanSpecimen: (specimenNo: string) => client.request<DiagnosticSpecimen>(`/api/diagnostics/specimens/scan?${new URLSearchParams({ specimenNo })}`),
    generateSpecimens: (tasks: { taskId: string; expectedRevision: number; specimenConfigurationId?: string }[], commandId: string) =>
      client.request<DiagnosticSpecimen[]>('/api/diagnostics/specimens', { method: 'POST', body: JSON.stringify({ tasks, commandId }) }),
    specimenPlan: (tasks: { taskId: string; specimenConfigurationId?: string }[]) =>
      client.request<DiagnosticSpecimenPlan>('/api/diagnostics/specimens/plan', { method: 'POST', body: JSON.stringify({ tasks }) }),
    collectSpecimen: (id: string, expectedRevision: number) => client.request<DiagnosticSpecimen>(`/api/diagnostics/specimens/${id}/collection`, {
      method: 'POST', body: JSON.stringify({ expectedRevision }) }),
    receiveSpecimen: (id: string, expectedRevision: number) => client.request<DiagnosticSpecimen>(`/api/diagnostics/specimens/${id}/receipt`, {
      method: 'POST', body: JSON.stringify({ expectedRevision }) }),
    rejectSpecimen: (id: string, expectedRevision: number, reason: string) => client.request<DiagnosticSpecimen>(`/api/diagnostics/specimens/${id}/rejection`, {
      method: 'POST', body: JSON.stringify({ expectedRevision, reason }) }),
    recollectSpecimen: (id: string, expectedRevision: number, commandId: string) => client.request<DiagnosticSpecimen>(`/api/diagnostics/specimens/${id}/recollection`, {
      method: 'POST', body: JSON.stringify({ expectedRevision, commandId }) }),
    worklist: (requestType?: 'LABORATORY' | 'EXAMINATION', status?: DiagnosticTaskStatus) => {
      const query = new URLSearchParams()
      if (requestType) query.set('requestType', requestType)
      if (status) query.set('status', status)
      return client.request<DiagnosticExecutionTask[]>(`/api/diagnostics/worklist${query.size ? `?${query}` : ''}`)
    },
    worklistPage: (requestType: 'LABORATORY' | 'EXAMINATION', keyword: string, page: number, size = 20,
      encounterId?: string, residentId?: string, filters?: DiagnosticWorklistFilters) => {
      const query = new URLSearchParams({ requestType, keyword, page: String(page), size: String(size) })
      if (encounterId) query.set('encounterId', encounterId)
      if (residentId) query.set('residentId', residentId)
      if (filters?.activeAndRecent) query.set('activeAndRecent', 'true')
      if (filters?.status) query.set('status', filters.status)
      if (filters?.createdFrom) query.set('createdFrom', filters.createdFrom)
      if (filters?.createdBefore) query.set('createdBefore', filters.createdBefore)
      return client.request<DiagnosticWorklistPage>(`/api/diagnostics/worklist-page?${query}`)
    },
    collect: (taskId: string, expectedRevision: number, specimenNo: string, note?: string) =>
      client.request<DiagnosticExecutionTask>(`/api/diagnostics/tasks/${taskId}/collection`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, specimenNo, note }),
      }),
    start: (taskId: string, expectedRevision: number) =>
      client.request<DiagnosticExecutionTask>(`/api/diagnostics/tasks/${taskId}/start`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
    recordLocalReport: (taskId: string, input: LocalDiagnosticReportInput) =>
      client.request<DiagnosticReport>(`/api/diagnostics/tasks/${taskId}/local-reports`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    draft: (taskId: string) => client.request<DiagnosticReportDraft>(`/api/diagnostics/tasks/${taskId}/report-draft`),
    saveDraft: (taskId: string, input: LocalDiagnosticReportInput) => client.request<DiagnosticReportDraft>(
      `/api/diagnostics/tasks/${taskId}/report-draft`, { method: 'POST', body: JSON.stringify(input) }),
    issueDraft: (taskId: string, expectedRevision: number, expectedDraftRevision: number, commandId: string) =>
      client.request<DiagnosticReport>(`/api/diagnostics/tasks/${taskId}/report-draft/issue`, {
        method: 'POST', body: JSON.stringify({ expectedRevision, expectedDraftRevision, commandId }),
      }),
    dispatch: (requestId: string, endpointCode: 'LIS' | 'PACS') =>
      client.request<ExternalMessageReceipt>(
        `/api/integration/diagnostics/requests/${requestId}/outbound-messages`, {
          method: 'POST', body: JSON.stringify({ endpointCode }),
        },
      ),
    outbound: (endpointCode: 'LIS' | 'PACS') => client.request<ExternalMessageReceipt[]>(
      `/api/integration/diagnostics/outbound-messages?endpointCode=${endpointCode}`,
    ),
    queryReports: (requestType: 'LABORATORY' | 'EXAMINATION', filters: DiagnosticReportQueryFilters, page: number, size = 20) => {
      const query = new URLSearchParams({ requestType, keyword: filters.keyword, page: String(page), size: String(size) })
      if (filters.status) query.set('status', filters.status)
      if (filters.issuedFrom) query.set('issuedFrom', filters.issuedFrom)
      if (filters.issuedBefore) query.set('issuedBefore', filters.issuedBefore)
      return client.request<DiagnosticReportQueryPage>(`/api/diagnostics/reports?${query}`)
    },
    reportHistory: (reportId: string) => client.request<DiagnosticReport[]>(`/api/diagnostics/reports/${reportId}/history`),
    reportsByEncounter: (encounterId: string) => client.request<DiagnosticReport[]>(
      `/api/encounters/${encounterId}/diagnostic-reports`,
    ),
    reportsByRequest: (requestId: string) => client.request<DiagnosticReport[]>(
      `/api/service-requests/${requestId}/diagnostic-reports`,
    ),
    criticalValues: {
      active: () => client.request<CriticalValueAlert[]>('/api/critical-values'),
      acknowledge: (id: string, expectedRevision: number, note?: string) => client.request<CriticalValueAlert>(
        `/api/critical-values/${id}/acknowledge`, {
          method: 'POST', body: JSON.stringify({ expectedRevision, note }),
        },
      ),
      close: (id: string, expectedRevision: number, dispositionCode: string, note?: string) =>
        client.request<CriticalValueAlert>(`/api/critical-values/${id}/close`, {
          method: 'POST', body: JSON.stringify({ expectedRevision, dispositionCode, note }),
        }),
    },
  }
}
