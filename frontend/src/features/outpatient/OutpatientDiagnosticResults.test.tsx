import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Encounter, Resident } from '../../shared/model'
import type { DiagnosticReport } from '../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientDiagnosticResults } from './OutpatientDiagnosticResults'
import { assessReceptionScene } from './ai/receptionSceneAssessment'

const encounter = { id: 'enc1', residentId: 'resident1', encounterNo: 'MZ20261017001' } as Encounter
const resident = { id: 'resident1', fullName: '张医生测试患者', gender: '1', genderText: '男',
  birthDate: '1986-06-18', healthRecordNo: 'HR0001' } as Resident
const report = { id: 'report1', encounterId: 'enc1', residentId: 'resident1', requestId: 'req1',
  reportType: 'LABORATORY', reportName: '真实报告', status: 'FINAL', reportVersion: 1, issuedAt: '2026-10-03T01:00:00Z',
  observations: [{ id: 'obs1', observationCode: 'BOOL', observationName: '布尔结果', valueType: 'BOOLEAN', valueBoolean: false }] } as DiagnosticReport

function setup(load = vi.fn().mockResolvedValue([report]), historyEncounters: Encounter[] = [], preferredReportIds: string[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = { diagnostics: { reportsByEncounter: load } } as unknown as RhnApi
  const view = render(<QueryClientProvider client={client}><OutpatientDiagnosticResults encounter={encounter} resident={resident} api={api}
    historyEncounters={historyEncounters} preferredReportIds={preferredReportIds}
    organizationName="测试医院" departmentName="全科门诊" /></QueryClientProvider>)
  return { client, load, view, api }
}

describe('outpatient diagnostic results truth', () => {
  const earlier = { ...encounter, id: 'earlier', encounterNo: 'MZ-PRIOR', status: 'COMPLETED',
    registeredAt: new Date(Date.now() - 2 * 86_400_000).toISOString() } as Encounter
  const priorReport = { ...report, id: 'prior-report', encounterId: earlier.id }

  it('lists multiple reports while rendering only the selected laboratory or examination detail', async () => {
    const examination = { ...report, id: 'exam', requestId: 'exam-request', reportName: '腹部超声检查报告',
      reportType: 'EXAMINATION', issuedAt: '2026-10-04T01:00:00Z', observations: [], findings: '检查所见内容', conclusion: '检查结论内容' }
    setup(vi.fn().mockResolvedValue([report, examination]))
    await screen.findByRole('region', { name: '腹部超声检查报告' })
    expect(screen.getByText('2 份报告')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '真实报告' })).not.toBeInTheDocument()
    expect(screen.getByText('检查所见内容')).toBeInTheDocument()
    const directory = screen.getByRole('region', { name: '报告目录' })
    expect(within(directory).getAllByRole('button', { name: /^查看/ })).toHaveLength(2)
    fireEvent.click(within(directory).getByRole('button', { name: '查看真实报告，第1版，正式报告' }))
    expect(screen.getByRole('region', { name: '真实报告' })).toBeInTheDocument()
    expect(screen.queryByText('检查所见内容')).not.toBeInTheDocument()
    expect(within(directory).getByRole('button', { name: '查看真实报告，第1版，正式报告' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('prioritizes a follow-up report from a previous visit and keeps the source visit context', async () => {
    const history = { ...priorReport, reportName: '历史血常规' }
    setup(vi.fn().mockImplementation(async (id) => id === earlier.id ? [history] : [report]), [earlier], [history.id])
    const detail = await screen.findByRole('region', { name: '历史血常规' })
    expect(within(detail).getByText(earlier.encounterNo)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '真实报告' })).not.toBeInTheDocument()
    expect(screen.getByText('本次就诊')).toBeInTheDocument()
    expect(screen.getByText('历史就诊')).toBeInTheDocument()
    expect(screen.getByText('历史就诊报告')).toBeInTheDocument()
  })

  it('keeps a manually selected report after refresh, falling back when it is removed', async () => {
    const second = { ...report, id: 'second', requestId: 'second-request', reportName: '第二份报告' }
    const { load, client } = setup(vi.fn().mockResolvedValue([report, second]))
    await screen.findByRole('region', { name: '真实报告' })
    fireEvent.click(screen.getByRole('button', { name: '查看第二份报告，第1版，正式报告' }))
    const newer = { ...report, id: 'newer', reportName: '新签发报告', issuedAt: '2026-10-05T01:00:00Z' }
    load.mockResolvedValueOnce([newer, report, second])
    await act(async () => { await client.invalidateQueries({ queryKey: ['doctor-reports'] }) })
    expect(await screen.findByRole('region', { name: '第二份报告' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '新签发报告' })).not.toBeInTheDocument()
    load.mockResolvedValueOnce([newer, report])
    await act(async () => { await client.invalidateQueries({ queryKey: ['doctor-reports'] }) })
    expect(await screen.findByRole('region', { name: '新签发报告' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '第二份报告' })).not.toBeInTheDocument()
  })

  it('marks abnormal results in the directory without describing unflagged reports as normal', async () => {
    setup(vi.fn().mockResolvedValue([{ ...report, observations: [{ ...report.observations[0], interpretationCode: 'H' }] }]))
    await screen.findByRole('region', { name: '真实报告' })
    const directory = screen.getByRole('region', { name: '报告目录' })
    expect(within(directory).getByText('1 项异常')).toBeInTheDocument()
    expect(within(directory).queryByText('正常')).not.toBeInTheDocument()
  })

  it('resets the detail scroll when switching reports without resetting the directory scroll', async () => {
    setup(vi.fn().mockResolvedValue([report, { ...report, id: 'second', reportName: '第二份报告' }]))
    await screen.findByRole('region', { name: '真实报告' })
    const detail = screen.getByRole('region', { name: '报告详情内容' })
    const directory = screen.getByRole('region', { name: '报告目录内容' })
    detail.scrollTop = 400
    directory.scrollTop = 200
    fireEvent.click(screen.getByRole('button', { name: '查看第二份报告，第1版，正式报告' }))
    expect(detail.scrollTop).toBe(0)
    expect(directory.scrollTop).toBe(200)
  })

  it('shows the earlier report behind the follow-up hint even when this encounter has none', async () => {
    expect(assessReceptionScene({ encounter, historyEncounters: [earlier], diagnosticReports: [priorReport] }).scene)
      .toBe('REPORT_FOLLOW_UP')
    const { load } = setup(vi.fn().mockImplementation(async (id) => id === earlier.id ? [priorReport] : []), [earlier])
    await screen.findByRole('region', { name: '真实报告' })
    expect(load).toHaveBeenCalledWith(earlier.id)
    expect(screen.getByText('1 份报告')).toBeInTheDocument()
    expect(screen.getByText('历史就诊')).toBeInTheDocument()
    const document = screen.getByRole('region', { name: '真实报告' })
    expect(within(document).getByText(earlier.encounterNo)).toBeInTheDocument()
    expect(within(document).queryByText(encounter.encounterNo)).not.toBeInTheDocument()
  })

  it('does not query another patient, unfinished, future or older encounters', async () => {
    const { load } = setup(vi.fn().mockResolvedValue([]), [
      { ...earlier, id: 'other-patient', residentId: 'other' },
      { ...earlier, id: 'unfinished', status: 'IN_PROGRESS' },
      { ...earlier, id: 'old', registeredAt: new Date(Date.now() - 15 * 86_400_000).toISOString() },
      { ...earlier, id: 'future', registeredAt: new Date(Date.now() + 86_400_000).toISOString() },
    ])
    await screen.findByText('暂无检验检查报告')
    expect(load.mock.calls).toEqual([[encounter.id]])
  })

  it('reports a historical query failure instead of claiming no reports, and retries all sources', async () => {
    const load = vi.fn().mockImplementation(async (id) => {
      if (id === earlier.id) throw new Error('历史报告读取失败')
      return []
    })
    setup(load, [earlier])
    await screen.findByText('历史报告读取失败')
    expect(screen.queryByText('0 份报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无检验检查报告')).not.toBeInTheDocument()
    load.mockImplementation(async (id) => id === earlier.id ? [priorReport] : [])
    fireEvent.click(screen.getByRole('button', { name: '重新加载报告' }))
    await screen.findByRole('region', { name: '真实报告' })
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('preserves corrected report version labels for an earlier encounter', async () => {
    const corrected = { ...priorReport, id: 'corrected', reportName: '更正报告', reportVersion: 2,
      status: 'CORRECTED', replacesReportId: priorReport.id }
    setup(vi.fn().mockImplementation(async (id) => id === earlier.id ? [priorReport, corrected] : []), [earlier])
    const latest = await screen.findByRole('region', { name: '更正报告' })
    expect(within(latest).queryByText('历史版本')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '真实报告' })).not.toBeInTheDocument()
    expect(screen.getByText('1 份报告 · 1 个旧版本')).toBeInTheDocument()
    const versions = screen.getByText('更正前版本（1）').closest('details')!
    expect(versions.open).toBe(false)
    fireEvent.click(screen.getByText('更正前版本（1）'))
    fireEvent.click(screen.getByRole('button', { name: '查看真实报告，第1版，历史版本' }))
    const old = screen.getByRole('region', { name: '真实报告' })
    expect(within(old).getByText('历史版本')).toBeInTheDocument()
    expect(within(old).queryByRole('button', { name: '下载正式报告 PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '更正报告' })).not.toBeInTheDocument()
  })

  it('does not show a late historical response after switching patients', async () => {
    let resolve!: (reports: DiagnosticReport[]) => void
    const { view, client, api } = setup(vi.fn().mockImplementation(async (id) => id === earlier.id
      ? new Promise<DiagnosticReport[]>((done) => { resolve = done }) : []), [earlier])
    await waitFor(() => expect(resolve).toBeDefined())
    const next = { ...encounter, id: 'next', residentId: 'next-patient' }
    view.rerender(<QueryClientProvider client={client}><OutpatientDiagnosticResults encounter={next}
      resident={{ ...resident, id: next.residentId }} api={api} historyEncounters={[earlier]} /></QueryClientProvider>)
    await act(async () => { resolve([priorReport]) })
    await screen.findByText('暂无检验检查报告')
    expect(screen.queryByText('真实报告')).not.toBeInTheDocument()
  })

  it('shows the actual false result in the formal report layout with patient context', async () => {
    setup()
    expect((await screen.findByText('布尔结果')).closest('tr')).toHaveTextContent('否')
    expect(screen.getByText('张医生测试患者')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '真实报告' })).getByText('MZ20261017001')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: '检验结果明细' })).toBeInTheDocument()
    expect(screen.getByText('报告备注').nextElementSibling).toHaveTextContent('—')
    expect(screen.getAllByText('正式报告').length).toBeGreaterThan(0)
  })

  it('does not display zero or an empty report list while loading', () => {
    setup(vi.fn().mockReturnValue(new Promise(() => {})))
    expect(screen.getByText('报告数量待核实')).toBeInTheDocument()
    expect(screen.queryByText('0 份报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无检验检查报告')).not.toBeInTheDocument()
  })

  it.each([null, [{ ...report, residentId: 'other' }], [{ ...report, encounterId: 'other' }],
    [{ ...report, status: 'UNKNOWN' }], [{ ...report, observations: null }],
    [{ ...report, observations: [null] }]])('rejects malformed or mismatched reports: %j', async (result) => {
    setup(vi.fn().mockResolvedValue(result))
    await screen.findByRole('button', { name: '重新加载报告' })
    expect(screen.queryByText('真实报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无检验检查报告')).not.toBeInTheDocument()
    expect(screen.queryByText('0 份报告')).not.toBeInTheDocument()
  })

  it('hides cached reports during refresh and failure, then restores only a successful response', async () => {
    const { client, load } = setup()
    await screen.findByRole('region', { name: '真实报告' })
    let reject!: (error: Error) => void
    load.mockReturnValueOnce(new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
    let refresh!: Promise<void>
    await act(async () => { refresh = client.invalidateQueries({ queryKey: ['doctor-reports'] }) })
    await waitFor(() => expect(screen.queryByText('真实报告')).not.toBeInTheDocument())
    await act(async () => { reject(new Error('报告读取失败')); await refresh })
    await screen.findByText('报告读取失败')
    expect(screen.queryByText('真实报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无检验检查报告')).not.toBeInTheDocument()
    load.mockResolvedValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: '重新加载报告' }))
    await screen.findByText('暂无检验检查报告')
    expect(screen.getByText('0 份报告')).toBeInTheDocument()
  })
})
