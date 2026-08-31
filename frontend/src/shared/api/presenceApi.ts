import type { ApiClient } from './httpClient'

export interface PresenceScopeSummary {
  scopeType: 'ORGANIZATION' | 'DEPARTMENT'
  organizationId: string
  departmentId?: string | null
  name: string
  onlineUsers: number
  activeUsers: number
  onlineContexts: number
  connections: number
}

export interface PresenceSummary {
  onlineUsers: number
  activeUsers: number
  onlineContexts: number
  connections: number
  instances: number
  asOf: string
  organizations: PresenceScopeSummary[]
  departments: PresenceScopeSummary[]
}

export interface PresenceUser {
  userId: string
  username: string
  practitionerId?: string | null
  organizationId: string
  organizationName: string
  departmentId?: string | null
  departmentName: string
  active: boolean
  connectedAt: string
  lastSeenAt: string
  lastActivityAt: string
  connectionCount: number
}

export interface PresenceUserPage {
  total: number
  page: number
  size: number
  asOf: string
  items: PresenceUser[]
}

export interface PresenceTrendPoint {
  bucketAt: string
  onlineUsers: number
  activeUsers: number
  onlineContexts: number
  connections: number
  instances: number
}

export interface PresenceTrend {
  scopeType: 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'
  organizationId?: string | null
  departmentId?: string | null
  from: string
  to: string
  points: PresenceTrendPoint[]
}

export interface PresenceTerminationResult {
  userId: string
  revokedSessions: number
  affectedConnections: number
  terminatedAt: string
}

export function createPresenceApi(client: ApiClient) {
  return {
    summary: () => client.request<PresenceSummary>('/api/presence/summary'),
    users: (query = '', activeOnly = false, page = 0, size = 50) => {
      const parameters = new URLSearchParams({ page: String(page), size: String(size) })
      if (query.trim()) parameters.set('query', query.trim())
      if (activeOnly) parameters.set('activeOnly', 'true')
      return client.request<PresenceUserPage>(`/api/presence/users?${parameters}`)
    },
    trend: (scopeType: PresenceTrend['scopeType'], organizationId: string | undefined,
      departmentId: string | undefined, from: string, to: string) => {
      const parameters = new URLSearchParams({ scopeType, from, to })
      if (organizationId) parameters.set('organizationId', organizationId)
      if (departmentId) parameters.set('departmentId', departmentId)
      return client.request<PresenceTrend>(`/api/presence/trend?${parameters}`)
    },
    terminate: (userId: string, reason: string) => client.request<PresenceTerminationResult>(
      `/api/presence/users/${userId}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) }),
    activity: () => client.request<void>('/api/presence/activity', { method: 'POST' }),
  }
}
