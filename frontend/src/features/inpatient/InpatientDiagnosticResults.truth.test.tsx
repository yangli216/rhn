import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CriticalValueAlert } from '../../shared/api/diagnosticsApi'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientDiagnosticResults } from './InpatientDiagnosticResults'

const episode = { encounterId: 'enc1', residentId: 'resident1' } as InpatientEpisode
const alert: CriticalValueAlert = {
  id: 'critical1', revision: 1, reportId: 'report1', observationId: 'obs1', residentId: 'resident1',
  encounterId: 'enc1', requestId: 'request1', organizationId: 'org1', departmentId: 'dept1', recipientUserId: 'doctor1',
  severity: 'CRITICAL', observationCode: 'K', observationName: '血钾', triggerEvidence: '血钾升高',
  status: 'ACKNOWLEDGED', detectedAt: '2026-10-03T01:00:00Z',
  acknowledgeDeadlineAt: '2026-10-03T01:15:00Z', escalationLevel: 0,
  acknowledgedBy: 'doctor1', acknowledgedAt: '2026-10-03T01:01:00Z',
}
function setup(reports: unknown = [], critical: unknown = [alert]) {
  const active = vi.fn().mockResolvedValue(critical)
  const close = vi.fn().mockResolvedValue({ ...alert, status: 'CLOSED' })
  const reportsByEncounter = vi.fn().mockResolvedValue(reports)
  const api = { diagnostics: { reportsByEncounter, criticalValues: { active, close } } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><InpatientDiagnosticResults api={api} episode={episode} /></QueryClientProvider>)
  return { client, active, close, reportsByEncounter }
}

describe('inpatient diagnostic facts', () => {
  it.each([
    { ...alert, acknowledgedBy: undefined }, { ...alert, acknowledgedAt: undefined },
    { ...alert, residentId: 'another-resident' }, { ...alert, status: 'UNKNOWN' },
  ])('blocks clinical actions when source facts are invalid: %j', async (value) => {
    const { close } = setup([], [value])
    await screen.findByRole('button', { name: '重试读取危急值' })
    expect(screen.queryByRole('button', { name: '记录处置并关闭' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认已知晓' })).not.toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
  })

  it('hides stale critical-value facts and dispositions while refreshing', async () => {
    const { active, client } = setup()
    await screen.findByRole('button', { name: '记录处置并关闭' })
    let resolve!: (values: CriticalValueAlert[]) => void
    active.mockReturnValue(new Promise((done) => { resolve = done }))
    act(() => { void client.invalidateQueries({ queryKey: ['inpatient-critical-values', 'enc1'] }) })
    await screen.findByText('正在核实住院危急值…')
    expect(screen.queryByRole('button', { name: '记录处置并关闭' })).not.toBeInTheDocument()
    await act(async () => resolve([]))
    await waitFor(() => expect(screen.queryByText('正在核实住院危急值…')).not.toBeInTheDocument())
  })

  it('requires an explicit disposition instead of recording treatment by default', async () => {
    const { close } = setup()
    const button = await screen.findByRole('button', { name: '记录处置并关闭' })
    expect(button).toBeDisabled()
    expect(screen.getByLabelText(/处置结果/)).toHaveTextContent('请选择实际处置结果')
    await userEvent.click(button)
    expect(close).not.toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText(/处置结果/))
    await userEvent.click(screen.getByRole('option', { name: '已安排复检' }))
    await userEvent.type(screen.getByLabelText('处置记录'), '安排复查血钾')
    await userEvent.click(button)
    await waitFor(() => expect(close).toHaveBeenCalledWith('critical1', 1, 'RETEST_ORDERED', '安排复查血钾'))
  })

  it('clears unsaved disposition when a new alert revision arrives', async () => {
    const { client } = setup()
    await screen.findByRole('button', { name: '记录处置并关闭' })
    await userEvent.click(screen.getByLabelText(/处置结果/))
    await userEvent.click(screen.getByRole('option', { name: '已采取治疗措施' }))
    await act(async () => { client.setQueryData(['inpatient-critical-values', 'enc1', 'resident1'], [{ ...alert, revision: 2 }]) })
    await waitFor(() => expect(screen.getByLabelText(/处置结果/)).toHaveTextContent('请选择实际处置结果'))
    expect(screen.getByRole('button', { name: '记录处置并关闭' })).toBeDisabled()
  })

  it('hides cached critical-value actions after a failed refresh and allows retry', async () => {
    const { client, active } = setup()
    await screen.findByRole('button', { name: '记录处置并关闭' })
    active.mockRejectedValueOnce(new Error('危急值读取失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['inpatient-critical-values', 'enc1'] }) })
    expect(await screen.findByText('危急值读取失败')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '记录处置并关闭' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试读取危急值' }))
    expect(await screen.findByRole('button', { name: '记录处置并关闭' })).toBeDisabled()
  })

  it('does not show zero reports when the report request fails', async () => {
    const { client, reportsByEncounter } = setup()
    await screen.findByText('0 份报告')
    reportsByEncounter.mockRejectedValueOnce(new Error('报告读取失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['inpatient-diagnostic-reports', 'enc1'] }) })
    expect(await screen.findByText('报告读取失败')).toBeInTheDocument()
    expect(screen.getByText('报告数量待核实')).toBeInTheDocument()
    expect(screen.queryByText('0 份报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无检查检验报告')).not.toBeInTheDocument()
  })
})


describe('inpatient result value types', () => {
  it.each([
    [{ valueType: 'BOOLEAN', valueBoolean: false, valueNumber: null }, '否'],
    [{ valueType: 'BOOLEAN', valueBoolean: null }, '结果缺失'],
    [{ valueType: 'NUMBER', valueNumber: 0 }, '0'],
    [{ valueType: 'NUMBER', valueNumber: null, valueString: '正常' }, '结果数据异常，请核对'],
    [{ valueType: 'DATETIME', valueDateTime: '2025-09-10T08:30:45Z' }, '2025'],
  ])('renders the actual result without null fallbacks: %j', async (value, expected) => {
    setup([{ id: 'report1', encounterId: 'enc1', residentId: 'resident1', status: 'FINAL', reportName: '实际报告',
      observations: [{ id: 'obs1', observationName: '实际结果', ...value }] }])
    const label = await screen.findByText('实际结果')
    expect(label.parentElement).toHaveTextContent(expected)
  })
})
