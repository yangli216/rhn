import { useMutation, useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState, StatusBadge } from '../../../shared/ui'
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

  // 标本管理 Tab（无论任务处于何种状态，均为标本全生命周期台账与运维中心）
  if (view === 'specimens') {
    return <div className="diagnostic-scroll diagnostic-operation-body" role="region" aria-label="标本管理内容" tabIndex={0}>
      {!canExecute && <Alert tone="info" placement="inline">当前身份可查阅标本台账，暂无执行权限。</Alert>}
      {laboratory ? (
        <>
          <section className="diagnostic-workflow-card">
            <div className="diagnostic-workflow-header">
              <div>
                <h3>标本全生命周期台账与运维</h3>
                <p>集中查看本申请所有标本条码、采血管规格及流转记录，支持标本拒收、重新采样及热敏条码补打。</p>
              </div>
              <StatusBadge tone="neutral">标本台账</StatusBadge>
            </div>
          </section>
          <SpecimenPanel api={api} task={task} candidates={candidates} onRefresh={onRefresh} refreshing={refreshing} canExecute={canExecute} />
        </>
      ) : (
        <EmptyState icon="clinical" title="检查项目无需标本" copy="超声、放射及心电等影像检查项目无需采集标本。" />
      )}
    </div>
  }

  // 当前作业 Tab：报告录入阶段
  if (view === 'work' && ['IN_PROGRESS', 'COMPLETED'].includes(task.status)) {
    if (draft.isPending) return <LoadingState label="正在读取报告草稿…" />
    if (draft.isError) return <EmptyState icon="clinical" title="草稿加载失败" copy="为避免覆盖已有内容，请重新读取。"
      action={<Button onClick={() => void draft.refetch()}>重新读取草稿</Button>} />
    return <ReportComposer api={api} task={task} draft={draft.data} refreshing={refreshing || draft.isFetching}
      onRefresh={onRefresh} form={form} onForm={onForm} canEdit={canEdit} canSign={canSign} />
  }

  // 当前作业 Tab：准备/采集/接收流转阶段
  return <div className="diagnostic-scroll diagnostic-operation-body" role="region" aria-label="当前作业内容" tabIndex={0}>
    {start.error && <Alert>{errorMessage(start.error)}</Alert>}
    {!canExecute && <Alert tone="info" placement="inline">当前身份可查阅任务，暂无执行权限。</Alert>}
    {task.status === 'WAITING_SETTLEMENT' && <Alert tone="info" placement="inline">完成收费后自动放行。
      <Button variant="text" onClick={() => onNavigate(`/billing/settlement?encounterId=${task.encounterId}`)}>去费用结算</Button></Alert>}

    {/* 当前作业阶段指引卡片 */}
    {view === 'work' && laboratory && task.status === 'READY' && (
      <section className="diagnostic-workflow-card">
        <div className="diagnostic-workflow-header">
          <div>
            <h3>当前作业阶段：1. 标本采集与核对</h3>
            <p>核对患者身份信息及检验项目，采集标本后确认送检。</p>
          </div>
          <StatusBadge tone="warning">待采集</StatusBadge>
        </div>
      </section>
    )}

    {view === 'work' && laboratory && task.status === 'COLLECTED' && (
      <section className="diagnostic-workflow-card">
        <div className="diagnostic-workflow-header">
          <div>
            <h3>当前作业阶段：2. 标本核收与检验流转</h3>
            <p>送检标本已送达实验室，核对合格后核收并开始检测。</p>
          </div>
          <StatusBadge tone="info">待接收</StatusBadge>
        </div>
      </section>
    )}

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
