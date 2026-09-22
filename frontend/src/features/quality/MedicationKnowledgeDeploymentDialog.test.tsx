import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeReviewBasis, KnowledgeReviewEvent, KnowledgeRuleCandidate, KnowledgeDeploymentPreview } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgeDeploymentDialog } from './MedicationKnowledgeDeploymentDialog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'
const candidate: KnowledgeRuleCandidate = { id: '20', knowledgeId: '10', version: 1, knowledge: { id: '10', version: 2, status: 'DRAFT', body: { ...emptyKnowledge(), title: '合成审核知识', evidence: { ...emptyKnowledge().evidence, excerpt: '固定提交原文' } }, assessment: { structureComplete: true, issues: [], ruleDescription: '测试表达', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }, actor: '知识作者', savedAt: '2026-09-21T00:00:00Z', changeReason: '测试' }, knowledgeHash: 'knowledge-hash', programHash: 'program-hash', program: { schemaVersion: 'v1', operator: 'SAME_STANDARD_ENTRY', exposureScope: 'SAME_PRESCRIPTION', groupA: { targets: [], routeMode: 'ALL', routes: [] }, groupB: { targets: [], routeMode: 'ALL', routes: [] }, minimumOrders: 2, age: { mode: 'ALL', unit: null, minimumInclusive: null, maximumExclusive: null }, effectiveFrom: null, effectiveTo: null, proposedAction: 'WARN', requiredFacts: [] }, cases: [], actorId: '7', actor: '候选作者', createdAt: '2026-09-21T00:00:00Z', reason: '测试' }
const basis: KnowledgeReviewBasis = { candidate, validation: null, possibleConflicts: [], fingerprint: 'submitted-hash' }
const submitted: KnowledgeReviewEvent = { id: '30', candidateId: '20', operation: 'SUBMIT', submissionId: null, basis, action: null, unavailableAction: null, standardVerified: false, evidenceVerified: false, testsVerified: false, assessment: null, actorId: '7', actor: '提交人', time: '2026-09-21T00:00:00Z', reason: '固定合成依据' }

const release = { id: '40', versionId: '20', version: 1, mode: 'SHADOW', status: 'ACTIVE', action: 'BLOCK', organizationId: '1', departmentId: '2', effectiveFrom: submitted.time, effectiveTo: null, actorId: '8', createdAt: submitted.time, reason: '合成部署' }
const ready: KnowledgeDeploymentPreview = { revision: 2, organizationId: '1', departmentId: '2', approval: { ...submitted, operation: 'APPROVE', actor: '审核人', action: 'BLOCK', unavailableAction: 'REQUIRE_OVERRIDE', assessment: '合成审批' }, gaps: [], deployments: [] }
function mount(value = ready) {
  const api = { observationFeedback: vi.fn().mockRejectedValue(new Error("合成详情待读取")), recordObservationFeedback: vi.fn(), deploymentPreview: vi.fn().mockResolvedValue(value), deploymentCommand: vi.fn().mockResolvedValue(release), observations: vi.fn().mockResolvedValue({ organizationId: '1', departmentId: '2', counts: { MATCH: 2, NO_MATCH: 10, NOT_APPLICABLE: 1, UNAVAILABLE: 3 }, feedback: { recorded: 3, pending: 13, verdicts: { UNCERTAIN: 2, DATA_ISSUE: 1 } }, records: { content: [{ id: '50', deploymentId: '40', prescriptionId: '60', time: submitted.time, outcome: 'UNAVAILABLE', reasons: ['标准目录版本不一致'], matchedOrderIds: [] }], totalElements: 16, totalPages: 1, page: 0, size: 20 } }) }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgeDeploymentDialog api={{ medicationKnowledgeDrafts: api } as unknown as RhnApi} candidate={candidate} onClose={vi.fn()} /></QueryClientProvider>)
  return api
}
it('requires a reason and explicitly requests only shadow with the approved fingerprint', async () => {
  const api = mount()
  const button = await screen.findByRole('button', { name: '启用当前科室旁路' })
  expect(button).toBeDisabled()
  expect(screen.queryByRole('button', { name: '正式启用' })).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('旁路操作原因'), '验证当前科室')
  await userEvent.click(button)
  await waitFor(() => expect(api.deploymentCommand).toHaveBeenCalledWith('20', { expectedRevision: 2, operation: 'DEPLOY', mode: 'SHADOW', expectedBasisHash: 'submitted-hash', deploymentId: undefined, effectiveTo: undefined, reason: '验证当前科室' }))
  expect(await screen.findByText(/已启用当前科室旁路/)).toBeInTheDocument()
})
it('blocks new deployment when materials change while preserving an explicit pause operation', async () => {
  const api = mount({ ...ready, gaps: ['来源知识已有变化'], deployments: [release] })
  await screen.findByText('来源知识已有变化')
  await userEvent.type(screen.getByLabelText('旁路操作原因'), '暂停核查')
  expect(screen.getByRole('button', { name: '启用当前科室旁路' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '暂停此旁路' }))
  await waitFor(() => expect(api.deploymentCommand).toHaveBeenCalledWith('20', expect.objectContaining({ operation: 'PAUSE', mode: 'SHADOW', deploymentId: '40', reason: '暂停核查' })))
})
it('shows scoped observations and keeps unavailable distinct from no match', async () => {
  const api = mount({ ...ready, deployments: [release] })
  await screen.findByText('标准目录版本不一致')
  expect(api.observations).toHaveBeenCalledWith('20', '40', 0)
  expect(screen.getByText(/处方 60/)).toBeInTheDocument()
  expect(screen.getByText(/按评价次数统计/)).toBeInTheDocument()
  api.observations.mockRejectedValueOnce(new Error('观察读取失败'))
  await userEvent.click(screen.getByRole('button', { name: '刷新部署与观察' }))
  await screen.findByText('观察读取失败')
  expect(screen.queryByText('标准目录版本不一致')).not.toBeInTheDocument()
})
it('refresh failure removes stale controls and failed deployment preserves the reason for review', async () => {
  const api = mount()
  await screen.findByRole('button', { name: '启用当前科室旁路' })
  await userEvent.type(screen.getByLabelText('旁路操作原因'), '等待复核')
  api.deploymentCommand.mockRejectedValueOnce(new Error('规则目录已变化'))
  api.deploymentPreview.mockRejectedValueOnce(new Error('部署材料读取失败'))
  await userEvent.click(screen.getByRole('button', { name: '启用当前科室旁路' }))
  await screen.findByText('规则目录已变化')
  await screen.findByText('部署材料读取失败')
  expect(screen.queryByRole('button', { name: '启用当前科室旁路' })).not.toBeInTheDocument()
})

it('shows full latest-opinion statistics and opens feedback for the exact selected observation', async () => {
  const api = mount({ ...ready, deployments: [release] })
  expect(await screen.findByText('人工研判：已记录 3 次观察，待研判 13 次观察')).toBeInTheDocument()
  expect(screen.getByText(/这些数量不能当作临床准确率/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '查看与研判' }))
  await waitFor(() => expect(api.observationFeedback).toHaveBeenCalledWith('20', '40', '50', 0))
  expect(await screen.findByText('合成详情待读取')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '追加研判意见' })).not.toBeInTheDocument()
})
