import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../format'
import type { WorkContextType } from '../api/portalApi'
import { errorMessage, type RhnApi } from '../rhnApi'
import { Alert, Button, Dialog, EmptyState, IconButton, LoadingState, StatusBadge } from '../ui'

export function CriticalValueCenter({ api, contextKey, workContextType, onNavigate }: {
  api: RhnApi
  contextKey: string
  workContextType: WorkContextType
  onNavigate: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const presented = useRef(new Set<string>())
  const queryClient = useQueryClient()
  const queryKey = ['critical-values', contextKey]
  const alerts = useQuery({ queryKey, queryFn: api.diagnostics.criticalValues.active, refetchInterval: 60_000 })
  const acknowledge = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      api.diagnostics.criticalValues.acknowledge(id, revision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['portal-summary', contextKey] })
      await queryClient.invalidateQueries({ queryKey: ['portal-notifications', contextKey] })
    },
  })

  useEffect(() => {
    const urgent = alerts.data?.filter((value) => value.status === 'OPEN' || value.status === 'ESCALATED') ?? []
    if (urgent.some((value) => !presented.current.has(value.id))) {
      urgent.forEach((value) => presented.current.add(value.id))
      setOpen(true)
    }
  }, [alerts.data])

  const urgentCount = alerts.data?.filter((value) => value.status === 'OPEN' || value.status === 'ESCALATED').length ?? 0
  return <div className={`critical-value-button ${urgentCount ? 'is-active' : ''}`}>
    <IconButton icon="warning" label={urgentCount ? `危急值，${urgentCount} 条待确认` : '危急值'}
      onClick={() => setOpen(true)} />
    {urgentCount > 0 && <span className="critical-value-button__count">{urgentCount > 99 ? '99+' : urgentCount}</span>}
    {open && <Dialog title="危急值提醒" eyebrow="临床安全" description={`${urgentCount} 条危急值待确认`}
      onClose={() => setOpen(false)}>
      {alerts.isPending && <LoadingState label="正在加载危急值…" />}
      {(alerts.error || acknowledge.error) && <Alert>{errorMessage(alerts.error || acknowledge.error)}</Alert>}
      {!alerts.isPending && !alerts.data?.length && <EmptyState icon="success" title="暂无待处理危急值"
        copy="新的危急值到达时会在这里即时提醒。" />}
      {!!alerts.data?.length && <div className="critical-value-list">
        {alerts.data.map((value) => <article key={value.id}
          className={`critical-value-item ${value.status === 'ESCALATED' ? 'is-escalated' : ''}`}>
          <header><div><strong>{value.observationName}</strong><code>{value.observationCode}</code></div>
            <StatusBadge tone={value.status === 'ACKNOWLEDGED' ? 'warning' : 'danger'}>
              {value.status === 'ACKNOWLEDGED' ? '已确认待处置' : value.status === 'ESCALATED' ? '已升级' : '待确认'}
            </StatusBadge></header>
          <p>{value.triggerEvidence}</p>
          <small>发现于 {formatTime(value.detectedAt)} · 确认时限 {formatTime(value.acknowledgeDeadlineAt)}</small>
          <footer>
            <Button variant="secondary" size="sm" onClick={() => {
              setOpen(false); onNavigate(workContextType === 'GENERAL'
                ? `/inpatient/doctor-station?encounterId=${value.encounterId}`
                : `/outpatient/reception?encounterId=${value.encounterId}`)
            }}>{workContextType === 'GENERAL' ? '进入住院医生站' : '进入医生站'}</Button>
            {(value.status === 'OPEN' || value.status === 'ESCALATED') && <Button size="sm"
              busy={acknowledge.isPending} onClick={() => acknowledge.mutate({ id: value.id, revision: value.revision })}>
              确认收到</Button>}
          </footer>
        </article>)}
      </div>}
    </Dialog>}
  </div>
}
