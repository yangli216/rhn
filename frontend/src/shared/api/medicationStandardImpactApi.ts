import type { ApiClient } from './httpClient'
export interface StandardImpactScope { catalogId: string; entryId?: string; specificationId?: string }
export interface StandardImpactTrace { relation: string; location: string; catalogId: string | null; catalogVersion: string | null; entryId: string | null; specificationId: string | null; contentHash: string | null; reason: string }
export interface StandardImpactItem { kind: string; id: string; parentId: string | null; name: string; version: string | null; status: string; historical: boolean; matchType: string; traces: StandardImpactTrace[]; mode: string | null; organizationId: string | null; departmentId: string | null; effectiveFrom: string | null; effectiveTo: string | null; fingerprint?: string }
export interface StandardImpactReport { scope: StandardImpactScope; inspectedAt: string; totals: Record<string, number>; historicalCount: number; potentialCount: number; coverage: string[]; limitations: string[]; content: StandardImpactItem[]; totalElements: number; totalPages: number; page: number; size: number }
export function createMedicationStandardImpactApi(client: ApiClient) {
  return { inspect: (scope: StandardImpactScope, kind = 'ALL', includeHistory = true, page = 0) => {
    const query = new URLSearchParams({ catalogId: scope.catalogId, kind, includeHistory: String(includeHistory), page: String(page), size: '20' })
    if (scope.entryId) query.set('entryId', scope.entryId)
    if (scope.specificationId) query.set('specificationId', scope.specificationId)
    return client.request<StandardImpactReport>(`/api/quality/medication-standard-impact?${query}`)
  } }
}
