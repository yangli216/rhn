import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type MaintenanceTask, type RhnApi } from '../../../shared/rhnApi'
import { formatTime } from '../../../shared/format'
import { Alert, Button, DataTable, EmptyState, LoadingState } from '../../../shared/ui'
import { maintenanceModuleLabels, maintenanceOperationLabels, maintenanceStatusLabels } from '../../../shared/presentation/maintenance'

export function downloadMaintenanceFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  URL.revokeObjectURL(url)
}
export function MaintenanceTaskRecords({ api, scopeKey, authorities, tenantName, organizations }: { api: RhnApi; scopeKey: string; authorities: string[]; tenantName: string; organizations: { value: string; label: string }[] }) {
  const [selected, setSelected] = useState<MaintenanceTask | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const tasks = useQuery({ queryKey: ['maintenance-tasks', scopeKey], queryFn: api.maintenance.tasks,
    refetchInterval: query => query.state.data?.some(task => ['QUEUED', 'PREPARING', 'RUNNING', 'VERIFYING'].includes(task.status ?? '')) ? 2000 : false })
  const current = tasks.data?.find(task => task.id === selected?.id)
  const audit = useQuery({ queryKey: ['maintenance-audit', scopeKey, current?.id, current?.updatedAt],
    queryFn: () => api.maintenance.audit(current!.id!), enabled: !!current?.id })
  async function action(kind: 'cancel' | 'retry' | 'backup') {
    if (busy || !current?.id) return
    setBusy(true); setFailure('')
    try {
      if (kind === 'backup') downloadMaintenanceFile(await api.maintenance.backup(current.id), `maintenance-${current.id}.json`)
      else { await (kind === 'cancel' ? api.maintenance.cancel(current.id) : api.maintenance.retryVerification(current.id)); await tasks.refetch() }
    } catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  return <div className="maintenance-detail">
    <div><Button variant="secondary" busy={tasks.isFetching} onClick={() => void tasks.refetch()}>刷新任务</Button></div>
    {(failure || tasks.isError || audit.isError) && <Alert placement="inline">{failure || errorMessage(tasks.error || audit.error)}</Alert>}
    {tasks.isPending ? <LoadingState label="加载执行记录" /> : tasks.isError ? null : !tasks.data?.length
      ? <EmptyState icon="settings" title="暂无执行记录" copy="已授权范围内的最近执行记录将显示在这里。" />
      : <DataTable aria-label="维护执行记录"><thead><tr><th>任务号</th><th>目标范围</th><th>操作</th><th>模块</th><th>状态</th><th>操作人</th><th>时间</th><th>查看</th></tr></thead>
        <tbody>{tasks.data.map(task => <tr key={task.id}><td>{task.id}</td><td>{task.scope?.wholeTenant ? tenantName : task.scope?.organizationIds?.map(id => organizations.find(org => org.value === id)?.label ?? id).join('、')}</td><td>{maintenanceOperationLabels[task.operation ?? '']}</td>
          <td>{task.modules?.map(module => maintenanceModuleLabels[module] ?? module).join('、')}</td>
          <td>{maintenanceStatusLabels[task.status ?? '']}</td><td>{task.actor}</td><td>{formatTime(task.createdAt)}</td>
          <td><Button variant="text" size="sm" onClick={() => setSelected(task)}>查看详情</Button></td></tr>)}</tbody></DataTable>}
    {current && <section aria-label="任务详情">
      <h2>任务 {current.id} · {maintenanceStatusLabels[current.status ?? '']}</h2>
      {current.failureMessage && <Alert placement="inline">{current.failureMessage}</Alert>}
      <div className="maintenance-actions">
        {current.status === 'QUEUED' && authorities.includes('MAINTENANCE.EXECUTE') && <Button variant="secondary" busy={busy} onClick={() => void action('cancel')}>取消等待任务</Button>}
        {current.failureCode === 'MAINTENANCE_POST_COMMIT_FAILED' && authorities.includes('MAINTENANCE.EXECUTE') && <Button busy={busy} onClick={() => void action('retry')}>重试派生数据校验</Button>}
        {authorities.includes('MAINTENANCE.BACKUP') && <Button variant="secondary" busy={busy} onClick={() => void action('backup')}>下载范围恢复快照</Button>}
      </div>
      <DataTable aria-label="维护任务审计"><thead><tr><th>时间</th><th>操作人</th><th>步骤</th><th>说明</th></tr></thead>
        <tbody>{audit.data?.map(item => <tr key={item.id}><td>{formatTime(item.createdAt)}</td><td>{item.actor}</td><td>{item.action}</td><td>{item.detail}</td></tr>)}</tbody></DataTable>
    </section>}
  </div>
}
