import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DiagnosticReportQueryRow, DiagnosticReportStatus } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import { DiagnosticReportViewer } from '../../../shared/clinical/DiagnosticReportViewer'
import { formatTime } from '../../../shared/format'
import { diagnosticReportStatusPresentation } from '../../../shared/presentation'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, DateRangePicker, Dialog, EmptyState, FormField, LoadingState, Pagination, SearchField, Select, StatusBadge, tableCellClass } from '../../../shared/ui'
import './diagnostic-report-query.css'
import { ListPage, WorkspacePane } from '../../../shared/ui/templates/PageTemplates'
import { getLast30DaysRange } from '../../../shared/utils/dateRange'
import { diagnosticDateBoundary } from './diagnosticWorkbenchModel'

function ReportHistory({ api, row, scope, clinicalContext, onNavigate, canCorrect }: {
  api: RhnApi; row: DiagnosticReportQueryRow; scope: string; clinicalContext: ClinicalContext
  onNavigate: (path: string) => void; canCorrect: boolean
}) {
  const reports = useQuery({ queryKey: ['diagnostic-query-history', scope, row.id], queryFn: async () => {
    const result = await api.diagnostics.reportHistory(row.id)
    if (!Array.isArray(result) || !result.some((report) => report.id === row.id)
      || result.some((report) => report.requestId !== row.requestId || report.encounterId !== row.encounterId
        || report.residentId !== row.residentId || report.reportType !== row.reportType || !Array.isArray(report.observations)))
      throw new Error('报告版本与当前患者或申请不一致，请重新查询。')
    return result
  } })
  const [versionId, setVersionId] = useState(row.id)
  const current = reports.isSuccess ? reports.data[0] : undefined
  const selected = reports.isSuccess ? reports.data.find((report) => report.id === versionId) : undefined
  return <>
    {reports.isPending ? <LoadingState label="正在读取报告和更正记录…" /> : reports.isError
      ? <Alert>{errorMessage(reports.error)}<Button variant="secondary" onClick={() => void reports.refetch()}>重新加载</Button></Alert>
      : <WorkspacePane label="报告正文" resetScrollKey={versionId}>
        {selected && <DiagnosticReportViewer compact stickyHeader report={selected} historical={selected.id !== current?.id} api={api}
          headerActions={<>
            <div className="diagnostic-report-query__version"><Select aria-label="报告版本" size="sm"
              value={versionId} clearable={false} onChange={setVersionId}
              options={reports.data.map((report, index) => ({ value: report.id,
                label: `第 ${report.reportVersion} 版 · ${index === 0 ? '最新记录' : '历史记录'} · ${formatTime(report.issuedAt)}` }))} /></div>
            {row.taskId && canCorrect && current && ['FINAL', 'CORRECTED'].includes(current.status) && <Button size="sm" variant="secondary"
              onClick={() => onNavigate(`/diagnostics/${row.reportType === 'LABORATORY' ? 'laboratory' : 'examination'}?taskId=${encodeURIComponent(row.taskId!)}`)}>进入报告更正</Button>}
          </>}
          subject={{ patientName: row.residentName, healthRecordNo: row.healthRecordNo, requestNo: row.requestNo,
            specimenOrExam: row.specimenNo, organizationName: clinicalContext.organization.name }} />}
      </WorkspacePane>}
  </>
}

