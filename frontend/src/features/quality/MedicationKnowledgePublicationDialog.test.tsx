import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeReviewBasis, KnowledgeReviewEvent, KnowledgeRuleCandidate, KnowledgeDeploymentPreview, KnowledgePublicationPreview } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgePublicationDialog } from './MedicationKnowledgePublicationDialog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'
const candidate: KnowledgeRuleCandidate = { id: '20', knowledgeId: '10', version: 1, knowledge: { id: '10', version: 2, status: 'DRAFT', body: { ...emptyKnowledge(), title: '合成审核知识', evidence: { ...emptyKnowledge().evidence, excerpt: '固定提交原文' } }, assessment: { structureComplete: true, issues: [], ruleDescription: '测试表达', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }, actor: '知识作者', savedAt: '2026-09-21T00:00:00Z', changeReason: '测试' }, knowledgeHash: 'knowledge-hash', programHash: 'program-hash', program: { schemaVersion: 'v1', operator: 'SAME_STANDARD_ENTRY', exposureScope: 'SAME_PRESCRIPTION', groupA: { targets: [], routeMode: 'ALL', routes: [] }, groupB: { targets: [], routeMode: 'ALL', routes: [] }, minimumOrders: 2, age: { mode: 'ALL', unit: null, minimumInclusive: null, maximumExclusive: null }, effectiveFrom: null, effectiveTo: null, proposedAction: 'WARN', requiredFacts: [] }, cases: [], actorId: '7', actor: '候选作者', createdAt: '2026-09-21T00:00:00Z', reason: '测试' }
const basis: KnowledgeReviewBasis = { candidate, validation: null, possibleConflicts: [], fingerprint: 'submitted-hash' }
const submitted: KnowledgeReviewEvent = { id: '30', candidateId: '20', operation: 'SUBMIT', submissionId: null, basis, action: null, unavailableAction: null, standardVerified: false, evidenceVerified: false, testsVerified: false, assessment: null, actorId: '7', actor: '提交人', time: '2026-09-21T00:00:00Z', reason: '固定合成依据' }

const release = { id: '40', versionId: '20', version: 1, mode: 'SHADOW', status: 'ACTIVE', action: 'BLOCK', organizationId: '1', departmentId: '2', effectiveFrom: submitted.time, effectiveTo: null, actorId: '8', createdAt: submitted.time, reason: '合成部署' }
const ready: KnowledgeDeploymentPreview = { revision: 2, organizationId: '1', departmentId: '2', approval: { ...submitted, operation: 'APPROVE', actor: '审核人', action: 'BLOCK', unavailableAction: 'REQUIRE_OVERRIDE', assessment: '合成审批' }, gaps: [], deployments: [] }

