import type { PortalSummary } from '../../shared/api/portalApi'

export function requirePortalSummary(value: PortalSummary): PortalSummary {
  const counts = [value?.activeResidents, value?.registeredToday, value?.inProgress, value?.completedToday,
    value?.tasks?.ready, value?.tasks?.inProgress, value?.tasks?.overdue, value?.tasks?.totalOpen,
    value?.notifications?.unread, value?.notifications?.total]
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('工作台摘要返回不完整或计数无效，请重新加载。')
  }
  if (value.tasks.ready + value.tasks.inProgress !== value.tasks.totalOpen
    || value.tasks.overdue > value.tasks.totalOpen || value.notifications.unread > value.notifications.total) {
    throw new Error('工作台摘要计数不一致，请重新加载。')
  }
  return value
}
