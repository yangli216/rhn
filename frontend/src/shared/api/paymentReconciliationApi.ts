import type { ApiClient } from './httpClient'
import type { components } from './generated'

type Schemas = components['schemas']
type Wire<K extends keyof Schemas> = Required<Schemas[K]>
type PageProjection<View, Item> = Omit<Required<View>, 'content'> & { content: Item[] }
export type ReconciliationCapability = Wire<'StatementCapability'>
export type ReconciliationChannel = Omit<Wire<'PaymentReconciliationChannelView'>, 'capability'> & { capability: ReconciliationCapability }
export type ReconciliationPolicy = Wire<'PaymentReconciliationPolicyView'>
export type ReconciliationPolicyUpdate = Wire<'PaymentReconciliationPolicyUpdate'>
export type ReconciliationBatch = Wire<'PaymentReconciliationBatchView'>
export type ReconciliationTask = Omit<Wire<'PaymentReconciliationTaskView'>, 'latestBatch'> & { latestBatch?: ReconciliationBatch }
export type ReconciliationItem = Wire<'PaymentReconciliationItemView'>
export type ReconciliationFile = Wire<'PaymentReconciliationFileView'>
export type ReconciliationAttempt = Wire<'PaymentReconciliationAttemptView'>
export type ReconciliationEvent = Wire<'PaymentReconciliationEventView'>
export type ReconciliationUnallocated = Wire<'PaymentReconciliationUnallocatedView'>
export type ReconciliationVerification = Wire<'PaymentReconciliationVerificationView'>
export type ReconciliationTaskDetail = Omit<Wire<'PaymentReconciliationTaskDetail'>, 'task' | 'versions' | 'files' | 'attempts'> & {
  task: ReconciliationTask; versions: ReconciliationBatch[]; files: ReconciliationFile[]; attempts: ReconciliationAttempt[]
}
export type ReconciliationTaskPage = PageProjection<Schemas['PageResultPaymentReconciliationTaskView'], ReconciliationTask>
export type ReconciliationItemPage = PageProjection<Schemas['PageResultPaymentReconciliationItemView'], ReconciliationItem>
export type ReconciliationUnallocatedPage = PageProjection<Schemas['PageResultPaymentReconciliationUnallocatedView'], ReconciliationUnallocated>
export type ReconciliationVersionCommand = Wire<'PaymentReconciliationVersionCommand'>
export type ReconciliationReasonCommand = Wire<'PaymentReconciliationReasonCommand'>
export type ReconciliationReviewCommand = Wire<'PaymentReconciliationReviewCommand'>

export function createPaymentReconciliationApi(client: ApiClient) {
  const base = '/api/billing/reconciliation'
  return {
    reconciliationChannels: () => client.request<ReconciliationChannel[]>(`${base}/channels`),
    reconciliationPolicy: (method: string, organizationId?: string) => client.request<ReconciliationPolicy>(`${base}${organizationId ? `/organizations/${encodeURIComponent(organizationId)}` : ''}/policies/${encodeURIComponent(method)}`),
    saveReconciliationPolicy: (method: string, input: ReconciliationPolicyUpdate, organizationId?: string) => client.request<ReconciliationPolicy>(`${base}${organizationId ? `/organizations/${encodeURIComponent(organizationId)}` : ''}/policies/${encodeURIComponent(method)}`, { method: 'PUT', body: JSON.stringify(input) }),
    reconciliationTasks: (method: string, from: string, to: string, page = 0, status = '') => client.request<ReconciliationTaskPage>(`${base}/tasks?${new URLSearchParams({ paymentMethodCode: method, from, to, page: String(page), size: '25', ...(status ? { status } : {}) })}`),
    reconciliationTask: (id: string) => client.request<ReconciliationTaskDetail>(`${base}/tasks/${id}`),
    createReconciliationTask: (paymentMethodCode: string, businessDate: string, commandCode: string) => client.request<ReconciliationTask>(`${base}/tasks`, { method: 'POST', body: JSON.stringify({ paymentMethodCode, businessDate, commandCode }) }),
    retryReconciliationTask: (id: string, input: ReconciliationVersionCommand) => client.request<ReconciliationTask>(`${base}/tasks/${id}/retry`, { method: 'POST', body: JSON.stringify(input) }),
    reconciliationItems: (id: string, differencesOnly = true, page = 0) => client.request<ReconciliationItemPage>(`${base}/batches/${id}/items?${new URLSearchParams({ differencesOnly: String(differencesOnly), page: String(page), size: '25' })}`),
    reconciliationItemEvents: (id: string) => client.request<ReconciliationEvent[]>(`${base}/items/${id}/events`),
    proposeReconciliationItem: (id: string, input: ReconciliationReasonCommand) => client.request<void>(`${base}/items/${id}/propose`, { method: 'POST', body: JSON.stringify(input) }),
    reviewReconciliationItem: (id: string, input: ReconciliationReviewCommand) => client.request<void>(`${base}/items/${id}/review`, { method: 'POST', body: JSON.stringify(input) }),
    queryReconciliationItem: (id: string, input: ReconciliationVersionCommand) => client.request<ReconciliationVerification>(`${base}/items/${id}/query`, { method: 'POST', body: JSON.stringify(input) }),
    closeReconciliationBatch: (id: string, input: ReconciliationReasonCommand) => client.request<void>(`${base}/batches/${id}/close`, { method: 'POST', body: JSON.stringify(input) }),
    unallocatedReconciliationRows: (id: string, page = 0) => client.request<ReconciliationUnallocatedPage>(`${base}/tasks/${id}/unallocated?page=${page}&size=25`),
    proposeUnallocatedReconciliationRow: (id: string, input: ReconciliationReasonCommand) => client.request<void>(`${base}/unallocated/${id}/propose`, { method: 'POST', body: JSON.stringify(input) }),
    reviewUnallocatedReconciliationRow: (id: string, input: ReconciliationReviewCommand) => client.request<void>(`${base}/unallocated/${id}/review`, { method: 'POST', body: JSON.stringify(input) }),
    exportReconciliationBatch: (id: string) => client.download(`${base}/batches/${id}/export`),
    exportReconciliationEvidence: (id: string, fileId: string) => client.download(`${base}/tasks/${id}/files/${fileId}/export`),
  }
}