const publication: KnowledgePublicationPreview = { revision: 2, candidateId: '20', organizationId: '1', departmentId: '2', basis: { operation: 'PROMOTE', sourceDeploymentId: '40', shadowDeploymentId: '40', throughRunId: '60', approval: ready.approval!, observations: [], outcomes: { MATCH: 1, NO_MATCH: 0, UNAVAILABLE: 0, NOT_APPLICABLE: 0 }, fingerprint: 'cohort-hash' }, gaps: [], notices: ['只使用本批固定观察材料'], formalDeployments: [] }
const formal = { ...release, id: '41', mode: 'ENFORCED', status: 'ACTIVE' }
function mount(p = publication, releases = [release]) {
  const api = { deploymentPreview: vi.fn().mockResolvedValue({ ...ready, deployments: releases }), publicationPreview: vi.fn().mockResolvedValue(p), publicationCommand: vi.fn().mockResolvedValue(formal), deploymentCommand: vi.fn().mockResolvedValue({ ...formal, status: 'PAUSED' }), publicationMaterial: vi.fn().mockRejectedValue(new Error('材料不可读取')) }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgePublicationDialog api={{ medicationKnowledgeDrafts: api } as unknown as RhnApi} candidate={candidate} onClose={vi.fn()} /></QueryClientProvider>)
  return api
}
async function choose(id = '40') {
  await screen.findByRole('option', { name: new RegExp(id) })
  await userEvent.selectOptions(screen.getByLabelText('核对来源发布'), id)
  await screen.findByLabelText('旁路验收与上线评估')
}
async function fill() {
  await userEvent.type(screen.getByLabelText('操作原因（启用、暂停或回退）'), '完成机构验收')
  await userEvent.type(screen.getByLabelText('旁路验收与上线评估'), '已核对本批样本和风险')
  await userEvent.type(screen.getByLabelText('回退与应急安排'), '异常时暂停，联系负责人')
}
it('requires an explicit source, assessment, rollback plan and all confirmations before formal activation', async () => {
  const api = mount()
  expect(api.publicationCommand).not.toHaveBeenCalled()
  await choose(); await fill()
  const button = screen.getByRole('button', { name: '确认正式启用当前科室' })
  expect(button).toBeDisabled()
  for (const check of screen.getAllByRole('checkbox')) await userEvent.click(check)
  await userEvent.click(button)
  await waitFor(() => expect(api.publicationCommand).toHaveBeenCalledWith('20', { expectedRevision: 2, operation: 'PROMOTE', sourceDeploymentId: '40', throughRunId: '60', expectedFingerprint: 'cohort-hash', effectiveTo: undefined, assessment: '已核对本批样本和风险', rollbackPlan: '异常时暂停，联系负责人', reason: '完成机构验收', observationsConfirmed: true, actionsConfirmed: true, rollbackConfirmed: true }))
  expect(await screen.findByText('已独立启用当前科室正式规则，来源旁路已暂停。')).toBeInTheDocument()
})
it('blocks activation with preflight gaps while preserving explicit pause for an existing formal release', async () => {
  const api = mount({ ...publication, gaps: ['本批仍有待研判观察'] }, [release, formal])
  await choose(); expect(await screen.findByText('本批仍有待研判观察')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认正式启用当前科室' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('操作原因（启用、暂停或回退）'), '暂停核查')
  await userEvent.click(screen.getByRole('button', { name: '暂停此正式发布' }))
  await waitFor(() => expect(api.deploymentCommand).toHaveBeenCalledWith('20', { expectedRevision: 2, operation: 'PAUSE', mode: 'ENFORCED', deploymentId: '41', reason: '暂停核查' }))
})
it('rollback targets the selected historical candidate rather than the currently open candidate', async () => {
  const prior = { ...formal, id: '39', versionId: '19', status: 'SUPERSEDED' }
  const api = mount({ ...publication, candidateId: '19', basis: { ...publication.basis, operation: 'ROLLBACK', sourceDeploymentId: '39' } }, [release, prior])
  await screen.findByRole('option', { name: /40/ })
  await userEvent.selectOptions(screen.getByLabelText('发布操作'), 'ROLLBACK')
  await choose('39'); await fill()
  expect(api.publicationPreview).toHaveBeenCalledWith('19', '39', 'ROLLBACK')
  for (const check of screen.getAllByRole('checkbox')) await userEvent.click(check)
  await userEvent.click(screen.getByRole('button', { name: '确认创建回退发布' }))
  await waitFor(() => expect(api.publicationCommand).toHaveBeenCalledWith('19', expect.objectContaining({ operation: 'ROLLBACK', sourceDeploymentId: '39' })))
})
it('changed preview invalidates consent and request errors never leave a one-click resubmission', async () => {
  const api = mount(); await choose(); await fill()
  for (const check of screen.getAllByRole('checkbox')) await userEvent.click(check)
  api.publicationPreview.mockResolvedValue({ ...publication, revision: 3, basis: { ...publication.basis, fingerprint: 'changed' } })
  await userEvent.click(screen.getByRole('button', { name: '刷新发布材料' }))
  await waitFor(() => expect(screen.getByLabelText('旁路验收与上线评估')).toHaveValue(''))
  expect(screen.getAllByRole('checkbox').every(c => !(c as HTMLInputElement).checked)).toBe(true)
  await fill(); for (const check of screen.getAllByRole('checkbox')) await userEvent.click(check)
  api.publicationCommand.mockRejectedValue(new Error('发布已变化'))
  api.publicationPreview.mockRejectedValue(new Error('材料读取失败'))
  await userEvent.click(screen.getByRole('button', { name: '确认正式启用当前科室' }))
  expect(await screen.findByText('材料读取失败')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认正式启用当前科室' })).not.toBeInTheDocument()
})
