import { useMutation, useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState } from '../../../shared/ui'
import { SpecimenPanel, loadDiagnosticSpecimens } from '../laboratory/SpecimenPanel'
import { ReportComposer } from './ReportComposer'
import type { DiagnosticForm, DiagnosticView } from './diagnosticWorkbenchModel'

export function DiagnosticTaskOperations({ api, task, view, refreshing, onRefresh, onNavigate, form, onForm, candidates, canExecute, canEdit, canSign }: {
  api: RhnApi; task: DiagnosticExecutionTask; view: DiagnosticView; refreshing: boolean; onRefresh: () => Promise<void>
  onNavigate: (path: string) => void; form?: DiagnosticForm; onForm: (form: DiagnosticForm) => void; candidates: DiagnosticExecutionTask[]
  canExecute: boolean; canEdit: boolean; canSign: boolean
}) {
  const laboratory = task.requestType === 'LABORATORY'
  const draft = useQuery({ queryKey: ['diagnostic-draft', task.id, task.organizationId, task.departmentId], queryFn: () => api.diagnostics.draft(task.id),
    enabled: view === 'work' && ['IN_PROGRESS', 'COMPLETED'].includes(task.status) })
  const specimens = useQuery({ queryKey: ['diagnostic-specimens', task.id, task.organizationId, task.departmentId],
    queryFn: () => loadDiagnosticSpecimens(api, task), enabled: laboratory && task.status === 'COLLECTED' })
  const start = useMutation({ mutationFn: () => api.diagnostics.start(task.id, task.revision), onSuccess: onRefresh })
  const canStart = !laboratory || specimens.isSuccess && !specimens.isFetching
    && specimens.data.filter((item) => item.status !== 'REJECTED').every((item) => item.status === 'RECEIVED')
  if (view === 'work' && ['IN_PROGRESS', 'COMPLETED'].includes(task.status)) {
    if (draft.isPending) return <LoadingState label="正在读取报告草稿…" />
    if (draft.isError) return <EmptyState icon="clinical" title="草稿加载失败" copy="为避免覆盖已有内容，请重新读取。"
      action={<Button onClick={() => void draft.refetch()}>重新读取草稿</Button>} />
    return <ReportComposer api={api} task={task} draft={draft.data} refreshing={refreshing || draft.isFetching}
      onRefresh={onRefresh} form={form} onForm={onForm} canEdit={canEdit} canSign={canSign} />
  }
  return <div className="diagnostic-scroll diagnostic-operation-body" role="region" aria-label="当前作业内容" tabIndex={0}>
    {start.error && <Alert>{errorMessage(start.error)}</Alert>}
    {!canExecute && <Alert tone="info" placement="inline">当前身份可查阅任务，暂无执行权限。</Alert>}
    {task.status === 'WAITING_SETTLEMENT' && <Alert tone="info" placement="inline">完成收费后自动放行。
      <Button variant="text" onClick={() => onNavigate(`/billing/settlement?encounterId=${task.encounterId}`)}>去费用结算</Button></Alert>}
    {laboratory && <SpecimenPanel api={api} task={task} candidates={candidates} onRefresh={onRefresh} refreshing={refreshing} canExecute={canExecute} />}
    {view === 'work' && (task.status === 'COLLECTED' || task.status === 'READY' && !laboratory) && <section className="diagnostic-start">
      <h3>{laboratory ? '开始检验' : '执行前核对'}</h3>
      <p>{laboratory ? '全部实际标本接收后，开始检验并录入结果。' : '核对患者姓名、档案号和申请项目，确认后开始检查。'}</p>
      <dl className="diagnostic-request-details"><div><dt>患者</dt><dd>{task.residentName} · {task.healthRecordNo}</dd></div>
        <div><dt>申请项目</dt><dd>{task.itemName} · {task.requestNo}</dd></div></dl>
      {laboratory && !canStart && <Alert tone="info" placement="inline">请先接收所有有效标本，再开始检验。</Alert>}
      <Button disabled={refreshing || !canExecute || !canStart} busy={start.isPending} onClick={() => start.mutate()}>
        {laboratory ? '开始检验' : '确认开始检查'}</Button></section>}
    {task.status === 'EXCEPTION' && <Alert placement="inline">{task.exceptionNote || '任务需要核对后继续处理。'}</Alert>}
    {task.status === 'CANCELLED' && <EmptyState icon="clinical" title="申请已取消" copy="可查看申请记录和历史报告。" />}
  </div>
}
