import { DiagnosticTemplateSelection } from './DiagnosticTemplateSelection'
import { readDiagnosticTemplateSnapshot } from '../../../shared/api/diagnosticTemplateTypes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { DiagnosticExecutionTask, DiagnosticReportDraft, LocalDiagnosticReportInput, LocalDiagnosticObservationInput } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import { requireDiagnosticReports } from '../../../shared/clinical/diagnosticResults'
import { DiagnosticReportViewer } from '../../../shared/clinical/DiagnosticReportViewer'
import { formatTime } from '../../../shared/format'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, Pagination, SearchField, StatusBadge } from '../../../shared/ui'
import { WorkbenchPage } from '../../../shared/ui/templates/PageTemplates'
import { LaboratoryResultEditor } from '../laboratory/LaboratoryResultEditor'
import { ExaminationReportEditor } from '../examination/ExaminationReportEditor'
import { ExaminationImages } from '../examination/ExaminationImages'
import { SpecimenPanel } from '../laboratory/SpecimenPanel'
import '../../../styles/features/diagnostic-execution.css'

export interface DiagnosticWorkbenchProps {
  api: RhnApi; clinicalContext: ClinicalContext; onNavigate: (path: string) => void
  onDirtyChange?: (dirty: boolean) => void
  authorities?: string[]
}
type Form = { input: LocalDiagnosticReportInput; dirty: boolean; correction: boolean }
const statusLabels = { WAITING_SETTLEMENT: '待结算', READY: '待执行', COLLECTED: '已采集', IN_PROGRESS: '执行中',
  COMPLETED: '已出报告', CANCELLED: '已取消', EXCEPTION: '待核对' }

