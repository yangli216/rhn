import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiagnosticReport } from '../api/diagnosticsApi'
import { DiagnosticReportViewer } from './DiagnosticReportViewer'

const base = {
  id: 'report-1', residentId: 'resident-1', encounterId: 'encounter-1', requestId: 'request-1',
  endpointCode: 'LOCAL', externalReportId: 'external-1', reportVersion: 2, status: 'FINAL',
  reportCode: 'R20261017001', reportName: '报告标题', issuedAt: '2026-10-17T08:00:00Z',
  receivedAt: '2026-10-17T08:00:00Z', contentDigestAlgorithm: 'SHA-256', contentDigest: 'digest',
  inboundMessageId: 'message-1', authorName: '录入医生', signerName: '签发医生', observations: [],
} satisfies Omit<DiagnosticReport, 'reportType'>

describe('DiagnosticReportViewer', () => {
  it('uses the common laboratory report column order and highlights abnormal facts', () => {
    const report = { ...base, reportType: 'LABORATORY', observations: [{
      id: 'observation-1', sortOrder: 1, codeSystemUri: 'local', observationCode: 'GLU',
      observationName: '葡萄糖（GLU）', status: 'FINAL', valueType: 'NUMBER', effectiveAt: base.issuedAt,
      valueNumber: 12.6, unitCode: 'mmol/L', referenceRangeLow: 3.9, referenceRangeHigh: 6.1,
      interpretationCode: 'H',
    }] } as DiagnosticReport
    render(<DiagnosticReportViewer report={report} subject={{ patientName: '王某', encounterNo: 'MZ001' }} />)

    const table = screen.getByRole('table', { name: '检验结果明细' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '检验项目', '结果', '提示', '参考范围', '单位',
    ])
    expect(within(table).getByText('葡萄糖（GLU）').closest('tr')).toHaveTextContent('偏高')
    expect(within(table).queryByText('GLU', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('异常 1 项')).toBeInTheDocument()
    expect(screen.getByText('王某')).toBeInTheDocument()
  })

  it('shows examination findings and diagnostic opinion as separate report sections', () => {
    const report = { ...base, reportType: 'IMAGING', findings: '双肺纹理清晰。', conclusion: '未见明显异常。' } as DiagnosticReport
    render(<DiagnosticReportViewer report={report} />)

    expect(screen.getByRole('heading', { name: '检查所见' })).toBeInTheDocument()
    expect(screen.getByText('双肺纹理清晰。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '诊断意见' })).toBeInTheDocument()
    expect(screen.getByText('未见明显异常。')).toBeInTheDocument()
  })
})
