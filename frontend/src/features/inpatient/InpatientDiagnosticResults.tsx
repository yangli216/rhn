import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatTime } from '../../shared/format'
import type { CriticalValueAlert, DiagnosticObservation, DiagnosticReport } from '../../shared/api/diagnosticsApi'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import { criticalValueStatusPresentation, diagnosticReportStatusPresentation } from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, Panel, Select, StatusBadge } from '../../shared/ui'
import './inpatient-diagnostics.css'

export function InpatientDiagnosticResults({ api, episode }: { api: RhnApi; episode: InpatientEpisode }) {
  const reports = useQuery({
    queryKey: ['inpatient-diagnostic-reports', episode.encounterId],
    queryFn: () => api.diagnostics.reportsByEncounter(episode.encounterId),
  })
  const criticalValues = useQuery({
    queryKey: ['inpatient-critical-values', episode.encounterId],
    queryFn: async () => (await api.diagnostics.criticalValues.active())
      .filter((value) => value.encounterId === episode.encounterId),
  })
  const values = reports.data ?? []
  return <Panel className="inpatient-diagnostic-results" aria-labelledby="inpatient-diagnostic-results-heading">
    <header className="inpatient-section-head"><div><h2 id="inpatient-diagnostic-results-heading">检查检验结果</h2>
      <span>医技科室完成后自动回到本次住院，无需重复录入</span></div>
      <small>{values.length} 份报告</small></header>
    {criticalValues.error && <Alert>{errorMessage(criticalValues.error)}</Alert>}
    {(criticalValues.data ?? []).length > 0 && <section className="inpatient-critical-values" aria-label="住院危急值待办">
      <header><strong>危急值待办</strong><span>{criticalValues.data?.length} 项需要病区确认</span></header>
      {criticalValues.data?.map((value) => <CriticalValueCard key={value.id} api={api} value={value}
        encounterId={episode.encounterId} />)}
    </section>}
    {reports.isPending ? <LoadingState label="正在读取检查检验报告…" />
      : reports.error ? <Alert>{errorMessage(reports.error)}</Alert>
        : values.length === 0 ? <EmptyState icon="clinical" title="暂无检查检验报告"
          copy="住院诊疗医嘱在医技科室完成后，报告会显示在这里。" />
          : <div className="inpatient-diagnostic-results__list">{values.map((report) =>
            <DiagnosticReportCard key={report.id} value={report} />)}</div>}
  </Panel>
}

function CriticalValueCard({ api, value, encounterId }: {
  api: RhnApi; value: CriticalValueAlert; encounterId: string
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [disposition, setDisposition] = useState('TREATED')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['inpatient-critical-values', encounterId] })
  const acknowledge = useMutation({
    mutationFn: () => api.diagnostics.criticalValues.acknowledge(value.id, value.revision, note || undefined),
    onSuccess: refresh,
  })
  const close = useMutation({
    mutationFn: () => api.diagnostics.criticalValues.close(
      value.id, value.revision, disposition, note || undefined,
    ),
    onSuccess: refresh,
  })
  const error = acknowledge.error || close.error
  const status = criticalValueStatusPresentation(value.status)
  return <article className={`inpatient-critical-value is-${value.status.toLowerCase()}`}>
    <div className="inpatient-critical-value__summary"><div><strong>{value.observationName}</strong>
      <span>{value.triggerEvidence}</span></div>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
    <small>发现于 {formatTime(value.detectedAt)} · 确认时限 {formatTime(value.acknowledgeDeadlineAt)}</small>
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="inpatient-critical-value__action">
      {value.status === 'ACKNOWLEDGED' && <FormField label="处置结果"><Select value={disposition}
        clearable={false} searchable={false} options={[
          { value: 'TREATED', label: '已采取治疗措施' },
          { value: 'RETEST_ORDERED', label: '已安排复检' },
          { value: 'CLINICALLY_ACCEPTED', label: '结合临床接受结果' },
        ]} onChange={setDisposition} /></FormField>}
      <FormField label={value.status === 'ACKNOWLEDGED' ? '处置记录' : '确认说明'}><input value={note}
        placeholder={value.status === 'ACKNOWLEDGED' ? '记录处理措施和患者情况' : '可填写通知或初步处理情况'}
        onChange={(event) => setNote(event.target.value)} /></FormField>
      {value.status === 'ACKNOWLEDGED'
        ? <Button busy={close.isPending} onClick={() => close.mutate()}>记录处置并关闭</Button>
        : <Button busy={acknowledge.isPending} onClick={() => acknowledge.mutate()}>确认已知晓</Button>}
    </div>
  </article>
}

function DiagnosticReportCard({ value }: { value: DiagnosticReport }) {
  const status = diagnosticReportStatusPresentation(value.status)
  return <article><header><div><span>{value.reportType === 'LABORATORY' ? '检验' : '检查'}</span>
    <strong>{value.reportName}</strong><small>{value.reportCode} · {formatTime(value.issuedAt)}</small></div>
    <StatusBadge tone={status.tone}>{status.label}</StatusBadge></header>
    {value.conclusion && <p><b>结论：</b>{value.conclusion}</p>}
    {value.observations.length > 0 && <div className="inpatient-diagnostic-results__observations">
      {value.observations.map((item) => <ObservationRow key={item.id} value={item} />)}
    </div>}
    <footer>{value.authorName || '医技科室'} · 版本 {value.reportVersion}
      {value.status === 'CORRECTED' ? '（更正）' : ''}</footer>
  </article>
}

function ObservationRow({ value }: { value: DiagnosticObservation }) {
  const abnormal = ['H', 'HH', 'L', 'LL', 'A', 'CRITICAL', 'PANIC'].includes(value.interpretationCode ?? '')
  return <span className={abnormal ? 'is-abnormal' : ''}><strong>{value.observationName}</strong>
    <b>{observationValue(value)}{value.unitCode ? ` ${value.unitCode}` : ''}</b>
    {(value.referenceRangeLow !== undefined || value.referenceRangeHigh !== undefined) && <small>
      参考 {value.referenceRangeLow ?? '—'}–{value.referenceRangeHigh ?? '—'}</small>}</span>
}

function observationValue(value: DiagnosticObservation) {
  if (value.valueNumber !== undefined) return value.valueNumber
  if (value.valueString !== undefined) return value.valueString
  if (value.valueCode !== undefined) return value.valueCode
  if (value.valueBoolean !== undefined) return value.valueBoolean ? '是' : '否'
  if (value.valueDateTime !== undefined) return formatTime(value.valueDateTime)
  return '—'
}
