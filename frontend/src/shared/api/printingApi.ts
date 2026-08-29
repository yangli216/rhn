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
}

export function createPrintingApi(client: ApiClient) {
  async function download(receipt: PrintReceipt) {
    const blob = await client.download(receipt.downloadUrl)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = receipt.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return {
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
    reprint: (jobId: string, copies = 1) => client.request<PrintReceipt>(
      `/api/platform/printing/jobs/${jobId}/reprints`, {
        method: 'POST', body: JSON.stringify({ copies }),
      },
    ),
    download,
  }
}
