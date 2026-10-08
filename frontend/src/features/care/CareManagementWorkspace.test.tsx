import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { HypertensionCandidate } from '../../shared/api/healthPlanningApi'
import type { RhnApi } from '../../shared/rhnApi'
import { CareManagementWorkspace } from './CareManagementWorkspace'

function renderWorkspace(query: () => Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = { healthPlanning: { hypertensionCandidates: query } } as unknown as RhnApi
  const context = { organization: { id: 'org-1', name: '医院' }, department: { id: 'dept-1', name: '科室' } } as ClinicalContext
  render(<QueryClientProvider client={client}><MemoryRouter><CareManagementWorkspace api={api}
    clinicalContext={context} onNavigate={vi.fn()} /></MemoryRouter></QueryClientProvider>)
  return client
}

describe('CareManagementWorkspace', () => {
  it.each([new Error('连接失败'), null])('does not show zero clinical tasks when a query fails: %s', async (response) => {
    const query = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response)
    renderWorkspace(query)
    expect(await screen.findByText(/候选查询失败，不能判断/)).toBeInTheDocument()
    expect(screen.queryByText('暂无高血压疑诊候选')).not.toBeInTheDocument()
    expect(screen.getByText('候选任务').parentElement).toHaveTextContent('—')
    expect(screen.getByText('立即处理').parentElement).toHaveTextContent('—')
    expect(screen.getByText('到期任务').parentElement).toHaveTextContent('—')
    query.mockResolvedValue([])
    await userEvent.click(screen.getByRole('button', { name: '刷新候选' }))
    expect(await screen.findByText('暂无高血压疑诊候选')).toBeInTheDocument()
    expect(screen.getByText('候选任务').parentElement).toHaveTextContent('0')
  })

  it('replaces a previously empty result with an unknown state after refetch failure', async () => {
    const query = vi.fn().mockResolvedValue([])
    const client = renderWorkspace(query)
    await screen.findByText('暂无高血压疑诊候选')
    query.mockRejectedValue(new Error('连接失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['hypertension-candidates'] }) })
    expect(await screen.findByText(/候选查询失败，不能判断/)).toBeInTheDocument()
    expect(screen.queryByText('暂无高血压疑诊候选')).not.toBeInTheDocument()
    expect(screen.getByText('候选任务').parentElement).toHaveTextContent('—')
  })
})


function candidate(): HypertensionCandidate {
  const measuredAt = '2026-01-01T00:00:00Z'
  const dueAt = '2026-01-29T00:00:00Z'
  return { taskId: 'task1', revision: 0, taskCode: 'HTN:condition1', status: 'READY', priority: 'HIGH',
    residentId: 'resident1', residentName: '实际居民', encounterId: 'encounter1', conditionId: 'condition1',
    conditionCode: 'I10', conditionName: '原发性高血压', verificationStatus: 'SUSPECTED', organizationId: 'org-1',
    departmentId: 'dept-1', dueAt, title: '真实复查任务', description: '真实说明', createdAt: measuredAt,
    evidenceEvents: [{ id: 'event1', eventType: 'CREATE', commandCode: 'SCREEN:1', resultDescription: '测量 152/96',
      ruleCode: 'RULE1', ruleVersion: '1', evidenceHash: 'a'.repeat(64), occurredAt: measuredAt,
      evidence: { contractVersion: 'RHN.HYPERTENSION_SCREENING_EVIDENCE.V1', decision: 'SUSPECTED',
        diagnosticMeaning: 'CANDIDATE_NOT_DIAGNOSIS', residentAge: 40, encounterId: 'encounter1', measuredAt,
        systolic: { id: 'obs1', system: 'LOINC', code: '8480-6', value: 152, unit: 'mmHg' },
        diastolic: { id: 'obs2', system: 'LOINC', code: '8462-4', value: 96, unit: 'mmHg' },
        thresholds: { systolic: 140, diastolic: 90, severeSystolic: 180, severeDiastolic: 110 },
        rule: { code: 'RULE1', version: '1', guidanceVersion: 'guidance1', standard: '现行规则' }, recheckDueAt: dueAt } }] }
}

describe('care candidate evidence and state', () => {
  it.each([['SUSPECTED', '疑似，待临床确认'], ['CONFIRMED', '已确认'], ['REFUTED', '已排除']] as const)(
    'shows the actual verification status %s', async (status, expected) => {
      renderWorkspace(vi.fn().mockResolvedValue([{ ...candidate(), verificationStatus: status }]))
      await screen.findByText('核验状态')
      expect(screen.getByText('核验状态').parentElement).toHaveTextContent(expected)
      if (status !== 'SUSPECTED') expect(screen.queryByText('疑似，待临床确认')).not.toBeInTheDocument()
    })

  it.each(['COMPLETED', 'CANCELLED'])('does not count ended %s tasks as urgent or overdue', async (status) => {
    renderWorkspace(vi.fn().mockResolvedValue([{ ...candidate(), status, priority: 'URGENT' }]))
    await screen.findByText('核验状态')
    expect(screen.getByText('候选任务').parentElement).toHaveTextContent('1')
    expect(screen.getByText('立即处理').parentElement).toHaveTextContent('0')
    expect(screen.getByText('到期任务').parentElement).toHaveTextContent('0')
    expect(screen.getByText('复查时限').parentElement).toHaveTextContent('任务已结束')
  })

  it('counts actual open urgent and overdue tasks', async () => {
    renderWorkspace(vi.fn().mockResolvedValue([{ ...candidate(), priority: 'URGENT' }]))
    await screen.findByText('核验状态')
    const metrics = screen.getByText('当前责任单元').parentElement!.parentElement!
    expect(within(metrics).getByText('立即处理').parentElement).toHaveTextContent('1')
    expect(within(metrics).getByText('到期任务').parentElement).toHaveTextContent('1')
  })

  it('presents static workflow guidance without completed-stage indicators even when empty', async () => {
    renderWorkspace(vi.fn().mockResolvedValue([]))
    await screen.findByText('暂无高血压疑诊候选')
    expect(screen.getByText('流程说明')).toBeInTheDocument()
    expect(screen.getByText('结构化血压').closest('li')).not.toHaveClass('is-done')
    expect(screen.getByText('候选识别').closest('li')).not.toHaveClass('is-done')
    expect(screen.getByText('临床复查').closest('li')).not.toHaveClass('is-current')
  })

  it.each([
    (value: any) => { value.evidenceEvents = [] },
    (value: any) => { value.evidenceEvents = [null] },
    (value: any) => { value.evidenceEvents[0].evidence = {} },
    (value: any) => { value.evidenceEvents[0].evidence.decision = 'UNKNOWN' },
    (value: any) => { value.evidenceEvents[0].evidence.systolic.value = null },
    (value: any) => { value.evidenceEvents[0].evidence.systolic.value = '152' },
    (value: any) => { value.evidenceEvents[0].evidence.diastolic.unit = 'other-unit' },
    (value: any) => { value.evidenceEvents[0].evidence.thresholds = null },
    (value: any) => { value.evidenceEvents[0].evidence.rule.version = 'unrelated' },
    (value: any) => { value.evidenceEvents[0].evidenceHash = '' },
    (value: any) => { value.evidenceEvents[0].evidence.measuredAt = 'bad-time' },
    (value: any) => { value.evidenceEvents.push(value.evidenceEvents[0]) },
    (value: any) => { value.status = 'UNKNOWN' },
    (value: any) => { value.priority = 'UNKNOWN' },
    (value: any) => { value.verificationStatus = 'UNKNOWN' },
    (value: any) => { value.dueAt = null },
  ])('does not present incomplete candidate facts as valid (%#)', async (corrupt) => {
    const value = candidate()
    corrupt(value)
    renderWorkspace(vi.fn().mockResolvedValue([value]))
    await screen.findByText(/候选查询失败，不能判断/)
    expect(screen.getByText('候选任务').parentElement).toHaveTextContent('—')
    expect(screen.queryByText('核验状态')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入居民就诊' })).not.toBeInTheDocument()
    expect(screen.queryByText('暂无高血压疑诊候选')).not.toBeInTheDocument()
  })

  it('hides cached evidence during refresh and failed refresh, then recovers', async () => {
    const query = vi.fn().mockResolvedValue([candidate()])
    const client = renderWorkspace(query)
    await screen.findByText('最近一次诊室血压')
    let reject!: (error: Error) => void
    query.mockReturnValueOnce(new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
    let refresh!: Promise<void>
    await act(async () => { refresh = client.invalidateQueries({ queryKey: ['hypertension-candidates'] }) })
    await waitFor(() => expect(screen.queryByText('最近一次诊室血压')).not.toBeInTheDocument())
    expect(screen.getByText('候选任务').parentElement).toHaveTextContent('—')
    await act(async () => { reject(new Error('刷新失败')); await refresh })
    await screen.findByText(/候选查询失败，不能判断/)
    expect(screen.queryByRole('button', { name: '进入居民就诊' })).not.toBeInTheDocument()
    query.mockResolvedValue([candidate()])
    await userEvent.click(screen.getByRole('button', { name: '刷新候选' }))
    await screen.findByText('最近一次诊室血压')
  })

  it('selects the latest measurement by its actual time', async () => {
    const value = candidate()
    const latest = structuredClone(value.evidenceEvents[0])
    latest.id = 'event2'; latest.eventType = 'EVIDENCE_RECORDED'; latest.commandCode = 'SCREEN:2'
    latest.evidence.measuredAt = '2026-01-02T00:00:00Z'; latest.evidence.systolic.value = 181
    latest.evidence.decision = 'URGENT_RECHECK'; latest.resultDescription = '最新测量 181/96'
    value.evidenceEvents.unshift(latest)
    value.priority = 'URGENT'; value.dueAt = latest.evidence.measuredAt
    renderWorkspace(vi.fn().mockResolvedValue([value]))
    const title = await screen.findByText('最近一次诊室血压')
    expect(title.closest('section')).toHaveTextContent('181')
    expect(title.closest('section')).toHaveTextContent('显著升高')
    expect(screen.getByRole('button', { name: /实际居民/ })).toHaveTextContent('最新测量 181/96')
  })
})


describe('care task and urgent evidence consistency', () => {
  it.each(['priority', 'deadline'])('does not mask a historical urgent %s mismatch', async (field) => {
    const value = candidate()
    value.evidenceEvents[0].evidence.decision = 'URGENT_RECHECK'
    value.evidenceEvents[0].evidence.systolic.value = 181
    if (field === 'priority') value.dueAt = value.evidenceEvents[0].evidence.measuredAt
    else value.priority = 'URGENT'
    renderWorkspace(vi.fn().mockResolvedValue([value]))
    await screen.findByText(/存在紧急复测证据，但任务优先级或时限未同步/)
    expect(screen.getByText('候选任务').parentElement).toHaveTextContent('—')
    expect(screen.getByText('立即处理').parentElement).toHaveTextContent('—')
    expect(screen.queryByText('最近一次诊室血压')).not.toBeInTheDocument()
  })
})
