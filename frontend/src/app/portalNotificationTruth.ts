import type { PortalNotification } from '../shared/api/portalApi'
import { isIsoInstant as timestamp } from '../shared/validation/instant'

export function requirePortalNotifications(value: PortalNotification[]): PortalNotification[] {
  const nonempty = (text: unknown): text is string => typeof text === 'string' && text.trim().length > 0
  const ids = new Set<string>()
  if (!Array.isArray(value) || value.some((item) => {
    if (!item || !nonempty(item.id) || ids.has(item.id)) return true
    ids.add(item.id)
    return !nonempty(item.title) || !nonempty(item.message) || !nonempty(item.category)
      || !nonempty(item.sourceType) || !nonempty(item.sourceId)
      || !['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(item.severity)
      || !['UNREAD', 'READ'].includes(item.status)
      || !timestamp(item.createdAt) || !Number.isSafeInteger(item.revision) || item.revision < 0
      || (item.routePath != null && (typeof item.routePath !== 'string' || !item.routePath.startsWith('/')))
      || (item.status === 'READ' && !timestamp(item.readAt))
      || (item.status === 'UNREAD' && item.readAt != null)
      || (item.readAt != null && Date.parse(item.readAt) < Date.parse(item.createdAt))
  })) throw new Error('消息列表返回不完整或状态不一致，请重新加载。')
  return value
}
