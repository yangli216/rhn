import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatTime } from '../../shared/format'
import { requireActiveCriticalValues } from '../../shared/clinical/criticalValueFacts'
import { diagnosticObservationValue, requireDiagnosticReports } from '../../shared/clinical/diagnosticResults'
import type { CriticalValueAlert, DiagnosticObservation, DiagnosticReport } from '../../shared/api/diagnosticsApi'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import { criticalValueStatusPresentation, diagnosticReportStatusPresentation } from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, Panel, Select, StatusBadge } from '../../shared/ui'
import './inpatient-diagnostics.css'

export function InpatientDiagnosticResults({ api, episode }: { api: RhnApi; episode: InpatientEpisode }) {
  const reports = useQuery({
    queryKey: ['inpatient-diagnostic-reports', episode.encounterId, episode.residentId],
    queryFn: async () => {
      const result = await api.diagnostics.reportsByEncounter(episode.encounterId)
      return requireDiagnosticReports(result, episode)
    },
  })
  const criticalValues = useQuery({
    queryKey: ['inpatient-critical-values', episode.encounterId, episode.residentId],
    queryFn: async () => {
      const result = requireActiveCriticalValues(await api.diagnostics.criticalValues.active())
      const current = result.filter((value) => value.encounterId === episode.encounterId)
      if (current.some((value) => value.residentId !== episode.residentId)) {
        throw new Error('危急值患者与当前就诊不一致，请核实。')
      }
      return current
    },
  })
  const reportsAvailable = reports.isSuccess && !reports.isFetching
  const values = reportsAvailable ? reports.data : []
  const activeCriticalValues = criticalValues.isSuccess && !criticalValues.isFetching ? criticalValues.data : []
  return <Panel className="inpatient-diagnostic-results" aria-labelledby="inpatient-diagnostic-results-heading">
    <header className="inpatient-section-head"><div><h2 id="inpatient-diagnostic-results-heading">检查检验结果</h2>
      <span>医技科室完成后自动回到本次住院，无需重复录入</span></div>
      <small>{reportsAvailable ? `${values.length} 份报告` : '报告数量待核实'}</small></header>
    {(criticalValues.isPending || criticalValues.isFetching) && <LoadingState label="正在核实住院危急值…" />}
    {criticalValues.error && <Alert>{errorMessage(criticalValues.error)}
      <Button onClick={() => void criticalValues.refetch()}>重试读取危急值</Button></Alert>}
    {activeCriticalValues.length > 0 && <section className="inpatient-critical-values" aria-label="住院危急值待办">
      <header><strong>危急值待办</strong><span>{activeCriticalValues.length} 项待处理</span></header>
      {activeCriticalValues.map((value) => <CriticalValueCard key={`${value.id}:${value.revision}`} api={api} value={value}
        encounterId={episode.encounterId} refreshing={criticalValues.isFetching} />)}
    </section>}
    {reports.isPending || reports.isFetching ? <LoadingState label="正在读取检查检验报告…" />
      : reports.error ? <Alert>{errorMessage(reports.error)}</Alert>
        : values.length === 0 ? <EmptyState icon="clinical" title="暂无检查检验报告"
          copy="住院诊疗医嘱在医技科室完成后，报告会显示在这里。" />
          : <div className="inpatient-diagnostic-results__list">{values.map((report) =>
            <DiagnosticReportCard key={report.id} value={report} />)}</div>}
  </Panel>
}

function CriticalValueCard({ api, value, encounterId, refreshing }: {
  api: RhnApi; value: CriticalValueAlert; encounterId: string; refreshing: boolean
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [disposition, setDisposition] = useState('')
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['inpatient-critical-values', encounterId] }),
    queryClient.invalidateQueries({ queryKey: ['critical-values'] }),
    queryClient.invalidateQueries({ queryKey: ['work-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['portal-summary'] }),
  ])
  const acknowledge = useMutation({
    mutationFn: () => {
      if (refreshing) throw new Error('危急值状态正在更新，请稍后重试')
      return api.diagnostics.criticalValues.acknowledge(value.id, value.revision, note.trim() || undefined)
    },
    onSuccess: refresh,
  })
  const close = useMutation({
    mutationFn: () => {
      if (refreshing) throw new Error('危急值状态正在更新，请稍后重试')
      if (!disposition) throw new Error('请选择实际处置结果')
      return api.diagnostics.criticalValues.close(value.id, value.revision, disposition, note.trim() || undefined)
    },
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
      {value.status === 'ACKNOWLEDGED' && <FormField label="处置结果" required><Select value={disposition}
        placeholder="请选择实际处置结果" clearable={false} searchable={false} options={[
          { value: 'TREATED', label: '已采取治疗措施' },
          { value: 'RETEST_ORDERED', label: '已安排复检' },
          { value: 'CLINICALLY_ACCEPTED', label: '结合临床接受结果' },
        ]} onChange={setDisposition} /></FormField>}
      <FormField label={value.status === 'ACKNOWLEDGED' ? '处置记录' : '确认说明'}><input value={note}
        placeholder={value.status === 'ACKNOWLEDGED' ? '记录处理措施和患者情况' : '可填写通知或初步处理情况'}
        onChange={(event) => setNote(event.target.value)} /></FormField>
      {value.status === 'ACKNOWLEDGED'
        ? <Button busy={close.isPending} disabled={!disposition || refreshing} onClick={() => close.mutate()}>记录处置并关闭</Button>
        : <Button busy={acknowledge.isPending} disabled={refreshing} onClick={() => acknowledge.mutate()}>确认已知晓</Button>}
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
    <footer>{value.authorName || '报告人未记录'} · 版本 {value.reportVersion}
      {value.status === 'CORRECTED' ? '（更正）' : ''}</footer>
  </article>
}

function ObservationRow({ value }: { value: DiagnosticObservation }) {
  const abnormal = ['H', 'HH', 'L', 'LL', 'A', 'CRITICAL', 'PANIC'].includes(value.interpretationCode ?? '')
  return <span className={abnormal ? 'is-abnormal' : ''}><strong>{value.observationName}</strong>
    <b>{diagnosticObservationValue(value)}{value.unitCode ? ` ${value.unitCode}` : ''}</b>
    {(value.referenceRangeLow !== undefined || value.referenceRangeHigh !== undefined) && <small>
      参考 {value.referenceRangeLow ?? '—'}–{value.referenceRangeHigh ?? '—'}</small>}</span>
}
