import { useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import { DiagnosticReportViewer } from '../../../shared/clinical/DiagnosticReportViewer'
import { age, formatTime, genderLabel } from '../../../shared/format'
import { diagnosticTaskStatusPresentation } from '../../../shared/presentation'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState, StatusBadge } from '../../../shared/ui'
import { loadTaskReports, type DiagnosticForm } from './diagnosticWorkbenchModel'

export function DiagnosticQueue({ api, tasks, selectedId, scope, forms, onSelect }: {
  api: RhnApi; tasks: DiagnosticExecutionTask[]; selectedId: string; scope: string; forms: Record<string, DiagnosticForm>; onSelect: (id: string) => void
}) {
  return <ul aria-label="医技申请队列" className="diagnostic-queue-list">{tasks.map((task) => {
    const status = diagnosticTaskStatusPresentation(task.status, task.requestType === 'LABORATORY')
    return <li key={task.id} className={`diagnostic-queue-entry ${task.id === selectedId ? 'is-active' : ''}`}>
      <Button variant="text" className="diagnostic-queue-choice" aria-current={task.id === selectedId ? 'true' : undefined}
        aria-label={`${task.residentName} · ${task.itemName}`}
        title={`申请单号 ${task.requestNo}`} onClick={() => onSelect(task.id)}><span className="diagnostic-queue-summary">
          <span className="diagnostic-queue-col diagnostic-queue-col--patient">
            <strong className="diagnostic-queue-patient-name">{task.residentName}</strong>
            <span className="diagnostic-queue-demographics"><DiagnosticPatientDemographics api={api} task={task} compact /></span>
          </span>
          <span className="diagnostic-queue-col diagnostic-queue-col--project">
            <span className="diagnostic-queue-project">{task.itemName}</span>
            <span className="diagnostic-queue-meta">申请 {formatTime(task.createdAt) || '—'}{task.specimenNo && ` · 标本 ${task.specimenNo}`}</span>
          </span>
        </span></Button>
      <div className="diagnostic-queue-state"><StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        {forms[`${scope}:${task.id}`]?.dirty && <small className="diagnostic-unsaved">未保存</small>}</div>
    </li>
  })}</ul>
}

export function DiagnosticPatientDemographics({ api, task, compact = false }: { api: RhnApi; task: DiagnosticExecutionTask; compact?: boolean }) {
  const incomplete = task.gender === undefined || task.birthDate === undefined
  const resident = useQuery({ queryKey: ['diagnostic-patient-demographics', task.organizationId, task.departmentId, task.residentId, task.healthRecordNo],
    enabled: incomplete, staleTime: 30_000,
    queryFn: async () => {
      const value = await api.residents.get(task.residentId)
      if (!value || value.id !== task.residentId || (task.healthRecordNo && value.healthRecordNo !== task.healthRecordNo))
        throw new Error('患者基本信息与当前申请不一致，请重新读取。')
      if (value.gender === undefined || value.birthDate === undefined) throw new Error('患者基本信息不完整，请重新读取。')
      return value
    } })
  if (incomplete && resident.isPending) return <span role="status">{compact ? '基本信息读取中…' : '正在读取年龄、性别…'}</span>
  if (incomplete && resident.isError) return compact ? <span title={errorMessage(resident.error)}>基本信息读取失败</span> : <span>患者基本信息读取失败
    <Button size="sm" variant="text" title={errorMessage(resident.error)} onClick={() => void resident.refetch()}>重试基本信息</Button></span>
  const demographics = incomplete ? resident.data : task
  return <>{demographics?.genderText || genderLabel(demographics?.gender)} · {demographics?.birthDate ? `${age(demographics.birthDate)}岁` : '年龄未登记'}</>
}

