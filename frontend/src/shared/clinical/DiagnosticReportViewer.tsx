import type { ReactNode } from 'react'
import { savedReferenceGuidance } from './nationalStandardLabCatalog'
import type { DiagnosticObservation, DiagnosticReport } from '../api/diagnosticsApi'
import { formatTime } from '../format'
import { diagnosticReportStatusPresentation } from '../presentation'
import { DataTable, StatusBadge, tableCellClass } from '../ui'
import { diagnosticObservationValue } from './diagnosticResults'
import type { RhnApi } from '../rhnApi'
import { DiagnosticImagePreview } from './DiagnosticImagePreview'
import { DiagnosticPrintAction } from './DiagnosticPrintAction'
import './diagnostic-report-viewer.css'

export interface DiagnosticReportSubject {
  patientName?: string
  genderText?: string
  ageText?: string
  healthRecordNo?: string
  encounterNo?: string
  departmentName?: string
  organizationName?: string
  requestNo?: string
  specimenOrExam?: string
}

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

export function DiagnosticReportViewer({ report, historical = false, api, subject, compact = false, headerActions, stickyHeader = false }: {
  report: DiagnosticReport
  historical?: boolean
  api?: RhnApi
  subject?: DiagnosticReportSubject
  compact?: boolean
  headerActions?: ReactNode
  stickyHeader?: boolean
}) {
  const status = diagnosticReportStatusPresentation(report.status)
  const isLab = report.reportType === 'LABORATORY' || (!report.reportType && report.observations.length > 0)
  const abnormalCount = report.observations.filter((value) => {
    const code = value.interpretationCode?.trim().toUpperCase()
    return ['H', 'HH', 'L', 'LL', 'A', 'HIGH', 'LOW', 'ABNORMAL', 'POS', 'POSITIVE', 'CRITICAL', 'PANIC'].includes(code || '')
  }).length
  const criticalCount = report.observations.filter((value) => {
    const code = value.interpretationCode?.trim().toUpperCase()
    return ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(code || '')
  }).length
  const reportNumber = report.reportCode || report.externalReportId || report.id
  const identityFacts: Array<[string, string | undefined]> = [
    ['姓名', subject?.patientName],
    ['性别 / 年龄', [subject?.genderText, subject?.ageText].filter(Boolean).join(' / ')],
    ['门诊 / 住院号', subject?.encounterNo],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]))
  const reportFacts: Array<[string, string | undefined]> = [
    ['健康档案号', subject?.healthRecordNo],
    ['申请科室', subject?.departmentName],
    ['申请单号', subject?.requestNo],
    [isLab ? '标本' : '检查类型', subject?.specimenOrExam],
    ['报告编号', reportNumber],
    ['报告时间', formatTime(report.issuedAt)],
    ...(compact ? [['报告机构', subject?.organizationName], ['报告版本', report.reportVersion ? `第 ${report.reportVersion} 版` : '版本未记录']] : []),
  ].filter((fact): fact is [string, string] => Boolean(fact[1]))
  const facts = <dl className="diagnostic-report-document__facts">
    {(compact ? reportFacts : [...identityFacts, ...reportFacts]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>

  return <section aria-label={report.reportName} className={`diagnostic-report-document${compact ? ' is-compact' : ''}${stickyHeader ? ' has-sticky-header' : ''}`}>
    <header className="diagnostic-report-document__header">
      {!compact && <div className="diagnostic-report-document__kind">{isLab ? '检验报告单' : '检查报告单'}</div>}
      <div className="diagnostic-report-document__title">
        {!compact && subject?.organizationName && <span>{subject.organizationName}</span>}
        <h3>{report.reportName}</h3>
        {!compact && <small>{report.reportVersion ? `第 ${report.reportVersion} 版` : '版本未记录'}</small>}
      </div>
      <div className="diagnostic-report-document__actions">
        {headerActions}
        <StatusBadge tone={historical ? 'neutral' : status.tone}>{historical ? '历史版本' : status.label}</StatusBadge>
        {api && !historical && ['FINAL', 'CORRECTED'].includes(report.status) && <DiagnosticPrintAction key={report.id}
          api={api} encounterId={report.encounterId} sourceId={report.id}
          taskCode={isLab ? 'DIAGNOSTICS.LABORATORY.REPORT.PRINT' : 'DIAGNOSTICS.EXAMINATION.REPORT.PRINT'} />}
      </div>
    </header>
    {compact ? <details className="diagnostic-report-document__context">
      <summary aria-label="展开患者及报告信息">
        {identityFacts.map(([label, value]) => <span key={label} title={label}>{value}</span>)}
        <span className="diagnostic-report-document__context-toggle">患者及报告信息</span>
      </summary>
      {facts}
    </details> : facts}
    {isLab && <div className="diagnostic-report-document__summary" aria-label="检验结果摘要">
      <span>共 {report.observations.length} 项</span>
      <span>异常 {abnormalCount} 项</span>
      {criticalCount > 0 && <strong>危急 {criticalCount} 项</strong>}
    </div>}
    {isLab && report.observations.length > 0 && <div className="diagnostic-report-document__table"><DataTable compact={compact} aria-label="检验结果明细"><thead><tr>
      <th>检验项目</th>
      <th className={tableCellClass('numeric')}>结果</th>
      <th className={tableCellClass('status')}>提示</th>
      <th className={tableCellClass('numeric')}>参考范围</th>
      <th>单位</th>
    </tr></thead><tbody>{report.observations.map((value) => {
      const code = value.interpretationCode?.trim().toUpperCase()
      const isCritical = ['HH', 'LL', 'CRITICAL', 'PANIC'].includes(code || '')
      const isAbnormal = isCritical || ['H', 'L', 'A', 'HIGH', 'LOW', 'ABNORMAL', 'POS', 'POSITIVE'].includes(code || '')
      const rowClass = isCritical ? 'is-critical is-abnormal' : isAbnormal ? 'is-abnormal' : undefined
      const valueCellClass = isCritical ? 'diagnostic-obs-val--critical' : isAbnormal ? 'diagnostic-obs-val--abnormal' : undefined

      return <tr key={value.id} className={rowClass}>
        <td>{value.observationName}</td>
        <td className={`${tableCellClass('numeric')} ${valueCellClass ?? ''}`.trim()}>{diagnosticObservationValue(value)}</td>
        <td className={tableCellClass('status')}>{renderReportObservationFlag(value)}</td>
        <td className={tableCellClass('numeric')}>{value.referenceRangeLow == null && value.referenceRangeHigh == null ? savedReferenceGuidance(value.ruleSnapshot) ?? '—' : `${value.referenceRangeLow ?? '—'}～${value.referenceRangeHigh ?? '—'}`}</td>
        <td>{value.unitCode || '—'}</td>
      </tr>
    })}</tbody></DataTable></div>}
    {!isLab && <div className="diagnostic-report-document__narrative">
      <section><h4>检查所见</h4><p>{report.findings?.trim() || '未记录检查所见'}</p></section>
      <section className="is-conclusion"><h4>诊断意见</h4><p>{report.conclusion?.trim() || '未记录报告结论'}</p></section>
    </div>}
    {isLab && <section className="diagnostic-report-document__comment"><h4>报告备注</h4>
      <p>{report.conclusion?.trim() || '—'}</p></section>}
    {report.correctionReason && <p className="diagnostic-report-document__correction"><strong>更正原因：</strong>{report.correctionReason}</p>}
    {api && report.images && report.images.length > 0 && <div className="diagnostic-image-grid">
      {report.images.map((image) => <DiagnosticImagePreview key={image.id} image={image}
        load={() => api.diagnostics.reportImageContent(report.id, image.id)} />)}
    </div>}
    <footer className="diagnostic-report-document__footer">
      <span>录入：<strong>{report.authorName || '未记录录入人'}</strong></span>
      <span>签发：<strong>{report.signerName || '未记录签发人'}</strong>
        {report.selfVerified === true ? '（单人签发）' : report.selfVerified === false ? '（双签）' : ''}</span>
      <span>签发时间：<strong>{formatTime(report.issuedAt) || '未记录'}</strong></span>
    </footer>
    <p className="diagnostic-report-document__disclaimer">本报告仅对本次送检标本或检查负责，请结合临床情况解释。</p>
  </section>
}
