import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../format'
import { requireActiveCriticalValues } from '../clinical/criticalValueFacts'
import { criticalValueStatusPresentation } from '../presentation'
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
  const alerts = useQuery({ queryKey, queryFn: async () => requireActiveCriticalValues(await api.diagnostics.criticalValues.active()), refetchInterval: 60_000 })
  const acknowledge = useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      api.diagnostics.criticalValues.acknowledge(id, revision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['inpatient-critical-values'] })
      await queryClient.invalidateQueries({ queryKey: ['work-tasks', contextKey] })
      await queryClient.invalidateQueries({ queryKey: ['portal-summary', contextKey] })
      await queryClient.invalidateQueries({ queryKey: ['portal-notifications', contextKey] })
    },
  })

  const available = alerts.isSuccess && !alerts.isFetching
  useEffect(() => {
    if (!available) return
    const urgent = alerts.data?.filter((value) => value.status === 'OPEN' || value.status === 'ESCALATED') ?? []
    if (urgent.some((value) => !presented.current.has(`${contextKey}:${value.id}:${value.status}`))) {
      urgent.forEach((value) => presented.current.add(`${contextKey}:${value.id}:${value.status}`))
      setOpen(true)
    }
  }, [alerts.data, available, contextKey])

  const urgentCount = available ? alerts.data.filter((value) => value.status === 'OPEN' || value.status === 'ESCALATED').length : undefined
  const description = urgentCount !== undefined ? `${urgentCount} 条危急值待确认`
    : alerts.isError ? '危急值数量暂不可用' : '正在核实危急值数量…'
  return <div className={`critical-value-button ${urgentCount ? 'is-active' : ''}`}>
    <IconButton icon="warning" label={`危急值，${description}`}
      onClick={() => setOpen(true)} />
    {urgentCount !== undefined && urgentCount > 0 && <span className="critical-value-button__count">{urgentCount > 99 ? '99+' : urgentCount}</span>}
    {open && <Dialog title="危急值提醒" eyebrow="临床安全" description={description}
      onClose={() => setOpen(false)}>
      {(alerts.isPending || alerts.isFetching) && <LoadingState label="正在加载危急值…" />}
      {alerts.isError && <EmptyState icon="warning" title="危急值加载失败" copy={errorMessage(alerts.error)}
        action={<Button variant="secondary" onClick={() => void alerts.refetch()}>重新加载危急值</Button>} />}
      {acknowledge.error && <Alert duration={null}>{errorMessage(acknowledge.error)}</Alert>}
      {available && alerts.data.length === 0 && <EmptyState icon="success" title="暂无待处理危急值"
        copy="新的危急值到达时会在这里即时提醒。" />}
      {available && alerts.data.length > 0 && <div className="critical-value-list">
        {alerts.data.map((value) => <article key={value.id}
          className={`critical-value-item ${value.status === 'ESCALATED' ? 'is-escalated' : ''}`}>
          <header><div><strong>{value.observationName}</strong><code>{value.observationCode}</code></div>
            <StatusBadge tone={criticalValueStatusPresentation(value.status).tone}>
              {criticalValueStatusPresentation(value.status).label}
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
