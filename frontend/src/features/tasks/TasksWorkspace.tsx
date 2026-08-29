import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState, PageHeader, Panel, PanelHead, StatusBadge } from '../../shared/ui'
import { formatTime } from '../../shared/format'

export function TasksWorkspace({ api, onNavigate }: { api: RhnApi; onNavigate: (path: string) => void }) {
  const queryClient = useQueryClient()
  const tasks = useQuery({ queryKey: ['work-tasks'], queryFn: api.portal.tasks.list })
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['work-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['portal-summary'] }),
  ])
  const claim = useMutation({ mutationFn: api.portal.tasks.claim, onSuccess: refresh })
  const complete = useMutation({ mutationFn: (id: string) => api.portal.tasks.complete(id), onSuccess: refresh })

  return <>
    <PageHeader eyebrow="个人工作门户" title="任务中心" description="按当前机构、科室和用户数据范围汇总待办工作。" />
    {(tasks.error || claim.error || complete.error) && <Alert>{errorMessage(tasks.error || claim.error || complete.error)}</Alert>}
    {tasks.isPending && <LoadingState label="正在加载任务队列…" />}
    {!tasks.isPending && tasks.data?.length === 0 && <Panel><EmptyState icon="tasks" title="当前没有待办任务"
      copy="新的门诊挂号和后续业务事件会自动生成任务。" /></Panel>}
    {tasks.data && tasks.data.length > 0 && <Panel className="task-queue-panel">
      <PanelHead title="我的工作队列" meta={`${tasks.data.length} 项`} />
      <div className="task-list">
        {tasks.data.map((task) => <article className="task-card" key={task.id}>
          <div className="task-card__main">
            <div className="task-card__title"><strong>{task.title}</strong>
              <StatusBadge tone={task.priority === 'URGENT' || task.priority === 'HIGH' ? 'warning' : 'info'}>
                {task.priority === 'URGENT' ? '紧急' : task.priority === 'HIGH' ? '高优先级' : '普通'}
              </StatusBadge>
              <StatusBadge tone={task.status === 'IN_PROGRESS' ? 'success' : 'neutral'}>
                {task.status === 'IN_PROGRESS' ? '处理中' : '待认领'}
              </StatusBadge>
            </div>
            <p>{task.summary || '等待处理'}</p>
            <small>创建于 {formatTime(task.createdAt)}{task.dueAt ? ` · 截止 ${formatTime(task.dueAt)}` : ''}</small>
          </div>
          <div className="task-card__actions">
            {task.routePath && <Button variant="text" size="sm" onClick={() => onNavigate(task.routePath!)}>查看业务</Button>}
            {task.status === 'READY' && <Button variant="secondary" size="sm" busy={claim.isPending}
              onClick={() => claim.mutate(task.id)}>认领</Button>}
            {task.taskType !== 'CLINICAL_DOCUMENT_SIGN' && <Button size="sm" busy={complete.isPending}
              onClick={() => complete.mutate(task.id)}>完成</Button>}
          </div>
        </article>)}
      </div>
    </Panel>}
  </>
}
