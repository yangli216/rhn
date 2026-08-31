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
  taskNo: string
  requestType: 'LABORATORY' | 'EXAMINATION'
  status: DiagnosticTaskStatus
  residentId: string
  residentName: string
  healthRecordNo: string
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
}

export function createDiagnosticsApi(client: ApiClient) {
  return {
    worklist: (requestType?: 'LABORATORY' | 'EXAMINATION', status?: DiagnosticTaskStatus) => {
      const query = new URLSearchParams()
      if (requestType) query.set('requestType', requestType)
      if (status) query.set('status', status)
      return client.request<DiagnosticExecutionTask[]>(`/api/diagnostics/worklist${query.size ? `?${query}` : ''}`)
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
    dispatch: (requestId: string, endpointCode: 'LIS' | 'PACS') =>
      client.request<ExternalMessageReceipt>(
        `/api/integration/diagnostics/requests/${requestId}/outbound-messages`, {
          method: 'POST', body: JSON.stringify({ endpointCode }),
        },
      ),
    outbound: (endpointCode: 'LIS' | 'PACS') => client.request<ExternalMessageReceipt[]>(
      `/api/integration/diagnostics/outbound-messages?endpointCode=${endpointCode}`,
    ),
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
