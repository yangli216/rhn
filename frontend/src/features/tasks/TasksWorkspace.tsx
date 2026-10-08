import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState, PageHeader, Panel, PanelHead, StatusBadge } from '../../shared/ui'
import { formatTime } from '../../shared/format'
import { workTaskBusinessAction, workTaskPriorityPresentation, workTaskStatusPresentation } from '../../shared/presentation'
import '../../styles/features/dashboard-analytics.css'

export function TasksWorkspace({ api, contextKey, onNavigate }: { api: RhnApi; contextKey: string; onNavigate: (path: string) => void }) {
  const queryClient = useQueryClient()
  const tasks = useQuery({ queryKey: ['work-tasks', contextKey], queryFn: async () => {
    const values = await api.portal.tasks.list()
    if (!Array.isArray(values) || values.some((value) => !value || typeof value.id !== 'string'
      || typeof value.taskType !== 'string' || typeof value.title !== 'string')) throw new Error('任务队列返回不完整，请重新加载。')
    return values
  } })
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['work-tasks', contextKey] }),
    queryClient.invalidateQueries({ queryKey: ['portal-summary', contextKey] }),
  ])
  const claim = useMutation({ mutationFn: api.portal.tasks.claim, onSuccess: refresh })
  const complete = useMutation({ mutationFn: (id: string) => api.portal.tasks.complete(id), onSuccess: refresh })

  return <>
    <PageHeader eyebrow="个人工作门户" title="任务中心" description="按当前机构、科室和用户数据范围汇总待办工作。" />
    {(claim.error || complete.error) && <Alert duration={null}>{errorMessage(claim.error || complete.error)}</Alert>}
    {tasks.isError && <Panel><EmptyState icon="tasks" title="任务队列加载失败" copy={errorMessage(tasks.error)}
      action={<Button variant="secondary" onClick={() => void tasks.refetch()}>重新加载任务</Button>} /></Panel>}
    {(tasks.isPending || tasks.isFetching) && <LoadingState label="正在加载任务队列…" />}
    {tasks.isSuccess && !tasks.isFetching && tasks.data.length === 0 && <Panel><EmptyState icon="tasks" title="当前没有待办任务"
      copy="新的门诊挂号和后续业务事件会自动生成任务。" /></Panel>}
    {tasks.isSuccess && !tasks.isFetching && tasks.data.length > 0 && <Panel className="task-queue-panel">
      <PanelHead title="我的工作队列" meta={`${tasks.data.length} 项`} />
      <div className="task-list">
        {tasks.data.map((task) => {
          const status = workTaskStatusPresentation(task.status)
          const priority = workTaskPriorityPresentation(task.priority)
          const businessAction = workTaskBusinessAction(task.taskType)
          const open = task.status === 'READY' || task.status === 'IN_PROGRESS'
          return <article className="task-card" key={task.id}>
          <div className="task-card__main">
            <div className="task-card__title"><strong>{task.title}</strong>
              <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
            <p>{task.summary || '未提供任务摘要'}</p>
            {businessAction && <small>{businessAction}</small>}
            <small>创建于 {formatTime(task.createdAt)}{task.dueAt ? ` · 截止 ${formatTime(task.dueAt)}` : ' · 未提供截止时间'}</small>
          </div>
          <div className="task-card__actions">
            {task.routePath && <Button variant="text" size="sm" onClick={() => onNavigate(task.routePath!)}>查看业务</Button>}
            {task.status === 'READY' && <Button variant="secondary" size="sm" busy={claim.isPending}
              onClick={() => claim.mutate(task.id)}>认领</Button>}
            {open && !businessAction && <Button size="sm" busy={complete.isPending}
              onClick={() => complete.mutate(task.id)}>完成</Button>}
          </div>
        </article>})}
      </div>
    </Panel>}
  </>
}
