import type { ApiClient, WorkContextSelection } from './httpClient'

export interface WorkContextOption extends WorkContextSelection {
  organizationName: string
  departmentName?: string | null
  workContextType: WorkContextType
  dataScopeType: string
  roleCodes: string[]
  authorities?: string[]
}

export type WorkContextType = 'CLINICAL' | 'PHARMACY' | 'INVENTORY' | 'GENERAL'

export interface TaskSummary {
  ready: number
  inProgress: number
  overdue: number
  totalOpen: number
}

export interface PortalSummary {
  tasks: TaskSummary
  notifications: { unread: number; total: number }
  registeredToday: number
  inProgress: number
  completedToday: number
  activeResidents: number
}

export interface WorkTask {
  id: string
  taskType: string
  title: string
  summary?: string | null
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  status: 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  assigneeType: 'USER' | 'DEPARTMENT'
  residentId?: string | null
  encounterId?: string | null
  routePath?: string | null
  dueAt?: string | null
  claimedBy?: string | null
  claimedAt?: string | null
  completedAt?: string | null
  createdAt: string
  revision: number
}

export interface PortalNotification {
  id: string
  category: string
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  title: string
  message: string
  status: 'UNREAD' | 'READ' | 'ARCHIVED'
  routePath?: string | null
  sourceType: string
  sourceId: string
  createdAt: string
  readAt?: string | null
  revision: number
}

export interface PortalWorkspace {
  defaultOrganizationId?: string | null
  defaultDepartmentId?: string | null
  favoritesJson: string
  tabsJson: string
  layoutJson: string
  revision: number
}

export function createPortalApi(client: ApiClient) {
  return {
    summary: () => client.request<PortalSummary>('/api/portal/summary'),
    workspace: () => client.request<PortalWorkspace>('/api/portal/workspace'),
    saveWorkspace: (value: Omit<PortalWorkspace, 'revision'>) => client.request<PortalWorkspace>('/api/portal/workspace', {
      method: 'PUT', body: JSON.stringify(value),
    }),
    tasks: {
      list: () => client.request<WorkTask[]>('/api/tasks'),
      summary: () => client.request<TaskSummary>('/api/tasks/summary'),
      claim: (id: string) => client.request<WorkTask>(`/api/tasks/${id}/claim`, { method: 'POST' }),
      complete: (id: string, comment = '') => client.request<WorkTask>(`/api/tasks/${id}/complete`, {
        method: 'POST', body: JSON.stringify({ comment }),
      }),
    },
    notifications: {
      list: () => client.request<PortalNotification[]>('/api/notifications'),
      markRead: (id: string) => client.request<PortalNotification>(`/api/notifications/${id}/read`, { method: 'POST' }),
      archive: (id: string) => client.request<void>(`/api/notifications/${id}`, { method: 'DELETE' }),
    },
  }
}