export function DiagnosticWorkbench({ api, clinicalContext, onNavigate, requestType, onDirtyChange, authorities }: DiagnosticWorkbenchProps & {
  requestType: 'LABORATORY' | 'EXAMINATION'
}) {
  const client = useQueryClient()
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [forms, setForms] = useState<Record<string, Form>>({})
  const [scanNumber, setScanNumber] = useState('')
  const [scannedTaskId, setScannedTaskId] = useState('')
  const scope = `${clinicalContext.organization.id}:${clinicalContext.department.id}:${requestType}`
  const allowed = (action: string) => !authorities || authorities.includes('ROLE_ADMIN')
    || authorities.includes(`DIAGNOSTICS.${requestType}.${action}`)
  const worklist = useQuery({ queryKey: ['diagnostic-worklist', scope, keyword, page, params.toString()],
    queryFn: async () => {
      const result = await api.diagnostics.worklistPage(requestType, keyword, page, 20, params.get('encounterId') || undefined, params.get('residentId') || undefined)
      if (!result || !Array.isArray(result.content) || result.content.some((task) => !task || !task.id || !task.residentId || !task.encounterId
        || task.organizationId !== clinicalContext.organization.id || task.departmentId !== clinicalContext.department.id || task.requestType !== requestType))
        throw new Error('队列数据不完整或与当前工作上下文不一致，请重新读取。')
      return result
    },
    refetchInterval: 30_000 })
  const tasks = useMemo(() => worklist.isSuccess ? worklist.data.content : [], [worklist.isSuccess, worklist.data])
  const queue = tasks
  const scanned = useQuery({ queryKey: ['diagnostic-scanned-task', scope, scannedTaskId],
    queryFn: async () => {
      const task = await api.diagnostics.task(scannedTaskId)
      if (!task || task.id !== scannedTaskId || task.requestType !== requestType || task.organizationId !== clinicalContext.organization.id
        || task.departmentId !== clinicalContext.department.id || !task.residentId || !task.encounterId)
        throw new Error('扫码任务与当前工作上下文不一致，请重新核对。')
      return task
    }, enabled: Boolean(scannedTaskId) })
  const selected = scannedTaskId ? (scanned.isSuccess && !scanned.isFetching ? scanned.data : undefined) : tasks.find((task) => task.id === selectedId)
  const scan = useMutation({ mutationFn: async () => {
    const specimen = await api.diagnostics.scanSpecimen(scanNumber.trim())
    if (!specimen || !Array.isArray(specimen.taskIds) || !specimen.taskIds[0] || specimen.specimenNo !== scanNumber.trim())
      throw new Error('扫码结果不完整或条码不一致，请重新核对。')
    if (specimen.status === 'REJECTED') throw new Error('此标本已拒收，请使用重采条码。')
    setScannedTaskId(specimen.taskIds[0]); setSelectedId(specimen.taskIds[0])
  } })
  const hasUnsaved = Object.values(forms).some((form) => form.dirty)
  useEffect(() => {
    onDirtyChange?.(hasUnsaved)
    return () => onDirtyChange?.(false)
  }, [hasUnsaved, onDirtyChange])
  useEffect(() => {
    if (!hasUnsaved) return
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnsaved])
  useEffect(() => {
    if (scannedTaskId) return
    const linked = tasks.find((task) => params.get('encounterId') ? task.encounterId === params.get('encounterId')
      : params.get('residentId') ? task.residentId === params.get('residentId') : false)
    if (!tasks.some((task) => task.id === selectedId)) setSelectedId(linked?.id || tasks[0]?.id || '')
  }, [tasks, selectedId, params, scannedTaskId])
  useEffect(() => { setSelectedId(''); setKeyword(''); setPage(0); setScannedTaskId(''); setScanNumber('') }, [scope])
  const refresh = async () => { await Promise.all([
    client.invalidateQueries({ queryKey: ['diagnostic-worklist'] }),
    client.invalidateQueries({ queryKey: ['diagnostic-task-reports'] }),
    client.invalidateQueries({ queryKey: ['diagnostic-draft'] }),
    client.invalidateQueries({ queryKey: ['diagnostic-specimens'] }),
    client.invalidateQueries({ queryKey: ['diagnostic-scanned-task'] }),
    client.invalidateQueries({ queryKey: ['doctor-reports'] }),
    client.invalidateQueries({ queryKey: ['inpatient-diagnostic-reports'] }),
  ]) }
  const title = requestType === 'LABORATORY' ? '检验工作台' : '检查工作台'
  return <WorkbenchPage title={title} queueLabel="执行队列" referenceLabel="报告历史"
    description={`${clinicalContext.organization.name} · ${clinicalContext.department.name}`}
    actions={<Button variant="secondary" busy={worklist.isFetching} onClick={() => void refresh()}>刷新队列</Button>}
    feedback={(worklist.error || scan.error || scanned.error) ? <Alert>{errorMessage(worklist.error || scan.error || scanned.error)}</Alert> : undefined}
    queueHeader={<><SearchField label="搜索患者、申请或标本" value={keyword} onChange={(value) => { setKeyword(value); setPage(0); setScannedTaskId('') }} />
      {requestType === 'LABORATORY' && <div className="diagnostic-form-row"><FormField label="扫码定位标本"><input value={scanNumber}
        onChange={(event) => setScanNumber(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && scanNumber.trim()) scan.mutate() }} /></FormField>
        <Button size="sm" disabled={!scanNumber.trim()} busy={scan.isPending} onClick={() => scan.mutate()}>定位</Button></div>}</>}
    queueFooter={worklist.isSuccess && <Pagination page={page} totalPages={worklist.data.totalPages}
      total={worklist.data.totalElements} onChange={setPage} mode="simple" />}
    queue={worklist.isPending ? <LoadingState label="正在加载医技队列…" /> : worklist.isError
      ? <EmptyState icon="clinical" title="医技队列加载失败" copy="请刷新后继续操作。" /> : queue.length === 0
        ? <EmptyState icon="clinical" title="暂无匹配任务" copy="开立并放行的申请会进入执行队列。" />
        : <div className="diagnostic-task-list">{queue.map((task) => <Button key={task.id} variant={task.id === selectedId ? 'primary' : 'secondary'}
          onClick={() => { setSelectedId(task.id); setScannedTaskId('') }}><span>{task.residentName} · {task.itemName}<small>{task.requestNo} · {statusLabels[task.status]}</small></span></Button>)}</div>}
    reference={selected && <TaskReports key={`${scope}:${selected.id}`} api={api} task={selected} />}
    context={selected && <header className="diagnostic-detail-head"><div><h2>{selected.residentName} · {selected.itemName}</h2>
      <p>{selected.healthRecordNo} · {selected.requestNo} · {selected.specimenType || selected.examinationType || '类型未配置'}</p></div>
      <StatusBadge>{statusLabels[selected.status]}</StatusBadge></header>}>
    {!selected ? <EmptyState icon="clinical" title="请选择医技任务" copy="从队列选择患者和项目后开始作业。" />
      : <TaskOperations key={`${scope}:${selected.id}`} api={api} task={selected} refreshing={worklist.isFetching}
        canExecute={allowed('EXECUTE')} canEdit={allowed('EDIT')} canSign={allowed('SIGN')}
        onRefresh={refresh} onNavigate={onNavigate} candidates={tasks.some((item) => item.id === selected.id) ? tasks : [selected, ...tasks]} form={forms[`${scope}:${selected.id}`]}
        onForm={(form) => setForms((previous) => ({ ...previous, [`${scope}:${selected.id}`]: form }))} />}
  </WorkbenchPage>
}

