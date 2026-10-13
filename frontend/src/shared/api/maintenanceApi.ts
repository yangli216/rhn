import type { components } from './generated'
import type { ApiClient } from './httpClient'

export type MaintenanceWorkspace = components['schemas']['MaintenanceWorkspace']
export type MaintenanceScopeRequest = components['schemas']['MaintenanceScopeRequest']
export type MaintenanceBatch = components['schemas']['MaintenanceBatchView']
export type MaintenancePlan = components['schemas']['MaintenancePlanView']
export type MaintenanceTask = components['schemas']['MaintenanceTaskView']
export type MaintenanceAudit = components['schemas']['MaintenanceAuditView']
export type MaintenanceCandidate = components['schemas']['MaintenanceRootCandidate']
export type MaintenanceBatchRequest = components['schemas']['MaintenanceBatchRequest']
export type MaintenancePreviewRequest = components['schemas']['MaintenancePreviewRequest']
export type MaintenanceLifecycleRequest = components['schemas']['MaintenanceLifecycleRequest']
export type MaintenanceExecuteRequest = components['schemas']['MaintenanceExecuteRequest']
export type MaintenanceParameterOptions = components['schemas']['ParameterInitializationOptions']

export function createMaintenanceApi(client: ApiClient) {
  const base = '/api/platform/maintenance'
  const post = <T>(path: string, body?: unknown) => client.request<T>(base + path,
    { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
  return {
    lifecycle: (body: MaintenanceLifecycleRequest) => post('/lifecycle', body),
    workspace: () => client.request<MaintenanceWorkspace>(base + '/workspace'),
    batches: () => client.request<MaintenanceBatch[]>(base + '/batches'),
    registerBatch: (body: MaintenanceBatchRequest) => post<MaintenanceBatch>('/batches', body),
    candidates: (scope: MaintenanceScopeRequest, query: string) => post<MaintenanceCandidate[]>('/candidates', { scope, query }),
    parameterOptions: () => client.request<MaintenanceParameterOptions>(base + '/parameters/options'),
    catalogTemplate: () => client.download(base + '/catalog/template?format=XLSX'),
    preview: (body: MaintenancePreviewRequest) => post<MaintenancePlan>('/plans', body),
    execute: (id: string, body: MaintenanceExecuteRequest) => post<MaintenanceTask>(`/plans/${id}/execute`, body),
    tasks: () => client.request<MaintenanceTask[]>(base + '/tasks'),
    audit: (id: string) => client.request<MaintenanceAudit[]>(`${base}/tasks/${id}/audit`),
    cancel: (id: string) => post<MaintenanceTask>(`/tasks/${id}/cancel`),
    retryVerification: (id: string) => post<MaintenanceTask>(`/tasks/${id}/retry-verification`),
    backup: (id: string) => client.download(`${base}/tasks/${id}/backup`),
  }
}
