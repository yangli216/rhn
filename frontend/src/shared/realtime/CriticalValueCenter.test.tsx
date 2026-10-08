import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CriticalValueAlert } from '../api/diagnosticsApi'
import type { RhnApi } from '../rhnApi'
import { criticalValueStatusPresentation } from '../presentation'
import { CriticalValueCenter } from './CriticalValueCenter'

const alert: CriticalValueAlert = {
  id: '1', revision: 0, reportId: '2', observationId: '3', residentId: '4', encounterId: '5',
  requestId: '6', organizationId: '7', departmentId: '8', recipientUserId: '9', severity: 'CRITICAL',
  observationCode: 'K', observationName: '实际检验项目', triggerEvidence: '实际报告标记 HH', status: 'OPEN',
  detectedAt: '2026-10-03T01:00:00Z', acknowledgeDeadlineAt: '2026-10-03T01:07:00Z', escalationLevel: 0,
}

function show(active = vi.fn().mockResolvedValue([alert]), openManually = true) {
  const acknowledge = vi.fn().mockResolvedValue({ ...alert, status: 'ACKNOWLEDGED' })
  const api = { diagnostics: { criticalValues: { active, acknowledge } } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const navigate = vi.fn()
  const ui = (contextKey: string) => <QueryClientProvider client={client}>
    <CriticalValueCenter api={api} contextKey={contextKey} workContextType="CLINICAL" onNavigate={navigate} />
  </QueryClientProvider>
  const view = render(ui('A'))
  if (openManually) fireEvent.click(screen.getByRole('button', { name: /^危急值，/ }))
  return { ...view, ui, client, api, acknowledge, active, navigate }
}

describe('CriticalValueCenter actual facts', () => {
  it('automatically presents a newly escalated alert even if its earlier open state was dismissed', async () => {
    const { active, client } = show(undefined, false)
    await screen.findByText(alert.triggerEvidence)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    active.mockResolvedValue([{ ...alert, revision: 1, status: 'ESCALATED', escalationLevel: 1 }])
    await act(async () => { await client.invalidateQueries({ queryKey: ['critical-values', 'A'] }) })
    expect(await screen.findByText('已超时升级')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认收到' })).toBeEnabled()
  })

  it('shows read failure without a zero count or an all-clear message and can retry', async () => {
    const active = vi.fn().mockRejectedValue(new Error('服务不可用'))
    show(active)
    await screen.findByText('危急值加载失败')
    expect(screen.queryByText('0 条危急值待确认')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无待处理危急值')).not.toBeInTheDocument()
    active.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: '重新加载危急值' }))
    expect(await screen.findByText('暂无待处理危急值')).toBeInTheDocument()
    expect(screen.getByText('0 条危急值待确认')).toBeInTheDocument()
  })

  it('shows unknown counts during initial loading', async () => {
    let resolve!: (value: CriticalValueAlert[]) => void
    show(vi.fn().mockReturnValue(new Promise((done) => { resolve = done })))
    expect(screen.getByText('正在核实危急值数量…')).toBeInTheDocument()
    expect(screen.queryByText('0 条危急值待确认')).not.toBeInTheDocument()
    await act(async () => resolve([]))
    await screen.findByText('暂无待处理危急值')
  })

  it('hides stale values, counts and actions throughout a failed refresh', async () => {
    const { active, client, acknowledge } = show()
    await screen.findByText(alert.triggerEvidence)
    let reject!: (reason: Error) => void
    active.mockReturnValue(new Promise((_, fail) => { reject = fail }))
    act(() => { void client.invalidateQueries({ queryKey: ['critical-values', 'A'] }) })
    await screen.findByText('正在加载危急值…')
    expect(screen.queryByText(alert.triggerEvidence)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认收到' })).not.toBeInTheDocument()
    expect(screen.queryByText('1 条危急值待确认')).not.toBeInTheDocument()
    await act(async () => reject(new Error('刷新失败')))
    await screen.findByText('危急值加载失败')
    expect(screen.queryByText('暂无待处理危急值')).not.toBeInTheDocument()
    expect(acknowledge).not.toHaveBeenCalled()
  })

  it('hides a previously empty result after a refresh failure', async () => {
    const { active, client } = show(vi.fn().mockResolvedValue([]))
    await screen.findByText('暂无待处理危急值')
    active.mockRejectedValue(new Error('读取失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['critical-values', 'A'] }) })
    await screen.findByText('危急值加载失败')
    expect(screen.queryByText('暂无待处理危急值')).not.toBeInTheDocument()
  })

  it('keeps a documented acknowledgement pending disposition instead of claiming all clear', async () => {
    show(vi.fn().mockResolvedValue([{ ...alert, status: 'ACKNOWLEDGED', acknowledgedBy: '9',
      acknowledgedAt: '2026-10-03T01:01:00Z' }]))
    await screen.findByText('已确认，待处置')
    expect(screen.queryByRole('button', { name: '确认收到' })).not.toBeInTheDocument()
    expect(screen.queryByText('暂无待处理危急值')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '进入医生站' })).toBeEnabled()
  })

  it('invalidates related queues after acknowledgement and uses the latest source status', async () => {
    const { active, client, acknowledge } = show()
    await screen.findByRole('button', { name: '确认收到' })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    active.mockResolvedValue([{ ...alert, revision: 1, status: 'ACKNOWLEDGED', acknowledgedBy: '9',
      acknowledgedAt: '2026-10-03T01:01:00Z' }])
    fireEvent.click(screen.getByRole('button', { name: '确认收到' }))
    await screen.findByText('已确认，待处置')
    expect(acknowledge).toHaveBeenCalledWith('1', 0)
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['work-tasks', 'A'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inpatient-critical-values'] })
  })

  it('does not reuse the previous department result', async () => {
    const { active, rerender, ui } = show()
    await screen.findByText(alert.triggerEvidence)
    active.mockRejectedValue(new Error('新科室数据读取失败'))
    rerender(ui('B'))
    await screen.findByText('危急值加载失败')
    expect(screen.queryByText(alert.triggerEvidence)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认收到' })).not.toBeInTheDocument()
  })

  it.each([null, {}, [null], [alert, alert],
    ...['id', 'revision', 'reportId', 'observationId', 'residentId', 'encounterId', 'requestId',
      'organizationId', 'departmentId', 'recipientUserId', 'observationCode', 'observationName',
      'triggerEvidence', 'severity', 'status', 'detectedAt', 'acknowledgeDeadlineAt', 'escalationLevel']
      .map((field) => [{ ...alert, [field]: undefined }]),
    [{ ...alert, status: 'UNKNOWN' }], [{ ...alert, status: 'CLOSED' }], [{ ...alert, status: 'SUPERSEDED' }],
    [{ ...alert, status: 'ACKNOWLEDGED' }], [{ ...alert, status: 'ESCALATED', escalationLevel: 0 }],
    [{ ...alert, acknowledgedAt: '2026-10-03T01:01:00Z' }],
    [{ ...alert, closedBy: '9' }], [{ ...alert, supersededByReportId: '12' }],
    [{ ...alert, acknowledgeDeadlineAt: '2026-10-03T00:59:00Z' }],
    [{ ...alert, detectedAt: '1' }], [{ ...alert, detectedAt: '2026-02-30T00:00:00Z' }],
  ].map((value) => [value]))('does not invent counts, statuses or actions for invalid facts: %j', async (value) => {
    show(vi.fn().mockResolvedValue(value))
    await screen.findByText('危急值加载失败')
    expect(screen.queryByText('暂无待处理危急值')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认收到' })).not.toBeInTheDocument()
  })

  it('shows an unknown state explicitly instead of defaulting to pending confirmation', () => {
    expect(criticalValueStatusPresentation('UNKNOWN' as CriticalValueAlert['status']).label).toBe('危急值状态未知')
    expect(criticalValueStatusPresentation('CLOSED').label).toBe('已关闭')
    expect(criticalValueStatusPresentation('SUPERSEDED').label).toBe('报告已替代')
  })
})
