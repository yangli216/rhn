import type { ApiClient } from './httpClient'
import type { StandardImpactScope, StandardImpactItem } from './medicationStandardImpactApi'
export interface StandardRevisionImpact { version: string; inspectedAt: string; fingerprint: string; areas: { scope: StandardImpactScope; coverage: string[]; limitations: string[]; dependencies: StandardImpactItem[] }[] }
import type { MedicationStandardBindingPreview, StandardCatalogIdentity, StandardMedicationSpecification } from './masterDataApi'
export interface StandardRevisionLink { id: string; catalogId: string; catalogVersion: string; entryId: string; specificationId: string; contentHash: string; createdBy: string; createdAt: string }
export interface StandardRevisionEvent { id: string; status: string; actorId: string; actor: string; reason: string; recordedAt: string; resultingLinks: StandardRevisionLink[]; proposal: {
  medicationId: string; medicationRevision: number; medication: MedicationStandardBindingPreview['medication']; previousLinks: StandardRevisionLink[]; identity: StandardCatalogIdentity; specificationId: string;
  target: StandardMedicationSpecification & { name: string; entryId: string }; reason: string; impactNotes: string; submittedBy: string; submitter: string; submittedAt: string; impact?: StandardRevisionImpact | null;
} }
export interface StandardRevisionPreview { binding: MedicationStandardBindingPreview; currentLinks: StandardRevisionLink[]; sourceFingerprint: string; eligibleSpecificationIds: string[]; latest: StandardRevisionEvent | null; staleIssues: string[]; allowedActions: string[]; history: StandardRevisionEvent[]; totalEvents: number; historyPage: number; currentImpact?: StandardRevisionImpact | null }
export interface StandardRevisionSubmit { expectedMedicationRevision: number; expectedEventId: string | null; expectedSourceFingerprint: string; identity: StandardCatalogIdentity; specificationId: string; reason: string; impactNotes: string; confirmedIdentity: boolean; expectedImpactFingerprint: string }
export interface StandardRevisionReview { expectedEventId: string; action: string; reason: string; confirmedIdentity: boolean; confirmedImpact: boolean }
export function createMedicationStandardRevisionApi(client: ApiClient) {
  const root = (id: string) => `/api/platform/master-data/medications/${encodeURIComponent(id)}/standard-revision`
  return {
    preview: (id: string, historyPage = 0) => client.request<StandardRevisionPreview>(`${root(id)}?historyPage=${historyPage}`),
    impact: (id: string, specificationId: string) => client.request<StandardRevisionImpact>(`${root(id)}/impact?${new URLSearchParams({ specificationId })}`),
    submit: (id: string, body: StandardRevisionSubmit) => client.request<StandardRevisionPreview>(root(id), { method: 'POST', body: JSON.stringify(body) }),
    review: (id: string, body: StandardRevisionReview) => client.request<StandardRevisionPreview>(`${root(id)}/review`, { method: 'POST', body: JSON.stringify(body) }),
  }
}
