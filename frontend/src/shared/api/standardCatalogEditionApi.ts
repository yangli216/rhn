import type { ApiClient } from './httpClient'
import type { StandardCatalogSourceReview, StandardCatalogIdentity, StandardCatalogReviewChange } from './masterDataApi'
import type { StandardImpactItem } from './medicationStandardImpactApi'
export interface CatalogEdition { id: string; identity: StandardCatalogIdentity; packageHash: string; declaredContentHash: string; fileName: string; reason: string; actorId: string | null; actor: string; importedAt: string | null; entries: number; specifications: number; issues: number; runtime: boolean; origin: string; baselineId: string | null }
export interface EditionPage<T> { content: T[]; totalElements: number; totalPages: number; page: number; size: number }
export interface CatalogEditionDetail { edition: CatalogEdition; source: Record<string, unknown>; review: StandardCatalogSourceReview; notices: string[] }
export interface CatalogEditionChange { group: string; objectId: string; name: string; operation: string; path: string; before: unknown; after: unknown }
export interface CatalogEditionComparison { base: CatalogEdition; target: CatalogEdition; fingerprint: string; counts: Record<string, number>; changes: EditionPage<CatalogEditionChange> }
export interface CatalogEditionDependencies { target: CatalogEdition; fingerprint: string; coverage: string[]; limitations: string[]; items: EditionPage<StandardImpactItem> }
export function createStandardCatalogEditionApi(client: ApiClient) {
  const root = '/api/platform/master-data/medication-standard-catalog/editions'
  return {
    runtime: () => client.request<CatalogEdition>(`${root}/runtime`),
    list: (page = 0) => client.request<EditionPage<CatalogEdition>>(`${root}?page=${page}`),
    detail: (id: string, reviewPage = 0) => client.request<CatalogEditionDetail>(`${root}/${encodeURIComponent(id)}?reviewPage=${reviewPage}`),
    register: (input: { fileName: string; content: string; reason: string; expectedRuntimeHash: string }) => client.request<CatalogEditionDetail>(root, { method: 'POST', body: JSON.stringify(input) }),
    original: (id: string) => client.request<{ fileName: string; content: string; packageHash: string }>(`${root}/${encodeURIComponent(id)}/original`),
    content: (id: string) => client.request<Record<string, unknown>>(`${root}/${encodeURIComponent(id)}/content`),
    compare: (id: string, base: string, page: number, group: string) => client.request<CatalogEditionComparison>(`${root}/${encodeURIComponent(id)}/comparison?${new URLSearchParams({ base, page: String(page), group })}`),
    dependencies: (id: string, page: number) => client.request<CatalogEditionDependencies>(`${root}/${encodeURIComponent(id)}/dependencies?page=${page}`),
    review: (id: string, input: StandardCatalogReviewChange) => client.request<CatalogEditionDetail>(`${root}/${encodeURIComponent(id)}/source-review`, { method: 'POST', body: JSON.stringify(input) }),
  }
}
