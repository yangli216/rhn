import type { Session } from '../model'
import type { ApiClient } from './httpClient'

export function createSessionApi(client: ApiClient) {
  return {
    current: () => client.request<Session>('/api/session'),
    logout: () => client.request<void>('/api/session', { method: 'DELETE' }),
  }
}
