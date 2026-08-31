import type { ApiClient } from './httpClient'

export type AnnouncementScope = 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'
export type AnnouncementCategory = 'GENERAL' | 'POLICY' | 'MAINTENANCE' | 'EMERGENCY'
export type AnnouncementPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT'
export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'WITHDRAWN' | 'EXPIRED'

export interface SystemAnnouncement {
  id: string
  revision: number
  scopeType: AnnouncementScope
  organizationId?: string | null
  departmentId?: string | null
  category: AnnouncementCategory
  priority: AnnouncementPriority
  title: string
  summary: string
  content: string
  pinned: boolean
  status: AnnouncementStatus
  publishAt?: string | null
  expireAt?: string | null
  createdBy: string
  publishedBy?: string | null
  publishedAt?: string | null
  withdrawnBy?: string | null
  withdrawnAt?: string | null
  createdAt: string
  updatedAt: string
  read: boolean
}

export interface AnnouncementDraft {
  scopeType: AnnouncementScope
  organizationId?: string
  departmentId?: string
  category: AnnouncementCategory
  priority: AnnouncementPriority
  title: string
  summary: string
  content: string
  pinned: boolean
}

export function createAnnouncementsApi(client: ApiClient) {
  return {
    active: () => client.request<SystemAnnouncement[]>('/api/announcements'),
    summary: () => client.request<{ unread: number; importantUnread: number; total: number }>(
      '/api/announcements/summary'),
    markRead: (id: string) => client.request<SystemAnnouncement>(`/api/announcements/${id}/read`, { method: 'POST' }),
    management: {
      list: (status = '') => client.request<SystemAnnouncement[]>(
        `/api/announcement-management${status ? `?status=${encodeURIComponent(status)}` : ''}`),
      create: (input: AnnouncementDraft) => client.request<SystemAnnouncement>('/api/announcement-management', {
        method: 'POST', body: JSON.stringify(input),
      }),
      update: (id: string, expectedRevision: number, input: AnnouncementDraft) =>
        client.request<SystemAnnouncement>(`/api/announcement-management/${id}`, {
          method: 'PUT', body: JSON.stringify({ ...input, expectedRevision }),
        }),
      publish: (id: string, expectedRevision: number, publishAt?: string, expireAt?: string) =>
        client.request<SystemAnnouncement>(`/api/announcement-management/${id}/publish`, {
          method: 'POST', body: JSON.stringify({ expectedRevision, publishAt, expireAt }),
        }),
      withdraw: (id: string, expectedRevision: number) =>
        client.request<SystemAnnouncement>(`/api/announcement-management/${id}/withdraw`, {
          method: 'POST', body: JSON.stringify({ expectedRevision }),
        }),
    },
  }
}