export function DiagnosticReportQuery({ api, clinicalContext, requestType, onNavigate, authorities }: {
  api: RhnApi; clinicalContext: ClinicalContext; requestType: 'LABORATORY' | 'EXAMINATION'
  onNavigate: (path: string) => void; authorities?: string[]
}) {
  const laboratory = requestType === 'LABORATORY'
  const title = laboratory ? '检验报告查询' : '检查报告查询'
  const scope = `${clinicalContext.organization.id}:${clinicalContext.department.id}:${requestType}`
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [dates, setDates] = useState(getLast30DaysRange)
  const [filters, setFilters] = useState(() => ({ keyword: '', status: '', ...getLast30DaysRange() }))
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [opened, setOpened] = useState<{ scope: string; row: DiagnosticReportQueryRow }>()
  const canRead = !authorities || authorities.includes('ROLE_ADMIN') || ['VIEW', 'EXECUTE', 'EDIT', 'SIGN'].some((action) => authorities.includes(`DIAGNOSTICS.${requestType}.${action}`))
  const canCorrect = !authorities || authorities.includes('ROLE_ADMIN') || authorities.includes(`DIAGNOSTICS.${requestType}.EDIT`)
  useEffect(() => { setOpened(undefined); setPage(0) }, [scope])
  const reports = useQuery({ queryKey: ['diagnostic-report-query', scope, filters, page], enabled: canRead,
    queryFn: async () => {
      const result = await api.diagnostics.queryReports(requestType, { keyword: filters.keyword,
        status: filters.status ? filters.status as DiagnosticReportStatus : undefined,
        issuedFrom: diagnosticDateBoundary(filters.from), issuedBefore: diagnosticDateBoundary(filters.to, true) }, page)
      if (!result || !Array.isArray(result.content) || result.page !== page || !Number.isInteger(result.totalElements)
        || result.totalElements < 0 || !Number.isInteger(result.totalPages) || result.totalPages < 0
        || result.content.some((row) => !row.id || !row.requestId || !row.residentId || !row.encounterId || !row.issuedAt
          || typeof row.current !== 'boolean' || row.reportType !== (laboratory ? 'LABORATORY' : 'IMAGING')))
        throw new Error('报告查询结果不完整，请重新加载。')
      return result
    } })
  const submit = () => {
    if (dates.from && dates.to && dates.from > dates.to) { setError('签发开始日期不能晚于结束日期'); return }
    setError(''); setFilters({ keyword: keyword.trim(), status, ...dates }); setPage(0); setOpened(undefined)
  }
  const reset = () => {
    setKeyword(''); setStatus(''); setDates({ from: '', to: '' }); setFilters({ keyword: '', status: '', from: '', to: '' })
    setPage(0); setOpened(undefined); setError('')
  }
  const rowPresentation = (row: DiagnosticReportQueryRow) => row.current
    ? diagnosticReportStatusPresentation(row.status) : { label: '历史版本', tone: 'neutral' as const }
  return <>
    <ListPage title={title} description={`查询${clinicalContext.department.name}的已保存报告及更正版本，默认近30天，可清空日期查询历史。`}
      actions={<Button variant="secondary" onClick={() => onNavigate(`/diagnostics/${laboratory ? 'laboratory' : 'examination'}`)}>返回工作台</Button>}
      filters={<>
        <FormField label="患者 / 申请 / 报告 / 项目" className="ui-query-filter--keyword"><SearchField label="查询报告"
          placeholder="姓名、档案号、申请号、报告号、项目或标本号" value={keyword} onChange={setKeyword} onSearch={submit} /></FormField>
        <FormField label="报告状态"><Select value={status} onChange={setStatus} placeholder="全部状态"
          options={(['FINAL', 'CORRECTED', 'PRELIMINARY', 'CANCELLED'] as const).map((value) => ({ value, label: diagnosticReportStatusPresentation(value).label }))} /></FormField>
        <FormField label="签发日期" className="ui-query-filter--date"><DateRangePicker value={dates} onChange={setDates}
          startAriaLabel="签发开始日期" endAriaLabel="签发结束日期" /></FormField>
        <div className="ui-query-filters__actions"><Button onClick={submit}>查询</Button><Button variant="secondary" onClick={reset}>清空条件</Button></div>
      </>}
      feedback={error ? <Alert>{error}</Alert> : undefined}
      resetScrollKey={`${scope}:${JSON.stringify(filters)}:${page}`}
      footer={canRead && reports.isSuccess && <Pagination page={page} totalPages={reports.data.totalPages} total={reports.data.totalElements}
        onChange={(value) => { setPage(value); setOpened(undefined) }} />}> 
      {!canRead ? <Alert>当前账号无权查询此类报告。</Alert> : reports.isPending ? <LoadingState label="正在查询报告…" />
        : reports.isError ? <Alert>{errorMessage(reports.error)}<Button variant="secondary" onClick={() => void reports.refetch()}>重新查询</Button></Alert>
          : reports.data.content.length === 0 ? <EmptyState icon="clinical" title="未找到报告" copy="请调整签发日期或查询条件，草稿请到工作台处理。" />
            : <DataTable aria-label={title}>
              <thead><tr><th>患者 / 档案号</th><th>申请 / 标本号</th><th>项目 / 报告号</th><th>版本</th><th>状态</th><th>签发时间</th><th>签发人</th><th>操作</th></tr></thead>
              <tbody>{reports.data.content.map((row) => { const presentation = rowPresentation(row); return <tr key={row.id}>
                <td>{row.residentName || row.residentId}<div className="text-muted">{row.healthRecordNo || '—'}</div></td>
                <td>{row.requestNo || row.requestId}<div className="text-muted">{row.specimenNo || '—'}</div></td>
                <td>{row.itemName || row.reportName}<div className="text-muted">{row.reportCode}</div></td>
                <td className={tableCellClass('numeric')}>V{row.reportVersion}</td>
                <td className={tableCellClass('status')}><StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge></td>
                <td className={tableCellClass('text')}>{formatTime(row.issuedAt)}</td><td>{row.signerName || '—'}</td>
                <td className={tableCellClass('actions')}><Button size="sm" variant="text" onClick={() => setOpened({ scope, row })}>查看报告</Button></td>
              </tr> })}</tbody>
            </DataTable>}
    </ListPage>
    {opened?.scope === scope && canRead && <Dialog title="报告及更正记录" className="diagnostic-report-query-dialog" size="xwide" onClose={() => setOpened(undefined)}>
      <ReportHistory key={`${scope}:${opened.row.id}`} api={api} row={opened.row} scope={scope} clinicalContext={clinicalContext}
        onNavigate={(path) => { setOpened(undefined); onNavigate(path) }} canCorrect={canCorrect} />
    </Dialog>}
  </>
}
