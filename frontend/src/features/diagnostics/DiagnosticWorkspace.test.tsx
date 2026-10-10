import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { DiagnosticExecutionTask, DiagnosticReport } from '../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../shared/rhnApi'
import { DiagnosticWorkspace } from './DiagnosticWorkspace'

const context = { organization: { id: 'org1', name: '测试机构' }, department: { id: 'dept1', name: '检验科' } } as ClinicalContext
const task: DiagnosticExecutionTask = { id: 'task1', revision: 1, taskNo: 'DX123456', requestType: 'LABORATORY',
  status: 'READY', residentId: 'resident1', residentName: '患者甲', healthRecordNo: 'H001', encounterId: 'enc1',
  requestId: 'req1', organizationId: 'org1', departmentId: 'dept1', itemCode: 'LAB1', itemName: '检验项目',
  createdAt: '2026-10-03T01:00:00Z' }
const report = { id: 'report1', requestId: 'req1', residentId: 'resident1', encounterId: 'enc1',
  status: 'FINAL', reportVersion: 1, reportName: '检验报告', issuedAt: '2026-10-03T02:00:00Z',
  observations: [{ id: 'obs1', observationName: '检验指标', valueType: 'NUMBER', valueNumber: 5.8 }] } as DiagnosticReport

function setup(tasks: DiagnosticExecutionTask[] = [task], overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const diagnostics = { worklist: vi.fn().mockResolvedValue(tasks), reportsByRequest: vi.fn().mockResolvedValue([]),
    collect: vi.fn().mockResolvedValue(task), start: vi.fn().mockResolvedValue(task),
    recordLocalReport: vi.fn().mockResolvedValue(report), ...overrides }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter>
    <DiagnosticWorkspace api={{ diagnostics } as unknown as RhnApi} clinicalContext={context} onNavigate={vi.fn()} />
  </MemoryRouter></QueryClientProvider>)
  return { diagnostics, client }
}

