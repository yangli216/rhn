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
export function MaintenanceTaskRecords({ api, scopeKey, authorities, tenantName, organizations, initialTaskId, onReturnToSetup }: {
  api: RhnApi; scopeKey: string; authorities: string[]; tenantName: string; organizations: { value: string; label: string }[]
  initialTaskId?: string; onReturnToSetup: (operation: MaintenanceTask['operation']) => void
}) {
  const [selectedId, setSelectedId] = useState(initialTaskId)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const tasks = useQuery({ queryKey: ['maintenance-tasks', scopeKey], queryFn: api.maintenance.tasks,
    refetchInterval: query => query.state.data?.some(task => ['QUEUED', 'PREPARING', 'RUNNING', 'VERIFYING'].includes(task.status ?? '')) ? 2000 : false })
  const detail = useQuery({ queryKey: ['maintenance-task', scopeKey, selectedId],
    queryFn: () => api.maintenance.task(selectedId!), enabled: !!selectedId,
    refetchInterval: query => query.state.data && ['QUEUED', 'PREPARING', 'RUNNING', 'VERIFYING'].includes(query.state.data.status ?? '') ? 2000 : false })
  const current = detail.isError ? undefined : detail.data
  const audit = useQuery({ queryKey: ['maintenance-audit', scopeKey, current?.id, current?.updatedAt],
    queryFn: () => api.maintenance.audit(current!.id!), enabled: !!current?.id })
  async function action(kind: 'cancel' | 'retry' | 'backup') {
    if (busy || !current?.id) return
    setBusy(true); setFailure('')
    try {
      if (kind === 'backup') downloadMaintenanceFile(await api.maintenance.backup(current.id), `maintenance-${current.id}.json`)
      else { await (kind === 'cancel' ? api.maintenance.cancel(current.id) : api.maintenance.retryVerification(current.id)); await Promise.all([tasks.refetch(), detail.refetch()]) }
    } catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  return <div className="maintenance-detail">
    <div><Button variant="secondary" busy={tasks.isFetching} onClick={() => void tasks.refetch()}>刷新任务</Button></div>
    {(failure || tasks.isError || detail.isError || audit.isError) && <Alert placement="inline">{failure || errorMessage(tasks.error || detail.error || audit.error)}</Alert>}
    {selectedId && detail.isPending && <LoadingState label="加载当前维护任务" />}
    {detail.isError && <Button variant="secondary" onClick={() => void detail.refetch()}>重新加载任务详情</Button>}
    {tasks.isPending ? <LoadingState label="加载执行记录" /> : tasks.isError ? null : !tasks.data?.length
      ? <EmptyState icon="settings" title="暂无执行记录" copy="已授权范围内的最近执行记录将显示在这里。" />
      : <DataTable aria-label="维护执行记录"><thead><tr><th>任务号</th><th>目标范围</th><th>操作</th><th>模块</th><th>状态</th><th>操作人</th><th>时间</th><th>查看</th></tr></thead>
        <tbody>{tasks.data.map(task => <tr key={task.id}><td>{task.id}</td><td>{task.scope?.wholeTenant ? tenantName : task.scope?.organizationIds?.map(id => organizations.find(org => org.value === id)?.label ?? id).join('、')}</td><td>{maintenanceOperationLabels[task.operation ?? '']}</td>
          <td>{task.modules?.map(module => maintenanceModuleLabels[module] ?? module).join('、')}</td>
          <td>{maintenanceStatusLabels[task.status ?? '']}</td><td>{task.actor}</td><td>{formatTime(task.createdAt)}</td>
          <td><Button variant="text" size="sm" onClick={() => setSelectedId(task.id)}>查看详情</Button></td></tr>)}</tbody></DataTable>}
    {current && <section aria-label="任务详情">
      <h2>任务 {current.id} · {maintenanceStatusLabels[current.status ?? '']}</h2>
      {current.failureMessage && <Alert placement="inline">{current.failureMessage}</Alert>}
      {current.status === 'QUEUED' && <p>任务已提交，等待后台执行。进入隔离阶段前可取消。</p>}
      {current.status === 'PREPARING' && <p>整个租户已暂停业务写入，正在等待在途事务结束并保存范围快照。若持续停留，请联系运维核对任务审计和在途事务。</p>}
      {(current.status === 'RUNNING' || current.status === 'VERIFYING') && <p>整个租户的业务写入保持暂停，任务完成后恢复；本页自动更新进度。</p>}
      {current.status === 'FAILED' && <p>{current.failureCode === 'MAINTENANCE_POST_COMMIT_FAILED'
        ? '数据库处理已提交，业务写入仍暂停。请重试派生数据校验，完成后恢复写入。'
        : '数据库处理未提交，业务写入屏障已释放。请处理失败原因，重新核对范围并生成新预览后执行。'}</p>}
      {current.status === 'SUCCEEDED' && <p>本次维护已完成，业务写入已恢复。清理后如需基础初始化，请切换“基础初始化”另行预览和执行。</p>}
      <div className="maintenance-actions">
        {current.status === 'QUEUED' && authorities.includes('MAINTENANCE.EXECUTE') && <Button variant="secondary" busy={busy} onClick={() => void action('cancel')}>取消等待任务</Button>}
        {current.failureCode === 'MAINTENANCE_POST_COMMIT_FAILED' && authorities.includes('MAINTENANCE.EXECUTE') && <Button busy={busy} onClick={() => void action('retry')}>重试派生数据校验</Button>}
        {current.status === 'FAILED' && current.failureCode !== 'MAINTENANCE_POST_COMMIT_FAILED' && authorities.includes('MAINTENANCE.MANAGE') && <Button variant="secondary" onClick={() => onReturnToSetup(current.operation)}>返回设置重新预览</Button>}
        {authorities.includes('MAINTENANCE.BACKUP') && <Button variant="secondary" busy={busy} onClick={() => void action('backup')}>下载范围恢复快照</Button>}
      </div>
      {audit.isPending && <LoadingState label="加载维护任务审计" />}
      <DataTable aria-label="维护任务审计"><thead><tr><th>时间</th><th>操作人</th><th>步骤</th><th>说明</th></tr></thead>
        <tbody>{audit.data?.map(item => <tr key={item.id}><td>{formatTime(item.createdAt)}</td><td>{item.actor}</td><td>{item.action}</td><td>{item.detail}</td></tr>)}</tbody></DataTable>
    </section>}
  </div>
}