async function loadTaskReports(api: RhnApi, task: DiagnosticExecutionTask) {
  const values = requireDiagnosticReports(await api.diagnostics.reportsByRequest(task.requestId), task)
  if (task.status === 'COMPLETED' && !values.some((report) => report.id === task.reportId))
    throw new Error('未查询到对应报告，请核对任务完成记录。')
  return values
}
function TaskReports({ api, task }: { api: RhnApi; task: DiagnosticExecutionTask }) {
  const reports = useQuery({ queryKey: ['diagnostic-task-reports', task.requestId, task.organizationId, task.departmentId, task.status, task.reportId],
    queryFn: () => loadTaskReports(api, task) })
  return <section><h2>报告历史</h2>{reports.isPending || reports.isFetching ? <LoadingState label="正在读取报告…" />
    : reports.isError ? <Alert>报告加载失败：{errorMessage(reports.error)}<Button onClick={() => void reports.refetch()}>重新加载报告</Button></Alert> : reports.data.length === 0
      ? <EmptyState icon="clinical" title="尚未签发报告" copy="保存草稿后可直接签发；机构启用双签时由另一人签发。" />
      : reports.data.map((report) => <DiagnosticReportViewer key={report.id} api={api} report={report}
        historical={report.id !== task.reportId && Boolean(task.reportId) || reports.data.some((other) => other.replacesReportId === report.id)} />)}</section>
}

function TaskOperations({ api, task, refreshing, onRefresh, onNavigate, form, onForm, candidates, canExecute, canEdit, canSign }: {
  api: RhnApi; task: DiagnosticExecutionTask; refreshing: boolean; onRefresh: () => Promise<void>
  onNavigate: (path: string) => void; form?: Form; onForm: (form: Form) => void; candidates: DiagnosticExecutionTask[]
  canExecute: boolean; canEdit: boolean; canSign: boolean
}) {
  const draft = useQuery({ queryKey: ['diagnostic-draft', task.id, task.organizationId, task.departmentId], queryFn: () => api.diagnostics.draft(task.id),
    enabled: ['IN_PROGRESS', 'COMPLETED'].includes(task.status) })
  const start = useMutation({ mutationFn: () => api.diagnostics.start(task.id, task.revision), onSuccess: onRefresh })
  const error = start.error || draft.error
  return <div className="diagnostic-operation-body">{error && <Alert>{errorMessage(error)}</Alert>}
    {task.status === 'WAITING_SETTLEMENT' && <Alert tone="info">完成收费后自动放行。
      <Button variant="text" onClick={() => onNavigate(`/billing/settlement?encounterId=${task.encounterId}`)}>去费用结算</Button></Alert>}
    {task.requestType === 'LABORATORY' && <SpecimenPanel api={api} task={task} candidates={candidates} onRefresh={onRefresh} refreshing={refreshing} canExecute={canExecute} />}
    {(task.status === 'COLLECTED' || task.status === 'READY' && task.requestType === 'EXAMINATION') && <section>
      <p>{task.specimenNo ? `标本 ${task.specimenNo} · 已采集` : '核对患者与检查项目后开始检查。'}</p>
      <Button disabled={refreshing || !canExecute} busy={start.isPending} onClick={() => start.mutate()}>{task.requestType === 'LABORATORY' ? '开始检验' : '确认开始检查'}</Button></section>}
    {['IN_PROGRESS', 'COMPLETED'].includes(task.status) && (draft.isPending ? <LoadingState label="正在读取报告草稿…" />
      : draft.isError ? <EmptyState icon="clinical" title="草稿加载失败" copy="为避免覆盖已有内容，请重新读取。"
        action={<Button onClick={() => void draft.refetch()}>重新读取草稿</Button>} />
        : <ReportComposer api={api} task={task} draft={draft.data} refreshing={refreshing || draft.isFetching}
          onRefresh={onRefresh} form={form} onForm={onForm} canEdit={canEdit} canSign={canSign} />)}
    {task.status === 'EXCEPTION' && <Alert>{task.exceptionNote || '任务需要核对后继续处理。'}</Alert>}
  </div>
}

