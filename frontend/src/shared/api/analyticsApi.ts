import { createAnalysisPagesApi } from './analysisPagesApi'
import { createSemanticOntologyApi } from './semanticOntologyApi'
import type { components } from './generated'
import type { ApiClient } from './httpClient'

export type AnalyticsCapabilities = components['schemas']['AnalyticsCapabilities']

export function createAnalyticsApi(client: ApiClient) {
  return {
    ...createAnalysisPagesApi(client),
    ...createSemanticOntologyApi(client),
    aiStatus: () => client.request<{ available: boolean; model: string | null; message: string }>('/api/analytics/pilot/ai-status'),
    interpret: (text: string, base: components['schemas']['PilotAnalysisQuery'], chart: string) => client.request<{
      status: 'READY' | 'UNSUPPORTED' | 'CLARIFY'; message: string; query: components['schemas']['PilotAnalysisQuery'] | null; chart: 'BAR' | 'LINE' | 'TABLE' | null
    }>('/api/analytics/pilot/interpret', { method: 'POST', body: JSON.stringify({ text, base, chart }) }),
    query: (query: components['schemas']['PilotAnalysisQuery']) => client.request<PilotAnalysisResult>('/api/analytics/pilot/query', { method: 'POST', body: JSON.stringify(query) }),
    saved: () => client.request<PilotAnalysisSaved[]>('/api/analytics/pilot/saved'),
    save: (value: components['schemas']['PilotAnalysisSave']) => client.request<PilotAnalysisSaved>('/api/analytics/pilot/saved', { method: 'POST', body: JSON.stringify(value) }),
    capabilities: () => client.request<AnalyticsCapabilities>('/api/analytics/capabilities'),
  }
}

export type PilotAnalysisResult = components['schemas']['PilotAnalysisResult']
export type PilotAnalysisSaved = components['schemas']['PilotAnalysisSaved']
