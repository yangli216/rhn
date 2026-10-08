import type { PresenceSummary, PresenceUserPage, PresenceTrend, PresenceTerminationResult } from '../api/presenceApi'
import { isIsoInstant } from '../validation/instant'

const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const countsValid = (value: { onlineUsers: number; activeUsers: number; onlineContexts: number; connections: number }) =>
  [value.onlineUsers, value.activeUsers, value.onlineContexts, value.connections].every(count)
  && value.activeUsers <= value.onlineUsers && value.onlineUsers <= value.onlineContexts
  && value.onlineContexts <= value.connections && (value.onlineUsers === 0) === (value.connections === 0)
const instancesValid = (value: { instances: number; connections: number }) => count(value.instances)
  && value.instances <= value.connections && (value.instances === 0) === (value.connections === 0)

export function requirePresenceSummary(value: PresenceSummary): PresenceSummary {
  if (!value || !countsValid(value) || !instancesValid(value) || !isIsoInstant(value.asOf)
    || !Array.isArray(value.organizations) || !Array.isArray(value.departments)) {
    throw new Error('在线统计不完整或计数不一致，请重新加载。')
  }
  for (const [scopes, type] of [[value.organizations, 'ORGANIZATION'], [value.departments, 'DEPARTMENT']] as const) {
    const ids = new Set<string>()
    if (scopes.some((scope) => {
      if (!scope || scope.scopeType !== type || !text(scope.organizationId) || !text(scope.name)
        || (type === 'DEPARTMENT' ? !text(scope.departmentId) : scope.departmentId != null)
        || !countsValid(scope) || scope.connections > value.connections || scope.onlineUsers > value.onlineUsers) return true
      const key = `${scope.organizationId}:${scope.departmentId ?? ''}`
      if (ids.has(key)) return true
      ids.add(key); return false
    }) || scopes.reduce((total, scope) => total + scope.connections, 0) > value.connections) {
      throw new Error('在线分布数据不完整或重复，请重新加载。')
    }
  }
  return value
}

export function requirePresenceUsers(value: PresenceUserPage, page: number, size: number, activeOnly: boolean): PresenceUserPage {
  const keys = new Set<string>()
  if (!value || !count(value.total) || value.page !== page || value.size !== size || !isIsoInstant(value.asOf)
    || !Array.isArray(value.items) || value.items.length !== Math.max(0, Math.min(size, value.total - page * size))
    || value.items.some((user) => {
      if (!user || ![user.userId, user.username, user.organizationId, user.organizationName, user.departmentName].every(text)
        || (user.departmentId != null && !text(user.departmentId)) || typeof user.active !== 'boolean'
        || (activeOnly && !user.active) || !count(user.connectionCount) || user.connectionCount < 1
        || ![user.connectedAt, user.lastSeenAt, user.lastActivityAt].every(isIsoInstant)
        || Date.parse(user.lastSeenAt) < Date.parse(user.connectedAt)
        || Date.parse(user.lastActivityAt) < Date.parse(user.connectedAt)) return true
      const key = `${user.userId}:${user.organizationId}:${user.departmentId ?? ''}`
      if (keys.has(key)) return true
      keys.add(key); return false
    })) throw new Error('在线名单不完整或分页、状态不一致，请重新加载。')
  return value
}

export function requirePresenceTrend(value: PresenceTrend, organizationId: string, departmentId: string,
  from: string, to: string): PresenceTrend {
  let previous = -Infinity
  if (!value || value.scopeType !== 'DEPARTMENT' || value.organizationId !== organizationId || value.departmentId !== departmentId
    || !isIsoInstant(value.from) || !isIsoInstant(value.to) || Date.parse(value.from) !== Date.parse(from)
    || Date.parse(value.to) !== Date.parse(to) || !Array.isArray(value.points) || value.points.some((point) => {
      if (!point || !isIsoInstant(point.bucketAt) || !countsValid(point) || !instancesValid(point)) return true
      const time = Date.parse(point.bucketAt)
      if (time <= previous || time < Date.parse(from) || time > Date.parse(to)) return true
      previous = time; return false
    })) throw new Error('在线趋势范围或采样数据异常，请重新加载。')
  return value
}

export function requirePresenceTermination(value: PresenceTerminationResult, userId: string): PresenceTerminationResult {
  if (!value || value.userId !== userId || !count(value.revokedSessions) || !count(value.affectedConnections)
    || !isIsoInstant(value.terminatedAt)) throw new Error('下线结果缺少有效回执，请刷新在线名单核实。')
  return value
}