function ReportComposer({ api, task, draft, refreshing, onRefresh, form, onForm, canEdit, canSign }: {
  api: RhnApi; task: DiagnosticExecutionTask; draft: DiagnosticReportDraft; refreshing: boolean
  onRefresh: () => Promise<void>; form?: Form; onForm: (form: Form) => void
  canEdit: boolean; canSign: boolean
}) {
  const template = useQuery({ queryKey: ['diagnostic-template', task.id, task.organizationId, task.departmentId], queryFn: async () => {
    const value = await api.diagnostics.reportTemplate(task.id)
    if (value && (value.organizationId !== task.organizationId || value.serviceType !== task.requestType || !Array.isArray(value.content?.indicators)))
      throw new Error('报告模板与当前机构或项目类型不一致，请重新读取。')
    return value
  } })
  const reports = useQuery({ queryKey: ['diagnostic-task-reports', task.requestId, task.organizationId, task.departmentId, task.status, task.reportId],
    queryFn: () => loadTaskReports(api, task), enabled: task.status === 'COMPLETED' })
  const latest = reports.data?.find((report) => report.id === task.reportId)
  const issuedInput: LocalDiagnosticReportInput | undefined = latest ? { expectedRevision: task.revision, findings: latest.findings,
    templateVersionId: latest.templateVersionId, templateSnapshot: latest.templateSnapshot,
    conclusion: latest.conclusion, observations: latest.observations.map((item) => ({ observationCode: item.observationCode,
      observationName: item.observationName, valueType: ['NUMBER', 'STRING', 'CODE'].includes(item.valueType) ? item.valueType as 'NUMBER' | 'STRING' | 'CODE' : 'STRING',
      observationValue: item.valueNumber != null ? String(item.valueNumber) : item.valueString || item.valueCode || '',
      valueComparator: item.valueComparator, unitCode: item.unitCode, referenceRangeLow: item.referenceRangeLow, referenceRangeHigh: item.referenceRangeHigh,
      interpretationCode: ['N', 'H', 'HH', 'L', 'LL', 'A', 'CRITICAL', 'PANIC'].includes(item.interpretationCode || '')
        ? item.interpretationCode as LocalDiagnosticObservationInput['interpretationCode'] : undefined })) } : undefined
  const initial = useMemo(() => draft.content || { expectedRevision: task.revision, findings: '', conclusion: '', observations: [{
    observationCode: task.itemCode, observationName: task.itemName, valueType: 'NUMBER' as const, observationValue: '',
  }] }, [draft.content, task.revision, task.itemCode, task.itemName])
  const current = form || { input: initial, dirty: false, correction: Boolean(draft.content?.correctionReason) }
  const input = current.input
  const change = (patch: Partial<LocalDiagnosticReportInput>) => onForm({ ...current, dirty: true, input: { ...input, ...patch } })
  const payload = () => ({ ...input, expectedRevision: task.revision, expectedDraftRevision: draft.revision })
  const command = useRef({ fingerprint: '', id: '' })
  const issueCommand = () => {
    const fingerprint = JSON.stringify(payload())
    if (command.current.fingerprint !== fingerprint) command.current = { fingerprint, id: crypto.randomUUID() }
    return command.current.id
  }
  const save = useMutation({ mutationFn: () => api.diagnostics.saveDraft(task.id, payload()), onSuccess: async (saved) => {
    onForm({ ...current, input: saved.content || input, dirty: false }); await onRefresh()
  } })
  const issue = useMutation({ mutationFn: async () => {
    if (draft.doubleSignatureRequired || !canEdit) {
      if (current.dirty || !draft.content) throw new Error('请先保存修改，再由另一人打开草稿审核并签发。')
      return api.diagnostics.issueDraft(task.id, task.revision, draft.revision, issueCommand())
    }
    return api.diagnostics.recordLocalReport(task.id, { ...payload(), commandId: issueCommand() })
  }, onSuccess: async () => { onForm({ input, dirty: false, correction: false }); await onRefresh() } })
  const selectedTemplate = readDiagnosticTemplateSnapshot(input.templateSnapshot)
  const busy = save.isPending || issue.isPending || refreshing || template.isFetching || template.isError
    || Boolean(template.data && !input.templateVersionId)
  if (task.status === 'COMPLETED' && !current.correction) return <section>
    {reports.isFetching ? <LoadingState label="正在核对正式报告…" /> : reports.isSuccess && latest && ['FINAL', 'CORRECTED'].includes(latest.status)
      ? <p>正式报告已签发，内容和签发证据保留在报告历史中。</p> : <Alert>报告完成记录待核对，请重新读取报告历史。</Alert>}
    <Button variant="secondary" disabled={busy || !canEdit || reports.isFetching || !reports.isSuccess || !issuedInput || !latest || !['FINAL', 'CORRECTED'].includes(latest.status)}
      onClick={() => onForm({ input: issuedInput!, dirty: false, correction: true })}>更正报告</Button></section>
  if (template.isPending) return <LoadingState label="正在读取机构报告模板…" />
  if (template.isError) return <section><Alert>{errorMessage(template.error)}</Alert><Button onClick={() => void template.refetch()}>重新读取报告模板</Button></section>
  return <section aria-label="报告编辑" className="diagnostic-editor">
    <div className="diagnostic-editor-head"><h3>{current.correction ? '更正报告' : '录入报告'}</h3>
      <span>{draft.authorName ? `草稿录入：${draft.authorName} · ${formatTime(draft.updatedAt || '')}` : '尚未保存草稿'}</span></div>
    {draft.doubleSignatureRequired && <Alert tone="info">机构启用双签：保存后由另一名医技人员打开草稿直接审核并签发。</Alert>}
    {current.dirty && <Alert tone="info">有未保存内容；切换队列患者后，本工作台会保留输入。</Alert>}
    {(save.error || issue.error) && <Alert>{errorMessage(save.error || issue.error)}</Alert>}
    <DiagnosticTemplateSelection current={template.data ?? null} selected={selectedTemplate} input={input}
      disabled={save.isPending || issue.isPending || refreshing || !canEdit} onChange={change} />
    {task.requestType === 'LABORATORY' ? <><LaboratoryResultEditor rows={input.observations || []} template={selectedTemplate} disabled={busy || !canEdit}
      onChange={(observations) => change({ observations })} /><FormField label="结果说明"><textarea rows={3} disabled={busy || !canEdit}
        value={input.conclusion || ''} onChange={(e) => change({ conclusion: e.target.value })} /></FormField></>
      : <ExaminationReportEditor findings={input.findings || ''} conclusion={input.conclusion || ''} disabled={busy || !canEdit} onChange={change} />}
    {task.requestType === 'EXAMINATION' && <ExaminationImages api={api} task={task} draft={draft}
      disabled={busy || current.dirty || !canEdit} onRefresh={onRefresh} />}
    {current.correction && <FormField label="更正原因" required><textarea rows={2} disabled={busy || !canEdit} value={input.correctionReason || ''}
      onChange={(e) => change({ correctionReason: e.target.value })} /></FormField>}
    <footer className="diagnostic-editor-actions"><div className="ui-form-actions"><Button variant="secondary" busy={save.isPending} disabled={busy || !canEdit || current.correction && !input.correctionReason?.trim()}
      onClick={() => save.mutate()}>保存草稿</Button><Button busy={issue.isPending}
        disabled={busy || !canSign || current.correction && !input.correctionReason?.trim()} onClick={() => issue.mutate()}>
        {draft.doubleSignatureRequired ? '审核并签发' : current.correction ? '签发更正报告' : '签发正式报告'}</Button></div></footer>
  </section>
}
