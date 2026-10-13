import type { DiagnosticReport } from '../api/diagnosticsApi'
import { formatTime } from '../format'
import { diagnosticReportStatusPresentation } from '../presentation'
import { DataTable, StatusBadge } from '../ui'
import { diagnosticObservationValue, diagnosticRuleStatus } from './diagnosticResults'
import type { RhnApi } from '../rhnApi'
import { DiagnosticImagePreview } from './DiagnosticImagePreview'
import { DiagnosticPrintAction } from './DiagnosticPrintAction'

export function DiagnosticReportViewer({ report, historical = false, api }: { report: DiagnosticReport; historical?: boolean; api?: RhnApi }) {
  const status = diagnosticReportStatusPresentation(report.status)
  return <section aria-label={report.reportName} className="diagnostic-report-summary">
    <header><div><span>{status.label} · V{report.reportVersion}</span><h3>{report.reportName}</h3></div>
      <StatusBadge tone={historical ? 'neutral' : status.tone}>{historical ? '历史版本' : status.label}</StatusBadge></header>
    {report.findings && <p><strong>检查所见：</strong>{report.findings}</p>}
    <p><strong>结论：</strong>{report.conclusion || '未记录报告结论'}</p>
    {report.observations.length > 0 && <DataTable aria-label="报告指标"><thead><tr>
      <th>指标</th><th>结果</th><th>单位</th><th>参考区间</th><th>标志</th>
    </tr></thead><tbody>{report.observations.map((value) => <tr key={value.id}
      className={['H', 'HH', 'L', 'LL', 'A', 'CRITICAL', 'PANIC'].includes(value.interpretationCode || '') ? 'is-abnormal' : undefined}>
      <td>{value.observationName}</td><td>{diagnosticObservationValue(value)}</td><td>{value.unitCode || '—'}</td>
      <td>{value.referenceRangeLow ?? '—'}～{value.referenceRangeHigh ?? '—'}</td>
      <td>{value.interpretationCode || '未判定'}{diagnosticRuleStatus(value.ruleStatus) && <small>{diagnosticRuleStatus(value.ruleStatus)}</small>}</td>
    </tr>)}</tbody></DataTable>}
    {report.correctionReason && <p>更正原因：{report.correctionReason}</p>}
    {api && report.images && report.images.length > 0 && <div className="diagnostic-image-grid">
      {report.images.map((image) => <DiagnosticImagePreview key={image.id} image={image}
        load={() => api.diagnostics.reportImageContent(report.id, image.id)} />)}
    </div>}
    {api && !historical && ['FINAL', 'CORRECTED'].includes(report.status) && <DiagnosticPrintAction key={report.id}
      api={api} encounterId={report.encounterId} sourceId={report.id}
      taskCode={report.reportType === 'LABORATORY' ? 'DIAGNOSTICS.LABORATORY.REPORT.PRINT' : 'DIAGNOSTICS.EXAMINATION.REPORT.PRINT'} />}
    <footer>录入：{report.authorName || '未记录录入人'} · 签发：{report.signerName || '未记录签发人'}
      {report.selfVerified === true ? '（单人签发）' : report.selfVerified === false ? '（双签）' : ''} · {formatTime(report.issuedAt)}</footer>
  </section>
}
