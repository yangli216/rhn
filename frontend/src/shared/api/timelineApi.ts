import type { TimelineEvent } from '../model'
import type { ApiClient } from './httpClient'

export function createTimelineApi(client: ApiClient) {
  return {
    byResident: (residentId: string) => client.request<TimelineEvent[]>(
      `/api/residents/${encodeURIComponent(residentId)}/timeline`,
    ),
  }
}
