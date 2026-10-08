import { useQuery } from '@tanstack/react-query'
import type { Encounter } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { formatTime } from '../../shared/format'
import { diagnosticObservationValue, requireDiagnosticReports } from '../../shared/clinical/diagnosticResults'
import { diagnosticReportStatusPresentation } from '../../shared/presentation'
import { Alert, Button, EmptyState, Icon, LoadingState, Panel, PanelHead, StatusBadge } from '../../shared/ui'
import { isAbnormalObservation } from './ai/receptionSceneAssessment'

export function OutpatientDiagnosticResults({ encounter, api }: { encounter: Encounter; api: RhnApi }) {
  const reports = useQuery({
    queryKey: ['doctor-reports', encounter.id, encounter.residentId],
    queryFn: async () => requireDiagnosticReports(await api.diagnostics.reportsByEncounter(encounter.id), {
      encounterId: encounter.id, residentId: encounter.residentId,
    }),
  })
  const available = reports.isSuccess && !reports.isFetching
  return <Panel><PanelHead title="本次检查检验结果" meta={available ? `${reports.data.length} 份报告` : '报告数量待核实'}
    actions={<Button size="sm" variant="secondary" busy={reports.isFetching} onClick={() => void reports.refetch()}>
      <Icon name="refresh" />刷新</Button>} />
    {reports.isPending || reports.isFetching ? <LoadingState label="正在读取检查检验报告…" />
      : reports.isError ? <Alert duration={null}>{errorMessage(reports.error)}
        <Button onClick={() => void reports.refetch()}>重新加载报告</Button></Alert>
        : reports.data.length === 0 ? <EmptyState icon="clinical" title="暂无报告" copy="当前就诊尚未查询到报告。" />
          : <div className="doctor-report-list">{reports.data.map((report) => {
            const status = diagnosticReportStatusPresentation(report.status)
            return <article key={report.id}><header>
              <div><strong>{report.reportName}</strong><small>{report.reportCode} · V{report.reportVersion} · {formatTime(report.issuedAt)}</small></div>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge></header>
              <p>{report.conclusion || '未记录报告结论'}</p><div>{report.observations.map((item) => <span key={item.id}
                className={isAbnormalObservation(item) ? 'is-abnormal' : ''}>
                {item.observationName}：{diagnosticObservationValue(item)} {item.unitCode ?? ''}
                {isAbnormalObservation(item) ? ' · 异常' : ''}</span>)}</div>
            </article>
          })}</div>}
  </Panel>
}
