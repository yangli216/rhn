import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeFeedbackDetail, KnowledgeFeedbackEvent } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgeFeedbackDialog } from './MedicationKnowledgeFeedbackDialog'
const basis = { candidateId: '20', deploymentId: '40', runId: '50', organizationId: '1', departmentId: '2', outcome: 'MATCH', runHash: 'run-hash', releaseFingerprint: 'release-hash', programHash: 'program-hash', knowledgeHash: 'knowledge-hash', fingerprint: 'basis-hash' }
const first: KnowledgeFeedbackEvent = { id: '70', revision: 1, operation: 'RECORD', verdict: 'FALSE_POSITIVE', assessment: '固定人工意见', evidence: '明确的合成依据', suggestion: '核对范围', reason: '合成记录', basis, actorId: '8', actor: '记录人', time: '2026-09-21T00:00:00Z' }
const empty: KnowledgeFeedbackDetail = { basis, observation: { id: '50', deploymentId: '40', prescriptionId: '60', time: first.time, outcome: 'MATCH', reasons: ['固定命中原因'], matchedOrderIds: ['A', 'B'] }, input: { facts: { age: null, ageUnit: 'YEAR', date: null }, dateBasis: '冻结评价日期', items: [], gaps: [] }, frozenCandidate: null, gaps: [], allowedVerdicts: ['SUPPORTED', 'FALSE_POSITIVE', 'DATA_ISSUE', 'RULE_ISSUE', 'UNCERTAIN'], latest: null, canWithdraw: false, history: { content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 } }
const recorded: KnowledgeFeedbackDetail = { ...empty, latest: first, canWithdraw: true, history: { content: [first], totalElements: 1, totalPages: 1, page: 0, size: 20 } }
function mount(value = empty) {
  const detail = vi.fn().mockResolvedValue(value), command = vi.fn().mockResolvedValue(recorded), changed = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgeFeedbackDialog api={{ medicationKnowledgeDrafts: { observationFeedback: detail, recordObservationFeedback: command } } as unknown as RhnApi} candidateId="20" deploymentId="40" runId="50" onClose={vi.fn()} onChanged={changed} /></QueryClientProvider>)
  return { detail, command, changed }
}
async function fill() {
  await userEvent.selectOptions(await screen.findByLabelText('研判分类'), 'FALSE_POSITIVE')
  await userEvent.type(screen.getByLabelText('研判说明'), '适用条件需要核对')
  await userEvent.type(screen.getByLabelText('研判依据'), '合成来源第 3 段')
  await userEvent.type(screen.getByLabelText('记录、更正或撤回原因'), '首次研判')
}
it('requires explicit judgment, evidence and confirmation and sends the exact frozen identity', async () => {
  const { command, changed } = mount()
  await fill()
  expect(screen.getByRole('button', { name: '追加研判意见' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: '追加研判意见' }))
  await waitFor(() => expect(command).toHaveBeenCalledWith('20', '40', '50', { expectedRevision: 0, expectedBasisHash: 'basis-hash', operation: 'RECORD', verdict: 'FALSE_POSITIVE', assessment: '适用条件需要核对', evidence: '合成来源第 3 段', suggestion: '', reason: '首次研判' }))
  expect(await screen.findByText('已追加研判意见，历史及原运行结果保留。')).toBeInTheDocument()
  expect(changed).toHaveBeenCalledOnce()
  expect(screen.getByText('固定命中原因')).toBeInTheDocument()
  expect(screen.getByText('固定人工意见')).toBeInTheDocument()
})
it('only exposes outcome-compatible verdicts and clearly shows missing frozen facts', async () => {
  mount({ ...empty, input: null, gaps: ['没有可读取的固定事实'], allowedVerdicts: ['DATA_ISSUE', 'RULE_ISSUE', 'UNCERTAIN'] })
  expect(await screen.findByText('没有可读取的固定事实')).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '疑似误报' })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '疑似漏检' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: '尚不能判断' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '撤回我的最新意见' })).not.toBeInTheDocument()
})
it('withdraws only with explicit reason and retains the old opinion in history', async () => {
  const { command } = mount(recorded)
  const withdrawn = { ...first, id: '71', revision: 2, operation: 'WITHDRAW', verdict: null, assessment: null, evidence: null, suggestion: null, reason: '需补充核实' }
  command.mockResolvedValue({ ...recorded, latest: withdrawn, canWithdraw: false, history: { ...recorded.history, content: [withdrawn, first], totalElements: 2 } })
  const button = await screen.findByRole('button', { name: '撤回我的最新意见' })
  expect(button).toBeDisabled()
  await userEvent.type(screen.getByLabelText('记录、更正或撤回原因'), '需补充核实')
  await userEvent.click(screen.getByRole('checkbox')); await userEvent.click(button)
  await waitFor(() => expect(command).toHaveBeenCalledWith('20', '40', '50', { expectedRevision: 1, expectedBasisHash: 'basis-hash', operation: 'WITHDRAW', reason: '需补充核实' }))
  expect(await screen.findByText('已撤回最新意见，观察重新计入待研判。')).toBeInTheDocument()
  expect(screen.getByText('固定人工意见')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '撤回我的最新意见' })).not.toBeInTheDocument()
})
it('discards consent and stale controls after a failed save and refresh', async () => {
  const { detail, command } = mount(); await fill(); await userEvent.click(screen.getByRole('checkbox'))
  command.mockRejectedValue(new Error('研判已变化')); detail.mockRejectedValue(new Error('读取失败'))
  await userEvent.click(screen.getByRole('button', { name: '追加研判意见' }))
  expect(await screen.findByText('研判已变化')).toBeInTheDocument()
  expect(await screen.findByText('读取失败')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '追加研判意见' })).not.toBeInTheDocument()
  expect(screen.queryByText('固定命中原因')).not.toBeInTheDocument()
})
it('a changed latest revision resets unsent content instead of applying it to another reviewer’s judgment', async () => {
  const { detail } = mount(); await fill(); await userEvent.click(screen.getByRole('checkbox'))
  detail.mockResolvedValue(recorded)
  await userEvent.click(screen.getByRole('button', { name: '刷新观察与研判' }))
  await screen.findByText('固定人工意见')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByLabelText('研判说明')).toHaveValue('')
  expect(screen.getByRole('button', { name: '追加研判意见' })).toBeDisabled()
})
