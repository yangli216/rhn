import type { ApiClient } from './httpClient'
export interface UsageImpactSelection { kind: 'MEDICATION' | 'FREQUENCY' | 'ROUTE' | 'UNIT'; conceptId: string; name?: string }
export interface UsageImpactReference { location: string; conceptId: string | null; code: string | null; system: string | null; version: string | null; fingerprint: string | null; note: string }
export interface UsageImpactDependency { kind: string; id: string; parentId: string | null; name: string; version: string | null; status: string; historical: boolean; relation: string; references: UsageImpactReference[] }
export interface UsageImpactReport {
  scope: UsageImpactSelection & { code: string | null; system: string | null; version: string | null; status: string }
  inspectedAt: string; organizationId: string | null; departmentId: string | null
  coverage: { area: string; coverage: string; activeCount: string | number | null; references: string[]; ruleRetestRequired: boolean; note: string }[]
  limitations: string[]; totals: Record<string, number>; historicalCount: number; potentialCount: number
  content: UsageImpactDependency[]; totalElements: number; totalPages: number; page: number; size: number
}
export function createClinicalSemanticImpactApi(client: ApiClient) {
  return { references: (scope: UsageImpactSelection, objectKind = 'ALL', includeHistory = true, page = 0) => {
    const query = new URLSearchParams({ kind: scope.kind, conceptId: scope.conceptId, objectKind, includeHistory: String(includeHistory), page: String(page), size: '20' })
    return client.request<UsageImpactReport>(`/api/platform/master-data/clinical-semantics/impact/references?${query}`)
  } }
}