describe('diagnostic source facts', () => {
  it('requires the real specimen number instead of generating one from the task', async () => {
    const { diagnostics } = setup()
    const number = await screen.findByLabelText(/标本号/)
    expect(number).toHaveValue('')
    expect(screen.getByRole('button', { name: '确认采集' })).toBeDisabled()
    fireEvent.change(number, { target: { value: 'ACTUAL-TUBE-1001' } })
    fireEvent.click(screen.getByRole('button', { name: '确认采集' }))
    await waitFor(() => expect(diagnostics.collect).toHaveBeenCalledWith('task1', 1, 'ACTUAL-TUBE-1001', undefined))
  })

  it('does not submit a normal interpretation unless it was explicitly selected', async () => {
    const { diagnostics } = setup([{ ...task, status: 'IN_PROGRESS' }])
    await screen.findByLabelText(/结果值/)
    expect(screen.getByLabelText('结果标志')).toHaveTextContent('未判定')
    fireEvent.change(screen.getByLabelText(/结果值/), { target: { value: '5.8' } })
    fireEvent.click(screen.getByRole('button', { name: '签发正式报告' }))
    await waitFor(() => expect(diagnostics.recordLocalReport).toHaveBeenCalledOnce())
    const input = diagnostics.recordLocalReport.mock.calls[0][1]
    expect(input.observationValue).toBe('5.8')
    expect(input.interpretationCode).toBeUndefined()
  })

  it('preserves explicitly selected interpretation and clears it on another patient', async () => {
    const second = { ...task, id: 'task2', requestId: 'req2', residentId: 'resident2', residentName: '患者乙', status: 'IN_PROGRESS' as const }
    const { diagnostics } = setup([{ ...task, status: 'IN_PROGRESS' }, second])
    await screen.findByLabelText(/结果值/)
    await userEvent.click(screen.getByLabelText('结果标志'))
    await userEvent.click(screen.getByRole('option', { name: '偏高' }))
    fireEvent.change(screen.getByLabelText(/结果值/), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '签发正式报告' }))
    await waitFor(() => expect(diagnostics.recordLocalReport).toHaveBeenCalledWith('task1', expect.objectContaining({ interpretationCode: 'H' })))
    await screen.findByRole('button', { name: /患者乙/ })
    fireEvent.click(screen.getByRole('button', { name: /患者乙/ }))
    expect(screen.getByLabelText('结果标志')).toHaveTextContent('未判定')
    expect(screen.getByLabelText(/结果值/)).toHaveValue(null)
  })

  it('shows missing report facts as unknown rather than normal or an invented signer', async () => {
    setup([{ ...task, status: 'COMPLETED', reportId: 'report1' }], { reportsByRequest: vi.fn().mockResolvedValue([report]) })
    expect(await screen.findByText('检验指标')).toBeInTheDocument()
    expect(screen.getByText('未判定')).toBeInTheDocument()
    expect(screen.getByText(/未记录签发人/)).toBeInTheDocument()
    expect(screen.queryByText('N')).not.toBeInTheDocument()
  })

  it.each(['PRELIMINARY', 'CANCELLED'] as const)('does not label a %s report as a final report', async (status) => {
    setup([{ ...task, status: 'COMPLETED', reportId: 'report1' }], {
      reportsByRequest: vi.fn().mockResolvedValue([{ ...report, status }]),
    })
    await screen.findByText('检验报告')
    expect(screen.queryByText(/正式报告 ·/)).not.toBeInTheDocument()
    expect(screen.getAllByText(status === 'PRELIMINARY' ? /初步报告/ : /已取消/).length).toBeGreaterThan(0)
  })

  it.each(['failed', 'invalid', 'empty', 'wrong-patient', 'wrong-report'] as const)('does not fabricate receipt or synchronization of a report: %s', async (state) => {
    const load = state === 'failed' ? vi.fn().mockRejectedValue(new Error('报告服务不可用'))
      : vi.fn().mockResolvedValue(state === 'invalid' ? null : state === 'empty' ? []
        : [{ ...report, ...(state === 'wrong-patient' ? { residentId: 'someone-else' } : { id: 'old-report' }) }])
    setup([{ ...task, status: 'COMPLETED', reportId: 'report1' }], { reportsByRequest: load })
    await screen.findByText(['empty', 'wrong-report'].includes(state) ? '未查询到对应报告' : '报告加载失败')
    expect(screen.queryByText(/报告已接收，正在同步/)).not.toBeInTheDocument()
    expect(screen.queryByText('检验指标')).not.toBeInTheDocument()
    load.mockResolvedValue([report])
    fireEvent.click(screen.getByRole('button', { name: '重新加载报告' }))
    await screen.findByText('检验指标')
  })

  it('removes cached reports from the current view after a failed refresh', async () => {
    const { diagnostics, client } = setup([{ ...task, status: 'COMPLETED', reportId: 'report1' }], {
      reportsByRequest: vi.fn().mockResolvedValue([report]),
    })
    await screen.findByText('检验指标')
    diagnostics.reportsByRequest.mockRejectedValue(new Error('报告刷新失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['diagnostic-task-reports'] }) })
    await screen.findByText('报告加载失败')
    expect(screen.queryByText('检验指标')).not.toBeInTheDocument()
  })

  it('does not show zero tasks after a queue failure', async () => {
    setup([], { worklist: vi.fn().mockRejectedValue(new Error('队列服务不可用')) })
    await screen.findByText('医技队列加载失败')
    expect(screen.queryByText('暂无检查检验任务')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '医技任务摘要' })).getAllByText('—')).toHaveLength(3)
  })
})


describe('diagnostic result value types', () => {
  it.each([
    [{ valueType: 'BOOLEAN', valueBoolean: false }, '否'],
    [{ valueType: 'BOOLEAN', valueBoolean: null }, '结果缺失'],
    [{ valueType: 'BOOLEAN', valueString: '阴性' }, '结果数据异常，请核对'],
    [{ valueType: 'DATETIME', valueDateTime: '2025-09-10T08:30:45Z' }, '2025'],
  ])('renders the declared source value: %j', async (value, expected) => {
    setup([{ ...task, status: 'COMPLETED', reportId: 'report1' }], {
      reportsByRequest: vi.fn().mockResolvedValue([{ ...report,
        observations: [{ id: 'obs1', observationName: '真实结果', ...value }] }]),
    })
    const label = await screen.findByText('真实结果')
    expect(label.parentElement).toHaveTextContent(expected)
  })
})
