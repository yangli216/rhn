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

export function createDiagnosticsApi(client: ApiClient) {
  return {
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
  }
}
