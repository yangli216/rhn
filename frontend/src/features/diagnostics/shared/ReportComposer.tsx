import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask, DiagnosticReportDraft, LocalDiagnosticReportInput, LocalDiagnosticObservationInput } from '../../../shared/api/diagnosticsApi'
import { readDiagnosticTemplateSnapshot } from '../../../shared/api/diagnosticTemplateTypes'
import {
  extractPatientConditions,
  defaultReferenceNote,
  matchApplicableReferenceRule,
  matchPresetTemplateByTask,
  nationalTemplateAsVersion,
} from '../../../shared/clinical/nationalStandardLabCatalog'
import { formatTime } from '../../../shared/format'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, FormField, LoadingState } from '../../../shared/ui'
import { LaboratoryResultEditor } from '../laboratory/LaboratoryResultEditor'
import { CriticalValueNoticeModal } from '../laboratory/CriticalValueNoticeModal'
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
    return value ?? null
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

  const presetTemplate = useMemo(() => {
    if (task.requestType !== 'LABORATORY') return undefined
    return matchPresetTemplateByTask({ itemName: task.itemName, itemCode: task.itemCode })
  }, [task.requestType, task.itemName, task.itemCode])

  const initial = useMemo<LocalDiagnosticReportInput>(() => {
    if (draft.content) return draft.content
    if (task.requestType === 'LABORATORY' && template.data) {
      return {
        expectedRevision: task.revision, findings: '', conclusion: defaultReferenceNote(template.data), templateVersionId: template.data.id,
        templateSnapshot: JSON.stringify(template.data),
        observations: template.data.content.indicators.map((indicator) => ({
          observationCode: indicator.code, observationName: indicator.name, valueType: indicator.valueType,
          observationValue: '', unitCode: indicator.unitCode,
          valueComparator: indicator.valueType === 'NUMBER' ? 'EQ' as const : undefined,
        })),
      }
    }
    if (presetTemplate) {
      const patientConditions = extractPatientConditions({ gender: task.gender, birthDate: task.birthDate })
      const observations: LocalDiagnosticObservationInput[] = presetTemplate.content.indicators.map((ind) => {
        const rule = matchApplicableReferenceRule(ind.rules, patientConditions)
        return {
          observationCode: ind.code,
          observationName: ind.name,
          valueType: ind.valueType,
          observationValue: '',
          unitCode: ind.unitCode,
          referenceRangeLow: rule?.referenceLow,
          referenceRangeHigh: rule?.referenceHigh,
          valueComparator: ind.valueType === 'NUMBER' ? 'EQ' : undefined,
        }
      })
      return {
        expectedRevision: task.revision,
        findings: '',
        conclusion: defaultReferenceNote(nationalTemplateAsVersion(presetTemplate)),
        templateSnapshot: JSON.stringify(nationalTemplateAsVersion(presetTemplate)),
        observations,
      }
    }
    return {
      expectedRevision: task.revision,
      findings: '',
      conclusion: '',
      observations: [{
        observationCode: task.itemCode,
        observationName: task.itemName,
        valueType: 'NUMBER' as const,
        observationValue: '',
      }],
    }
  }, [draft.content, template.data, presetTemplate, task.requestType, task.revision, task.itemCode, task.itemName, task.gender, task.birthDate])
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
  const [showCriticalNotice, setShowCriticalNotice] = useState(false)
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setPortalNode(document.getElementById('diagnostic-tab-actions'))
  }, [])
  const criticalObservations = useMemo(() => {
    if (task.requestType !== 'LABORATORY' || !input.observations) return []
    return input.observations
      .filter(
        (obs) =>
          obs.interpretationCode === 'LL' ||
          obs.interpretationCode === 'HH' ||
          obs.interpretationCode === 'CRITICAL' ||
          obs.interpretationCode === 'PANIC'
      )
      .map((obs) => ({
        itemName: obs.observationName,
        itemCode: obs.observationCode,
        value: obs.observationValue,
        unit: obs.unitCode,
        flag: obs.interpretationCode,
        referenceRange:
          obs.referenceRangeLow != null || obs.referenceRangeHigh != null
            ? `${obs.referenceRangeLow ?? '—'} ~ ${obs.referenceRangeHigh ?? '—'}`
            : undefined,
      }))
  }, [task.requestType, input.observations])

  const handleIssueClick = () => {
    if (
      task.requestType === 'LABORATORY' &&
      criticalObservations.length > 0 &&
      !input.conclusion?.includes('【危急值通报闭环】')
    ) {
      setShowCriticalNotice(true)
      return
    }
    issue.mutate()
  }

  const handleConfirmCriticalNotice = (noticeRecord: string) => {
    const updatedConclusion = input.conclusion?.trim()
      ? `${input.conclusion.trim()}\n\n${noticeRecord}`
      : noticeRecord
    change({ conclusion: updatedConclusion })
    setShowCriticalNotice(false)
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
  const busy = save.isPending || issue.isPending || refreshing || (template.isPending && !template.data) || template.isError
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
    {task.requestType === 'EXAMINATION' && (
      <div className="diagnostic-editor-head"><h3>{current.correction ? '更正报告' : '录入报告'}<small>结构化影像报告 · WS 445.11</small></h3>
        <span>{draft.authorName ? `草稿录入：${draft.authorName} · ${formatTime(draft.updatedAt || '')}` : '尚未保存草稿'}</span></div>
    )}
    {draft.doubleSignatureRequired && <Alert tone="info" placement="inline">机构启用双签：保存后由另一名医技人员打开草稿直接审核并签发。</Alert>}
    {save.isSuccess && !current.dirty && <Alert tone="success">报告草稿已保存。</Alert>}
    {(save.error || issue.error) && <Alert>{errorMessage(save.error || issue.error)}</Alert>}
    <DiagnosticTemplateSelection current={template.data ?? null} selected={selectedTemplate} input={input}
      disabled={save.isPending || issue.isPending || refreshing || !canEdit} onChange={change} />
    {task.requestType === 'LABORATORY' ? <><LaboratoryResultEditor rows={input.observations || []} template={selectedTemplate}
      disabled={busy || !canEdit} presetTemplates={presetTemplate ? [presetTemplate] : []} patient={{ gender: task.gender, birthDate: task.birthDate }}
      title={current.correction ? '更正检验结果' : '检验结果录入'}
      dirty={current.dirty}
      draftAuthor={draft.authorName}
      onChange={(observations) => change({ observations })}
      onApplyTemplate={(tpl) => {
        const patientConditions = extractPatientConditions({ gender: task.gender, birthDate: task.birthDate })
        const newRows: LocalDiagnosticObservationInput[] = tpl.content.indicators.map((ind) => {
          const rule = matchApplicableReferenceRule(ind.rules, patientConditions)
          return {
            observationCode: ind.code,
            observationName: ind.name,
            valueType: ind.valueType,
            observationValue: '',
            unitCode: ind.unitCode,
            referenceRangeLow: rule?.referenceLow,
            referenceRangeHigh: rule?.referenceHigh,
          }
        })
        change({
          observations: newRows,
          templateSnapshot: JSON.stringify(nationalTemplateAsVersion(tpl)),
        })
      }} /><FormField label="结果说明 / 备注 (选填)" className="diagnostic-conclusion-field"><textarea rows={2} disabled={busy || !canEdit}
        placeholder="常规检验无需填写；如有标本异常（如溶血/脂血）或特殊临床提醒可在此补充说明"
        value={input.conclusion || ''} onChange={(e) => change({ conclusion: e.target.value })} /></FormField></>
      : <ExaminationReportEditor findings={input.findings || ''} conclusion={input.conclusion || ''} disabled={busy || !canEdit} onChange={change} />}
    {task.requestType === 'EXAMINATION' && <ExaminationImages api={api} task={task} draft={draft}
      disabled={busy || !canEdit} dirty={current.dirty} onRefresh={onRefresh} />}
    {current.correction && <FormField label="更正原因" required><textarea rows={2} disabled={busy || !canEdit} value={input.correctionReason || ''}
      onChange={(e) => change({ correctionReason: e.target.value })} /></FormField>}
    </div>
    {portalNode ? createPortal(
      <div className="diagnostic-tab-action-buttons">
        <Button variant="secondary" size="sm" busy={save.isPending}
          disabled={busy || !canEdit || (current.correction && !input.correctionReason?.trim())}
          onClick={() => save.mutate()}>保存草稿</Button>
        <Button size="sm" busy={issue.isPending}
          disabled={busy || !canSign || (current.correction && !input.correctionReason?.trim())}
          onClick={handleIssueClick}>
          {draft.doubleSignatureRequired ? '审核并签发' : current.correction ? '签发更正报告' : '签发正式报告'}
        </Button>
      </div>,
      portalNode
    ) : (
      <footer className="diagnostic-editor-actions">
        <div className="diagnostic-tab-action-buttons">
          <Button variant="secondary" size="sm" busy={save.isPending}
            disabled={busy || !canEdit || (current.correction && !input.correctionReason?.trim())}
            onClick={() => save.mutate()}>保存草稿</Button>
          <Button size="sm" busy={issue.isPending}
            disabled={busy || !canSign || (current.correction && !input.correctionReason?.trim())}
            onClick={handleIssueClick}>
            {draft.doubleSignatureRequired ? '审核并签发' : current.correction ? '签发更正报告' : '签发正式报告'}
          </Button>
        </div>
      </footer>
    )}
    {showCriticalNotice && (
      <CriticalValueNoticeModal
        isOpen={true}
        onClose={() => setShowCriticalNotice(false)}
        criticalItems={criticalObservations}
        patientName={task.residentName}
        healthRecordNo={task.healthRecordNo}
        operatorName={draft.authorName || '检验技师'}
        onConfirmNotice={handleConfirmCriticalNotice}
      />
    )}
  </section>
}
