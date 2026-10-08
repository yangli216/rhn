import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../rhnApi'
import { Icon } from '../ui'
import { requirePresenceSummary } from './presenceFacts'

export function PresenceIndicator({ api, contextKey, onNavigate }: {
  api: RhnApi
  contextKey: string
  onNavigate?: (path: string) => void
}) {
  const summary = useQuery({ queryKey: ['presence-summary', contextKey], queryFn: async () => requirePresenceSummary(await api.presence.summary()),
    refetchInterval: 30_000 })
  const value = summary.isSuccess && !summary.isFetching ? summary.data : undefined
  const unavailable = summary.isError ? '在线人数读取失败' : '正在获取在线人数'
  return <button type="button" className="presence-indicator" disabled={!onNavigate}
    aria-label={value ? `在线用户 ${value.onlineUsers} 人` : unavailable}
    onClick={() => onNavigate?.('/settings/presence')}
    title={value ? `${value.onlineUsers} 人在线，${value.activeUsers} 人活跃，${value.connections} 个实时连接，${value.instances} 个服务节点` : unavailable}>
    <span className={`presence-indicator__dot ${!value ? 'is-error' : ''}`} aria-hidden="true" />
    <Icon name="residents" />
    <strong>{value?.onlineUsers ?? '—'}</strong><span>在线</span>
  </button>
}
