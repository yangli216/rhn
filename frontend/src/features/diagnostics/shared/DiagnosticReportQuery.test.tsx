import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticReport, DiagnosticReportQueryRow } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { RhnApi } from '../../../shared/rhnApi'
import { DiagnosticReportQuery } from './DiagnosticReportQuery'

vi.mock('../../../shared/clinical/DiagnosticPrintAction', () => ({ DiagnosticPrintAction: ({ sourceId }: { sourceId: string }) => <span>打印版本 {sourceId}</span> }))
const context = { organization: { id: 'org1', name: '测试医院' }, department: { id: 'dept1', name: '检验科' } } as ClinicalContext
const row: DiagnosticReportQueryRow = { id: 'r1', taskId: 'old-task', requestId: 'req1', residentId: 'p1', encounterId: 'e1',
  residentName: '患者甲', healthRecordNo: 'HR1', requestNo: 'REQ1', reportCode: 'REP1', reportName: '肝功能报告',
  reportType: 'LABORATORY', status: 'FINAL', issuedAt: '2024-01-01T00:00:00Z', reportVersion: 1, current: false }
const old: DiagnosticReport = { ...row, contentDigestAlgorithm: 'SHA-256', contentDigest: 'frozen', inboundMessageId: 'm1', observations: [], conclusion: '冻结的旧结论', endpointCode: 'RHN-LOCAL', externalReportId: 'REP1', receivedAt: '2024-01-01T00:00:00Z' }
const corrected: DiagnosticReport = { ...old, id: 'r2', reportVersion: 2, status: 'CORRECTED', replacesReportId: 'r1', correctionReason: '复核更正', conclusion: '更正结论' }
function setup({ type = 'LABORATORY', query = vi.fn().mockResolvedValue({ content: [row], totalElements: 21, totalPages: 2, page: 0, size: 20 }), authorities, history = [corrected, old] }: {
  type?: 'LABORATORY' | 'EXAMINATION'; query?: ReturnType<typeof vi.fn>; authorities?: string[]; history?: DiagnosticReport[]
} = {}) {
  const api = { diagnostics: { queryReports: query, reportHistory: vi.fn().mockResolvedValue(history) } } as unknown as RhnApi
  const navigate = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (ctx = context) => <QueryClientProvider client={client}><DiagnosticReportQuery api={api} clinicalContext={ctx}
    requestType={type} onNavigate={navigate} authorities={authorities} /></QueryClientProvider>
  return { api, navigate, query, ...render(view()), view }
}

describe('independent diagnostic report queries', () => {
  it('queries the full history after clearing dates and sends filters before server paging', async () => {
    const { query } = setup()
    await screen.findByText('患者甲')
    expect(query.mock.calls[0][1]).toMatchObject({ issuedFrom: expect.any(String), issuedBefore: expect.any(String) })
    fireEvent.click(screen.getByRole('button', { name: '清空条件' }))
    await waitFor(() => expect(query).toHaveBeenLastCalledWith('LABORATORY', { keyword: '', status: undefined, issuedFrom: undefined, issuedBefore: undefined }, 0))
    fireEvent.change(screen.getByLabelText('查询报告'), { target: { value: 'REP1' } })
    fireEvent.change(screen.getByLabelText('签发开始日期'), { target: { value: '2024-01-01' } })
    fireEvent.change(screen.getByLabelText('签发结束日期'), { target: { value: '2024-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^查询$/ }))
    await waitFor(() => expect(query).toHaveBeenLastCalledWith('LABORATORY', expect.objectContaining({ keyword: 'REP1',
      issuedFrom: new Date(2024, 0, 1).toISOString(), issuedBefore: new Date(2024, 0, 2).toISOString() }), 0))
  })

  it('keeps historic contents read only, shows correction evidence, and prints only the current version', async () => {
    const { api, navigate } = setup()
    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    expect(await screen.findByText('冻结的旧结论')).toBeInTheDocument()
    expect(api.diagnostics.reportHistory).toHaveBeenCalledWith('r1')
    expect(screen.queryByText('打印版本 r1')).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: /第 2 版/ }))
    expect(screen.getByText('复核更正')).toBeInTheDocument()
    expect(screen.getByText('打印版本 r2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '进入报告更正' }))
    expect(navigate).toHaveBeenCalledWith('/diagnostics/laboratory?taskId=old-task')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '更正原因' })).not.toBeInTheDocument()
  })

  it('keeps long reports in a keyboard-accessible reading region and resets it when switching versions', async () => {
    setup({ history: [corrected, { ...old, conclusion: '长报告末尾内容\n'.repeat(100) }] })
    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    const reading = await screen.findByRole('region', { name: '报告正文内容' })
    expect(reading).toHaveAttribute('tabindex', '0')
    expect(within(reading).getByText(/长报告末尾内容/)).toBeInTheDocument()
    const report = within(reading).getByRole('region', { name: '肝功能报告' })
    expect(within(report.querySelector('header')!).getByRole('combobox', { name: '报告版本' })).toBeInTheDocument()
    reading.scrollTop = 500
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: /第 2 版/ }))
    expect(reading.scrollTop).toBe(0)
    expect(within(reading).getByText('更正结论')).toBeInTheDocument()
  })

  it('keeps a withdrawn latest report and its previous versions visible without offering correction or printing', async () => {
    const cancelled: DiagnosticReport = { ...corrected, id: 'r3', reportVersion: 3, status: 'CANCELLED', replacesReportId: 'r2' }
    setup({ history: [cancelled, corrected, old], authorities: ['DIAGNOSTICS.LABORATORY.VIEW'] })
    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    await screen.findByText('冻结的旧结论')
    expect(screen.queryByRole('button', { name: '进入报告更正' })).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: /第 3 版/ }))
    expect(screen.queryByText('打印版本 r3')).not.toBeInTheDocument()
  })

  it('separates examination permissions and does not fetch for a lab-only account', () => {
    const { query } = setup({ type: 'EXAMINATION', authorities: ['DIAGNOSTICS.ACCESS', 'DIAGNOSTICS.LABORATORY.VIEW'] })
    expect(screen.getByText('当前账号无权查询此类报告。')).toBeInTheDocument()
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects mismatched report ownership and hides a previous department drawer immediately', async () => {
    const { rerender, view } = setup({ history: [{ ...old, residentId: 'other-patient' }] })
    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    expect(await screen.findByText('报告版本与当前患者或申请不一致，请重新查询。')).toBeInTheDocument()
    expect(screen.queryByText('冻结的旧结论')).not.toBeInTheDocument()
    rerender(view({ ...context, department: { id: 'dept2', name: '新科室' } } as ClinicalContext))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows query failures distinctly from an empty report history', async () => {
    setup({ query: vi.fn().mockRejectedValue(new Error('查询服务不可用')) })
    expect(await screen.findByText('查询服务不可用')).toBeInTheDocument()
    expect(screen.queryByText('未找到报告')).not.toBeInTheDocument()
  })
})
