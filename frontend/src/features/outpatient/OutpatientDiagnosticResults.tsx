import { useQuery } from '@tanstack/react-query'
import type { Encounter, Resident } from '../../shared/model'
import { age } from '../../shared/format'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { requireDiagnosticReports } from '../../shared/clinical/diagnosticResults'
import { Alert, Button, EmptyState, Icon, LoadingState, Panel, PanelHead } from '../../shared/ui'
import { DiagnosticReportViewer } from '../../shared/clinical/DiagnosticReportViewer'

export function OutpatientDiagnosticResults({ encounter, resident, api, organizationName, departmentName }: {
  encounter: Encounter
  resident: Resident
  api: RhnApi
  organizationName?: string
  departmentName?: string
}) {
  const reports = useQuery({
    queryKey: ['doctor-reports', encounter.id, encounter.residentId],
    queryFn: async () => requireDiagnosticReports(await api.diagnostics.reportsByEncounter(encounter.id), {
      encounterId: encounter.id, residentId: encounter.residentId,
    }),
  })
  const available = reports.isSuccess && !reports.isFetching
  return <Panel><PanelHead title="本次检验检查报告" meta={available ? `${reports.data.length} 份报告` : '报告数量待核实'}
    actions={<Button size="sm" variant="secondary" busy={reports.isFetching} onClick={() => void reports.refetch()}>
      <Icon name="refresh" />刷新</Button>} />
    {reports.isPending || reports.isFetching ? <LoadingState label="正在读取检查检验报告…" />
      : reports.isError ? <Alert duration={null}>{errorMessage(reports.error)}
        <Button onClick={() => void reports.refetch()}>重新加载报告</Button></Alert>
        : reports.data.length === 0 ? <EmptyState icon="clinical" title="暂无检验检查报告" copy="当前就诊尚未查询到已签发的报告。" />
          : <div className="doctor-report-list">{reports.data.map((report) => <DiagnosticReportViewer key={report.id} api={api} report={report}
            historical={reports.data.some((other) => other.replacesReportId === report.id)} subject={{
              patientName: resident.fullName,
              genderText: resident.genderText,
              ageText: `${age(resident.birthDate)} 岁`,
              healthRecordNo: resident.healthRecordNo,
              encounterNo: encounter.encounterNo,
              departmentName,
              organizationName,
            }} />)}</div>}
  </Panel>
}
