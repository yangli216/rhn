import type { SystemAnnouncement } from '../api/announcementsApi'
import { isIsoInstant } from '../validation/instant'

const nonempty = (value: unknown) => typeof value === 'string' && value.trim().length > 0

export function requireAnnouncementSummary(value: { unread: number; importantUnread: number; total: number }) {
  if (![value?.unread, value?.importantUnread, value?.total].every((count) => Number.isSafeInteger(count) && count >= 0)
    || value.importantUnread > value.unread || value.unread > value.total) {
    throw new Error('公告统计不完整或计数不一致，请重新加载。')
  }
  return value
}

export function requirePublishedAnnouncements(values: SystemAnnouncement[]): SystemAnnouncement[] {
  const ids = new Set<string>()
  if (!Array.isArray(values) || values.some((value) => {
    if (!value || !nonempty(value.id) || ids.has(value.id)) return true
    ids.add(value.id)
    const scopeValid = value.scopeType === 'TENANT' ? value.organizationId == null && value.departmentId == null
      : value.scopeType === 'ORGANIZATION' ? nonempty(value.organizationId) && value.departmentId == null
        : value.scopeType === 'DEPARTMENT' && nonempty(value.organizationId) && nonempty(value.departmentId)
    return !scopeValid || ![value.title, value.summary, value.content, value.createdBy, value.publishedBy].every(nonempty)
      || !['GENERAL', 'POLICY', 'MAINTENANCE', 'EMERGENCY'].includes(value.category)
      || !['NORMAL', 'IMPORTANT', 'URGENT'].includes(value.priority) || value.status !== 'PUBLISHED'
      || typeof value.pinned !== 'boolean' || typeof value.read !== 'boolean'
      || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !isIsoInstant(value.createdAt) || !isIsoInstant(value.updatedAt)
      || !isIsoInstant(value.publishAt) || !isIsoInstant(value.publishedAt)
      || Date.parse(value.publishedAt) < Date.parse(value.createdAt)
      || Date.parse(value.publishedAt) < Date.parse(value.publishAt)
      || Date.parse(value.updatedAt) < Date.parse(value.publishedAt)
      || (value.expireAt != null && (!isIsoInstant(value.expireAt) || Date.parse(value.expireAt) <= Date.parse(value.publishAt)))
      || value.withdrawnAt != null || value.withdrawnBy != null
  })) throw new Error('公告数据不完整或发布状态与凭据不一致，请重新加载核实。')
  return values
}
