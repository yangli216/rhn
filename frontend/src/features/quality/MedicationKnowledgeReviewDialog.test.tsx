import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeReviewBasis, KnowledgeReviewEvent, KnowledgeReviewPreview, KnowledgeRuleCandidate } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgeReviewDialog } from './MedicationKnowledgeReviewDialog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'

const candidate: KnowledgeRuleCandidate = { id: '20', knowledgeId: '10', version: 1, knowledge: { id: '10', version: 2, status: 'DRAFT', body: { ...emptyKnowledge(), title: '合成审核知识', evidence: { ...emptyKnowledge().evidence, excerpt: '固定提交原文' } }, assessment: { structureComplete: true, issues: [], ruleDescription: '测试表达', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }, actor: '知识作者', savedAt: '2026-09-21T00:00:00Z', changeReason: '测试' }, knowledgeHash: 'knowledge-hash', programHash: 'program-hash', program: { schemaVersion: 'v1', operator: 'SAME_STANDARD_ENTRY', exposureScope: 'SAME_PRESCRIPTION', groupA: { targets: [], routeMode: 'ALL', routes: [] }, groupB: { targets: [], routeMode: 'ALL', routes: [] }, minimumOrders: 2, age: { mode: 'ALL', unit: null, minimumInclusive: null, maximumExclusive: null }, effectiveFrom: null, effectiveTo: null, proposedAction: 'WARN', requiredFacts: [] }, cases: [], actorId: '7', actor: '候选作者', createdAt: '2026-09-21T00:00:00Z', reason: '测试' }
const basis: KnowledgeReviewBasis = { candidate, validation: null, possibleConflicts: [], fingerprint: 'submitted-hash' }
const submitted: KnowledgeReviewEvent = { id: '30', candidateId: '20', operation: 'SUBMIT', submissionId: null, basis, action: null, unavailableAction: null, standardVerified: false, evidenceVerified: false, testsVerified: false, assessment: null, actorId: '7', actor: '提交人', time: '2026-09-21T00:00:00Z', reason: '固定合成依据' }
const ready: KnowledgeReviewPreview = { revision: 1, status: 'IN_REVIEW', current: basis, issues: [], gaps: [], submission: submitted, latest: submitted, basisUnchanged: true, allowedOperations: ['REJECT', 'APPROVE'], reviewerRestrictions: [] }
function mount(value: KnowledgeReviewPreview = ready) {
  const api = { reviewPreview: vi.fn().mockResolvedValue(value), reviewHistory: vi.fn().mockResolvedValue({ content: [{ id: '30', operation: 'SUBMIT', actor: '提交人', time: submitted.time, reason: '固定合成依据' }], totalElements: 1, totalPages: 1, page: 0, size: 20 }), reviewEvent: vi.fn().mockResolvedValue(submitted), reviewCommand: vi.fn().mockResolvedValue(submitted) }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgeReviewDialog api={{ medicationKnowledgeDrafts: api } as unknown as RhnApi} candidate={candidate} onClose={vi.fn()} /></QueryClientProvider>)
  return api
}
async function checks() {
  for (const text of ['已核对标准身份、范围与版本', '已核对来源原文、适用条件、证据有效性与潜在冲突', '已独立复核样例、预期及验证结果']) await userEvent.click(screen.getByRole('checkbox', { name: text }))
  await userEvent.click(screen.getByRole('combobox', { name: '命中时处置' }))
  await userEvent.click(screen.getByRole('option', { name: '阻止提交' }))
  await userEvent.click(screen.getByRole('combobox', { name: '无法评价时处置' }))
  await userEvent.click(screen.getByRole('option', { name: '需填写理由后继续' }))
  await userEvent.type(screen.getByLabelText('药学审核意见'), '人工核对合成依据及边界')
  await userEvent.type(screen.getByLabelText('审核操作原因'), '完成评审')
}
it('requires explicit attestations and both action policies, sending the submitted fingerprint', async () => {
  const api = mount()
  const approve = await screen.findByRole('button', { name: '审核通过' })
  expect(approve).toBeDisabled()
  await checks()
  await userEvent.click(approve)
  await waitFor(() => expect(api.reviewCommand).toHaveBeenCalledWith('20', { expectedRevision: 1, operation: 'APPROVE', expectedBasisHash: 'submitted-hash', reason: '完成评审', action: 'BLOCK', unavailableAction: 'REQUIRE_OVERRIDE', standardVerified: true, evidenceVerified: true, testsVerified: true, assessment: '人工核对合成依据及边界' }))
  expect(await screen.findByText('审核通过已记录。该操作不会发布或启用规则。')).toBeInTheDocument()
})
it('submits the current material only after a reason and does not invent reviewer policy', async () => {
  const api = mount({ ...ready, status: 'DRAFT', revision: 0, submission: null, latest: null, current: { ...basis, fingerprint: 'current-hash' }, allowedOperations: ['SUBMIT'] })
  const submit = await screen.findByRole('button', { name: '提交审核' })
  expect(submit).toBeDisabled()
  expect(screen.queryByLabelText('命中时处置')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('审核操作原因'), '提交固定版本')
  await userEvent.click(submit)
  await waitFor(() => expect(api.reviewCommand).toHaveBeenCalledWith('20', { expectedRevision: 0, operation: 'SUBMIT', expectedBasisHash: 'current-hash', reason: '提交固定版本' }))
})
it('shows separation restrictions and withdrawal without self-approval controls', async () => {
  mount({ ...ready, allowedOperations: ['WITHDRAW'], reviewerRestrictions: ['当前人员是本次提交人'] })
  await screen.findByRole('button', { name: '撤回提交' })
  expect(screen.queryByRole('button', { name: '审核通过' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '退回修改' })).not.toBeInTheDocument()
  expect(screen.getByText(/当前人员是本次提交人/)).toBeInTheDocument()
})
it('keeps submitted evidence visible when current material changes and permits only rejection', async () => {
  mount({ ...ready, current: { ...basis, fingerprint: 'new-hash', candidate: { ...candidate, knowledge: { ...candidate.knowledge, body: { ...candidate.knowledge.body, evidence: { ...candidate.knowledge.body.evidence, excerpt: '当前变化原文' } } } } }, basisUnchanged: false, allowedOperations: ['REJECT'], gaps: ['最新材料需重新提交'] })
  await screen.findByText('固定提交原文')
  expect(screen.queryByText('当前变化原文')).not.toBeInTheDocument()
  expect(screen.getByText(/当前材料与提交时不同/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '审核通过' })).not.toBeInTheDocument()
})
it('clears prior attestations on a failed command and refreshes material before retry', async () => {
  const api = mount()
  await screen.findByRole('button', { name: '审核通过' })
  await checks()
  api.reviewCommand.mockRejectedValueOnce(new Error('审核材料已变化'))
  await userEvent.click(screen.getByRole('button', { name: '审核通过' }))
  await screen.findByText('审核材料已变化')
  expect(screen.getByRole('checkbox', { name: '已核对标准身份、范围与版本' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: '审核通过' })).toBeDisabled()
  expect(screen.getByLabelText('药学审核意见')).toHaveValue('人工核对合成依据及边界')
})
it('history is read-only and failed reads or refreshes cannot leave actionable stale evidence', async () => {
  const api = mount()
  const history = await screen.findByRole('button', { name: /提交审核 · 提交人/ })
  await userEvent.click(history)
  await screen.findByText('历史审核材料 · 只读')
  expect(screen.queryByRole('button', { name: '审核通过' })).not.toBeInTheDocument()
  api.reviewEvent.mockRejectedValueOnce(new Error('历史记录读取失败'))
  await userEvent.click(history)
  await screen.findByText('历史记录读取失败')
  expect(screen.queryByText('固定提交原文')).not.toBeInTheDocument()
  api.reviewPreview.mockRejectedValueOnce(new Error('当前材料读取失败'))
  await userEvent.click(screen.getByRole('button', { name: '刷新当前材料' }))
  await screen.findByText('当前材料读取失败')
  expect(screen.queryByRole('button', { name: '审核通过' })).not.toBeInTheDocument()
  expect(api.reviewCommand).not.toHaveBeenCalled()
})
