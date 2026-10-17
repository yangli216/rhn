import type { DiagnosticObservation, DiagnosticReport } from '../api/diagnosticsApi'
import { formatTime } from '../format'
import { diagnosticReportStatusPresentation } from '../presentation'
import { DataTable, StatusBadge } from '../ui'
import { diagnosticObservationValue } from './diagnosticResults'
import type { RhnApi } from '../rhnApi'
import { DiagnosticImagePreview } from './DiagnosticImagePreview'
import { DiagnosticPrintAction } from './DiagnosticPrintAction'

function renderReportObservationFlag(value: DiagnosticObservation) {
  const code = value.interpretationCode?.trim().toUpperCase()
  if (!code) {
    return <span className="diagnostic-empty-dash">未判定</span>
  }
  if (code === 'N' || code === 'NORMAL' || code === 'EQ') {
    return <span className="diagnostic-empty-dash">—</span>
  }
  if (code === 'H' || code === 'HIGH') {
    return <StatusBadge tone="warning">偏高 ↑</StatusBadge>
  }
  if (code === 'L' || code === 'LOW') {
    return <StatusBadge tone="warning">偏低 ↓</StatusBadge>
  }
  if (code === 'HH') {
    return <StatusBadge tone="danger">极高危急 ↑↑</StatusBadge>
  }
  if (code === 'LL') {
    return <StatusBadge tone="danger">极低危急 ↓↓</StatusBadge>
  }
  if (code === 'CRITICAL' || code === 'PANIC') {
    return <StatusBadge tone="danger">★危急值</StatusBadge>
  }
  if (code === 'A' || code === 'ABNORMAL' || code === 'POS' || code === 'POSITIVE') {
    return <StatusBadge tone="warning">异常</StatusBadge>
  }
  return <StatusBadge tone="neutral">{code}</StatusBadge>
}

export function DiagnosticReportViewer({ report, historical = false, api }: { report: DiagnosticReport; historical?: boolean; api?: RhnApi }) {
  const status = diagnosticReportStatusPresentation(report.status)
  const isLab = report.reportType === 'LABORATORY'
  const hasConclusion = Boolean(report.conclusion?.trim())

  return <section aria-label={report.reportName} className="diagnostic-report-summary">
    <header className="diagnostic-report-summary__header">
      <div className="diagnostic-report-summary__main">
        <h3>{report.reportName}</h3>
        <span className="diagnostic-report-summary__version">V{report.reportVersion}</span>
        <StatusBadge tone={historical ? 'neutral' : status.tone}>{historical ? '历史版本' : status.label}</StatusBadge>
        {hasConclusion ? (
          <span className="diagnostic-report-summary__note">
            <strong>{isLab ? '备注：' : '结论：'}</strong>
            <span>{report.conclusion}</span>
          </span>
        ) : isLab ? null : (
          <span className="diagnostic-report-summary__note is-empty">
            <strong>结论：</strong>
            <span>未记录报告结论</span>
          </span>
        )}
      </div>
    </header>
    {report.findings && <p className="diagnostic-report-summary__findings"><strong>检查所见：</strong>{report.findings}</p>}
    {report.observations.length > 0 && <DataTable aria-label="报告指标"><thead><tr>
      <th>指标</th><th>结果</th><th>单位</th><th>参考区间</th><th>标志</th>
    </tr></thead><tbody>{report.observations.map((value) => {
      const code = value.interpretationCode?.trim().toUpperCase()
      const isCritical = ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(code || '')
      const isAbnormal = isCritical || ['H', 'L', 'A', 'HIGH', 'LOW', 'ABNORMAL', 'POS', 'POSITIVE'].includes(code || '')
      const rowClass = isCritical ? 'is-critical is-abnormal' : isAbnormal ? 'is-abnormal' : undefined
      const valueCellClass = isCritical ? 'diagnostic-obs-val--critical' : isAbnormal ? 'diagnostic-obs-val--abnormal' : undefined

      return <tr key={value.id} className={rowClass}>
        <td>{value.observationName}</td>
        <td className={valueCellClass}>{diagnosticObservationValue(value)}</td>
        <td>{value.unitCode || '—'}</td>
        <td>{value.referenceRangeLow ?? '—'}～{value.referenceRangeHigh ?? '—'}</td>
        <td>{renderReportObservationFlag(value)}</td>
      </tr>
    })}</tbody></DataTable>}
    {report.correctionReason && <p className="diagnostic-report-summary__correction">更正原因：{report.correctionReason}</p>}
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
