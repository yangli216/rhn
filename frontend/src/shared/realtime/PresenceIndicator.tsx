import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../rhnApi'
import { Icon } from '../ui'

export function PresenceIndicator({ api, contextKey, onNavigate }: {
  api: RhnApi
  contextKey: string
  onNavigate?: (path: string) => void
}) {
  const summary = useQuery({ queryKey: ['presence-summary', contextKey], queryFn: api.presence.summary,
    refetchInterval: 30_000 })
  const value = summary.data
  return <button type="button" className="presence-indicator" disabled={!onNavigate}
    aria-label={value ? `在线用户 ${value.onlineUsers} 人` : '正在获取在线人数'}
    onClick={() => onNavigate?.('/settings/presence')}
    title={value ? `${value.onlineUsers} 人在线，${value.activeUsers} 人活跃，${value.connections} 个实时连接，${value.instances} 个服务节点` : '正在获取在线人数'}>
    <span className={`presence-indicator__dot ${summary.isError ? 'is-error' : ''}`} aria-hidden="true" />
    <Icon name="residents" />
    <strong>{value?.onlineUsers ?? '—'}</strong><span>在线</span>
  </button>
}
