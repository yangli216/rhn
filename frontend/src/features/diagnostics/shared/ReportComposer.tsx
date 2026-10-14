import { useMemo, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask, DiagnosticReportDraft, LocalDiagnosticReportInput, LocalDiagnosticObservationInput } from '../../../shared/api/diagnosticsApi'
import { readDiagnosticTemplateSnapshot } from '../../../shared/api/diagnosticTemplateTypes'
import { formatTime } from '../../../shared/format'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, FormField, LoadingState } from '../../../shared/ui'
import { LaboratoryResultEditor } from '../laboratory/LaboratoryResultEditor'
import { ExaminationReportEditor } from '../examination/ExaminationReportEditor'
import { ExaminationImages } from '../examination/ExaminationImages'
import { DiagnosticTemplateSelection } from './DiagnosticTemplateSelection'
import { loadTaskReports, type DiagnosticForm } from './diagnosticWorkbenchModel'
import { TaskReports } from './DiagnosticTaskPanels'

export function ReportComposer({ api, task, draft, refreshing, onRefresh, form, onForm, canEdit, canSign }: {
  api: RhnApi; task: DiagnosticExecutionTask; draft: DiagnosticReportDraft; refreshing: boolean
  onRefresh: () => Promise<void>; form?: DiagnosticForm; onForm: (form: DiagnosticForm) => void
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
  if (task.status === 'COMPLETED' && !current.correction) return <section className="diagnostic-scroll" aria-label="正式报告与更正">
    <TaskReports api={api} task={task} />
    {reports.isFetching ? <LoadingState label="正在核对正式报告…" /> : reports.isSuccess && latest && ['FINAL', 'CORRECTED'].includes(latest.status)
      ? <p>正式报告已签发，内容和签发证据保留在报告历史中。</p> : <Alert>报告完成记录待核对，请重新读取报告历史。</Alert>}
    <Button variant="secondary" disabled={busy || !canEdit || reports.isFetching || !reports.isSuccess || !issuedInput || !latest || !['FINAL', 'CORRECTED'].includes(latest.status)}
      onClick={() => onForm({ input: issuedInput!, dirty: false, correction: true })}>更正报告</Button></section>
  if (template.isPending) return <LoadingState label="正在读取机构报告模板…" />
  if (template.isError) return <section><Alert>{errorMessage(template.error)}</Alert><Button onClick={() => void template.refetch()}>重新读取报告模板</Button></section>
  return <section aria-label="报告编辑" className="diagnostic-editor">
    <div className="diagnostic-composer-body" role="region" aria-label="报告编辑正文" tabIndex={0}>
    <div className="diagnostic-editor-head"><h3>{current.correction ? '更正报告' : '录入报告'}</h3>
      <span>{draft.authorName ? `草稿录入：${draft.authorName} · ${formatTime(draft.updatedAt || '')}` : '尚未保存草稿'}</span></div>
    {draft.doubleSignatureRequired && <Alert tone="info" placement="inline">机构启用双签：保存后由另一名医技人员打开草稿直接审核并签发。</Alert>}
    {current.dirty && <Alert tone="info" placement="inline">有未保存内容；切换队列患者后，本工作台会保留输入。</Alert>}
    {save.isSuccess && !current.dirty && <Alert tone="success">报告草稿已保存。</Alert>}
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
    </div>
    <footer className="diagnostic-editor-actions"><div className="diagnostic-sign-target"><strong>{task.residentName} · {task.itemName}</strong><span>{task.healthRecordNo} · {current.dirty ? '未保存' : draft.content ? '草稿已保存' : '尚未保存草稿'}</span></div><div className="ui-form-actions"><Button variant="secondary" busy={save.isPending} disabled={busy || !canEdit || current.correction && !input.correctionReason?.trim()}
      onClick={() => save.mutate()}>保存草稿</Button><Button busy={issue.isPending}
        disabled={busy || !canSign || current.correction && !input.correctionReason?.trim()} onClick={() => issue.mutate()}>
        {draft.doubleSignatureRequired ? '审核并签发' : current.correction ? '签发更正报告' : '签发正式报告'}</Button></div></footer>
  </section>
}
