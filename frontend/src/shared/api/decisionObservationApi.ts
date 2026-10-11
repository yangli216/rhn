import type { components } from './generated'
import type { ApiClient } from './httpClient'
export type DecisionObservation = components['schemas']['DecisionObservation']
export type DecisionRunDetail = components['schemas']['DecisionDetail']
export interface DecisionObservationFilter { scene?: string; mode?: string; outcome?: string; from?: string; to?: string; page: number }
export function createDecisionObservationApi(client: ApiClient) {
  const root = '/api/ai/administration/decision-observations'
  return {
    list: (filter: DecisionObservationFilter) => {
      const params = new URLSearchParams({ page: String(filter.page), size: '20' })
      Object.entries(filter).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
      return client.request<DecisionObservation>(`${root}?${params}`)
    },
    detail: (id: string) => client.request<DecisionRunDetail>(`${root}/${encodeURIComponent(id)}`),
    review: (id: string, verdict: string, reason: string) => client.request<components['schemas']['DecisionReview']>(`${root}/${encodeURIComponent(id)}/reviews`, {
      method: 'POST', body: JSON.stringify({ verdict, reason }),
    }),
  }
}
