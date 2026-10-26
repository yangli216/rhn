import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Encounter, Resident } from '../../shared/model'
import type { DiagnosticReport } from '../../shared/api/diagnosticsApi'
import { age, formatTime } from '../../shared/format'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { diagnosticReportStatusPresentation } from '../../shared/presentation'
import { Alert, Button, EmptyState, Icon, LoadingState, PanelHead, StatusBadge } from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { DiagnosticReportViewer } from '../../shared/clinical/DiagnosticReportViewer'
import { isAbnormalObservation } from './ai/receptionSceneAssessment'
import { outpatientReportQueries } from './outpatientReportQueries'
import './outpatient-diagnostic-results.css'

export function OutpatientDiagnosticResults({ encounter, resident, api, historyEncounters = [], preferredReportIds = [], organizationName, departmentName }: {
  encounter: Encounter
  resident: Resident
  api: RhnApi
  historyEncounters?: Encounter[]
  preferredReportIds?: string[]
  organizationName?: string
  departmentName?: string
}) {
  const sources = outpatientReportQueries(api, encounter, historyEncounters)
  const queries = useQueries({ queries: sources })
  const loading = queries.some((query) => query.isPending || query.isFetching)
  const failed = queries.find((query) => query.isError)
  const available = queries.every((query) => query.isSuccess && !query.isFetching)
  const scope = `${encounter.residentId}:${encounter.id}`
  const [selection, setSelection] = useState<{ scope: string; id: string }>()
  const groups = sources.map(({ source }, index) => {
    const reports = [...(queries[index].data ?? [])].sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt)
      || b.reportVersion - a.reportVersion)
    const replaced = new Set(reports.map((report) => report.replacesReportId))
    return { source, entries: reports.map((report) => ({ report, source, historical: replaced.has(report.id) })) }
  }).filter((group) => group.entries.length > 0)
  const entries = groups.flatMap((group) => group.entries)
  const current = entries.filter((entry) => !entry.historical)
  const oldCount = entries.length - current.length
  const selected = (selection?.scope === scope ? entries.find((entry) => entry.report.id === selection.id) : undefined)
    ?? current.find((entry) => preferredReportIds.includes(entry.report.id) && ['FINAL', 'CORRECTED'].includes(entry.report.status))
    ?? current.find((entry) => ['FINAL', 'CORRECTED'].includes(entry.report.status))
    ?? current[0] ?? entries[0]
  const refresh = () => { void Promise.all(queries.map((query) => query.refetch())) }
  const renderEntry = ({ report, historical }: { report: DiagnosticReport; historical: boolean }) => {
    const status = diagnosticReportStatusPresentation(report.status)
    const abnormalCount = report.observations.filter(isAbnormalObservation).length
    return <li key={report.id}>
      <Button variant={selected?.report.id === report.id ? 'soft' : 'text'} className="doctor-report-entry"
        aria-pressed={selected?.report.id === report.id} aria-label={`查看${report.reportName}，第${report.reportVersion}版，${historical ? '历史版本' : status.label}`}
        onClick={() => setSelection({ scope, id: report.id })}>
        <span className="doctor-report-entry__content">
          <span className="doctor-report-entry__heading">
            <strong className="doctor-report-entry__name" title={report.reportName}>{report.reportName}</strong>
            {abnormalCount > 0 && <StatusBadge tone="warning">{`${abnormalCount} 项异常`}</StatusBadge>}
          </span>
          <span className="doctor-report-entry__meta">
            <span className="doctor-report-entry__time">{formatTime(report.issuedAt)}</span>
            <StatusBadge tone={historical ? 'neutral' : status.tone}>{historical ? '历史版本' : status.label}</StatusBadge>
            {(historical || report.reportVersion > 1) && <span>{`第 ${report.reportVersion} 版`}</span>}
          </span>
        </span>
      </Button>
    </li>
  }
  return <section className="doctor-report-browser" aria-label="本次及近期检验检查报告">
    <div className="doctor-report-browser__body">
      <WorkspacePane label="报告目录" header={<PanelHead title="报告目录"
        meta={available ? `${current.length} 份报告${oldCount ? ` · ${oldCount} 个旧版本` : ''}` : '报告数量待核实'}
        actions={<Button size="sm" variant="text" busy={loading} onClick={refresh} aria-label="刷新报告" title="刷新报告">
          <Icon name="refresh" /></Button>} />} resetScrollKey={scope}>
        {loading ? <LoadingState label="正在读取检查检验报告…" />
          : failed ? <Alert duration={null}>{errorMessage(failed.error)}<Button onClick={refresh}>重新加载报告</Button></Alert>
            : !entries.length ? <EmptyState icon="clinical" title="暂无检验检查报告" copy="本次就诊及近14天已完成的就诊尚未查询到报告。" />
              : groups.map(({ source, entries: groupEntries }) => {
                const latest = groupEntries.filter((entry) => !entry.historical)
                const historical = groupEntries.filter((entry) => entry.historical)
                return <section key={source.id} className="doctor-report-group" aria-label={`就诊 ${source.encounterNo} 的报告目录`}>
                  <header className="doctor-report-group__header" title={`${formatTime(source.registeredAt)} · ${source.encounterNo}`}>
                    <h3>{source.id === encounter.id ? '本次就诊' : '历史就诊'}</h3>
                    <span>{formatTime(source.registeredAt)}</span>
                  </header>
                  <ul className="doctor-report-directory">{latest.map(renderEntry)}</ul>
                  {historical.length > 0 && <details className="doctor-report-versions"
                    open={historical.some((entry) => entry.report.id === selected?.report.id) || undefined}>
                    <summary>{`更正前版本（${historical.length}）`}</summary>
                    <ul className="doctor-report-directory">{historical.map(renderEntry)}</ul>
                  </details>}
                </section>
              })}
      </WorkspacePane>
      <WorkspacePane label="报告详情" resetScrollKey={`${scope}:${selected?.report.id ?? ''}`}
        header={<PanelHead title={available && selected
          ? selected.source.id === encounter.id ? '本次就诊报告' : '历史就诊报告' : '报告详情'}
          meta={available && selected ? selected.source.encounterNo : undefined} />}>
        {available && selected ? <DiagnosticReportViewer key={selected.report.id} api={api} report={selected.report} compact
          historical={selected.historical} subject={{
            patientName: resident.fullName,
            genderText: resident.genderText,
            ageText: `${age(resident.birthDate)} 岁`,
            healthRecordNo: resident.healthRecordNo,
            encounterNo: selected.source.encounterNo,
            departmentName: selected.source.departmentId === encounter.departmentId ? departmentName : undefined,
            organizationName: selected.source.organizationId === encounter.organizationId ? organizationName : undefined,
          }} /> : <EmptyState icon="clinical" title={loading ? '报告读取中' : failed ? '报告暂不可用' : '暂无可查看的报告'}
            copy={failed ? '请重新加载报告后查看详情。' : '选择左侧报告后，在此查看完整结果。'} />}
      </WorkspacePane>
    </div>
  </section>
}