export function DiagnosticTaskContext({ api, task }: { api: RhnApi; task: DiagnosticExecutionTask }) {
  const laboratory = task.requestType === 'LABORATORY'
  const status = diagnosticTaskStatusPresentation(task.status, laboratory)
  const steps = laboratory ? ['申请放行', '标本采集', '接收 / 检验', '结果录入', '报告签发'] : ['申请放行', '患者核对 / 检查', '报告录入', '报告签发']
  const step = task.status === 'WAITING_SETTLEMENT' ? 0 : task.status === 'READY' ? 1
    : task.status === 'COLLECTED' ? 2 : task.status === 'IN_PROGRESS' ? steps.length - 2 : task.status === 'COMPLETED' ? steps.length : -1
  return <div className="diagnostic-task-context">
    <div className="diagnostic-context-compact-row">
      <div className="diagnostic-context-patient-section">
        <strong className="diagnostic-context-patient-name">{task.residentName}</strong>
        <span className="diagnostic-context-demographics"><DiagnosticPatientDemographics api={api} task={task} /></span>
      </div>
      <span className="diagnostic-context-divider" aria-hidden="true">|</span>
      <div className="diagnostic-context-item-section">
        <span className="diagnostic-context-label">申请项目：</span>
        <strong className="diagnostic-context-item-name">{task.itemName}</strong>
      </div>
      <span className="diagnostic-context-divider" aria-hidden="true">|</span>
      <div className="diagnostic-context-meta-section">
        <span>单号：{task.requestNo}</span>
        {laboratory ? (
          task.specimenNo && <span>标本：{task.specimenNo}</span>
        ) : (
          (task.examinationTypeText || task.examinationType) && <span>类型：{task.examinationTypeText || task.examinationType}</span>
        )}
        <span>申请：{formatTime(task.createdAt) || '—'}</span>
      </div>
      <div className="diagnostic-context-status-section">
        {step >= 0 && step < steps.length && (
          <span className="diagnostic-context-step-badge">
            第 {step + 1}/{steps.length} 步 · {steps[step]}
          </span>
        )}
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
    </div>
  </div>
}

export function DiagnosticRequestDetails({ task }: { task: DiagnosticExecutionTask }) {
  return <section><h3>申请与执行记录</h3><dl className="diagnostic-request-details">
    <div><dt>申请单号</dt><dd>{task.requestNo}</dd></div><div><dt>执行任务号</dt><dd>{task.taskNo || '—'}</dd></div>
    <div><dt>申请项目</dt><dd>{task.itemName} · {task.itemCode}</dd></div>
    {task.bodySiteText && <div><dt>检查部位</dt><dd>{task.bodySiteText}</dd></div>}
    <div><dt>{task.requestType === 'LABORATORY' ? '标本类型' : '检查类型'}</dt><dd>{task.specimenType || task.examinationTypeText || task.examinationType || '未配置'}</dd></div>
    <div><dt>申请时间</dt><dd>{formatTime(task.createdAt) || '—'}</dd></div><div><dt>采集时间</dt><dd>{formatTime(task.collectedAt) || '—'}</dd></div>
    <div><dt>开始时间</dt><dd>{formatTime(task.startedAt) || '—'}</dd></div><div><dt>完成时间</dt><dd>{formatTime(task.completedAt) || '—'}</dd></div>
    <div><dt>采集备注</dt><dd>{task.collectionNote || '—'}</dd></div><div><dt>完成备注</dt><dd>{task.completionNote || '—'}</dd></div>
  </dl>{task.exceptionNote && <Alert placement="inline">{task.exceptionNote}</Alert>}</section>
}

export function TaskReports({ api, task }: { api: RhnApi; task: DiagnosticExecutionTask }) {
  const reports = useQuery({ queryKey: ['diagnostic-task-reports', task.requestId, task.organizationId, task.departmentId, task.status, task.reportId],
    queryFn: () => loadTaskReports(api, task) })
  return <section className="diagnostic-report-history" aria-label="报告记录与版本"><h3 className="visually-hidden">报告记录与版本</h3>{reports.isPending || reports.isFetching ? <LoadingState label="正在读取报告…" />
    : reports.isError ? <Alert placement="inline">报告加载失败：{errorMessage(reports.error)}<Button onClick={() => void reports.refetch()}>重新加载报告</Button></Alert>
      : reports.data.length === 0 ? <EmptyState icon="clinical" title="尚未签发报告" copy="保存草稿不完成任务，正式签发后在此查阅和打印。" />
        : reports.data.map((report) => <DiagnosticReportViewer key={report.id} api={api} report={report} subject={{
          patientName: task.residentName,
          genderText: task.genderText,
          healthRecordNo: task.healthRecordNo,
          requestNo: task.requestNo,
          specimenOrExam: task.specimenNo || task.specimenType || task.examinationTypeText || task.examinationType,
        }}
          historical={report.id !== task.reportId && Boolean(task.reportId) || reports.data.some((other) => other.replacesReportId === report.id)} />)}</section>
}
