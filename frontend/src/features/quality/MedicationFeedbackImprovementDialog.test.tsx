import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { IntakeFeedbackOrigin, IntakeImprovementOrigin, RuleIntakeRun } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationFeedbackImprovementDialog } from './MedicationFeedbackImprovementDialog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'
const origin: IntakeFeedbackOrigin = { knowledgeId: '100', knowledgeVersion: 1, title: '重复用药核查', feedback: { id: '31', revision: 2, operation: 'RECORD', verdict: 'RULE_ISSUE', assessment: '范围待核查', evidence: '人工核对记录，不是医学原文', suggestion: '请核对例外', reason: '记录问题', actorId: '7', actor: '药师', time: '2026-09-21T00:00:00Z', basis: { candidateId: '20', deploymentId: '30', runId: '40', organizationId: '2', departmentId: '3', outcome: 'MATCH', runHash: 'run-hash', releaseFingerprint: 'release-hash', programHash: 'program-hash', knowledgeHash: 'knowledge-hash', fingerprint: 'basis-hash' } } }
const need = '同一处方重复用药需核查例外'
const capability = { kind: 'DUPLICATE_THERAPY', name: '重复用药', knowledgeWorkflow: true, prerequisites: ['核对来源'], boundary: '只支持同一处方' }
const run: RuleIntakeRun = { id: '50', parentId: null, input: { requirement: need, clarifications: [] }, inputHash: 'input', model: 'test', promptVersion: 'v1', capabilityVersion: 'v1', result: { status: 'ANALYZED', intents: [{ kind: capability.kind, name: capability.name, citation: { source: 'requirement', quote: '重复用药', start: 4, end: 8 }, scope: 'UNSPECIFIED', scopeCitation: null, conditions: [], capability }], questions: [{ id: 'Q1', text: '例外是什么？', origin: 'AI' }], notes: [] }, resultHash: 'result', rawOutput: '{}', rawTruncated: false, actorId: '7', actor: '药师', createdAt: '2026-09-21T00:00:00Z' }
const assessment = { structureComplete: true, issues: [], ruleDescription: '合成说明', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }
const detail = { saved: { id: '100', version: 3, status: 'DRAFT', body: { ...emptyKnowledge(), title: '已更新至最新版本', evidence: { ...emptyKnowledge().evidence, excerpt: '保留独立药学原文' } }, assessment, actor: '作者', savedAt: run.createdAt, changeReason: '历史修改' }, currentAssessment: assessment, cases: [], possibleConflicts: [] }
function mount(failedDetail = false, source: IntakeImprovementOrigin = origin) {
  const api = { intakeCapabilities: vi.fn().mockResolvedValue([capability]), intakeFeedbackOrigin: vi.fn().mockResolvedValue(source), intake: vi.fn().mockResolvedValue(run), feedbackImprovementHistory: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }), analyzeFeedbackImprovement: vi.fn().mockResolvedValue(run), analyzeIntake: vi.fn(), detail: failedDetail ? vi.fn().mockRejectedValue(new Error('最新知识读取失败')) : vi.fn().mockResolvedValue(detail), list: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }), save: vi.fn().mockRejectedValue(new Error('合成保存结果')) }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationFeedbackImprovementDialog api={{ medicationKnowledgeDrafts: api, medicationWorkbench: { status: vi.fn().mockResolvedValue({ available: true, model: 'test' }) }, masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue({ routes: [] }) } } as unknown as RhnApi} origin={source} onClose={vi.fn()} /></QueryClientProvider>)
  return api
}
async function analyze() {
  await userEvent.clear(screen.getByLabelText('待分析的用药规则需求'))
  await userEvent.type(screen.getByLabelText('待分析的用药规则需求'), need)
  await userEvent.click(screen.getByRole('checkbox', { name: /已核对反馈/ }))
  await userEvent.click(screen.getByRole('button', { name: '分析需求与能力缺口' }))
  await screen.findByText('建议分类：重复用药')
}
it('requires explicit consent and sends the pinned origin with only edited intent', async () => {
  const api = mount()
  expect(screen.getByRole('button', { name: '分析需求与能力缺口' })).toBeDisabled()
  await analyze()
  expect(api.analyzeFeedbackImprovement).toHaveBeenCalledWith(origin, { requirement: need, parentId: undefined, answers: [] })
  expect(api.analyzeIntake).not.toHaveBeenCalled()
  expect(screen.getByRole('checkbox', { name: /已核对反馈/ })).not.toBeChecked()
  await userEvent.type(screen.getByLabelText('例外是什么？'), '待查独立来源')
  expect(screen.getByRole('button', { name: '结合回答重新分析' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: /已核对反馈/ }))
  await userEvent.click(screen.getByRole('button', { name: '结合回答重新分析' }))
  await waitFor(() => expect(api.analyzeFeedbackImprovement).toHaveBeenLastCalledWith(origin, { requirement: need, parentId: '50', answers: [{ questionId: 'Q1', value: '待查独立来源' }] }))
})
it('edits the latest knowledge version with unresolved conditions, preserving independent evidence', async () => {
  const api = mount(); await analyze()
  await userEvent.click(screen.getByRole('button', { name: '以此需求建立重复用药知识草稿' }))
  await screen.findByText(/已载入当前第 3 版供修改/)
  expect(api.detail).toHaveBeenCalledWith('100')
  expect(screen.getByLabelText('知识标题')).toHaveValue('已更新至最新版本')
  expect(screen.getByLabelText('来源原文片段')).toHaveValue('保留独立药学原文')
  expect((screen.getByLabelText('其他适用条件') as HTMLTextAreaElement).value).toContain('尚待逐项核对与结构化')
  expect(api.save).not.toHaveBeenCalled()
  await userEvent.type(screen.getByLabelText('本次保存原因'), '处理范围核对')
  await userEvent.click(screen.getByRole('button', { name: '保存草稿新版本' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledWith('100', 3, expect.objectContaining({ title: '已更新至最新版本' }), '处理范围核对', undefined, '50'))
})
it('failed latest-knowledge reads prevent saving an unrelated blank draft', async () => {
  const api = mount(true); await analyze()
  await userEvent.click(screen.getByRole('button', { name: '以此需求建立重复用药知识草稿' }))
  await screen.findByText('最新知识读取失败')
  await userEvent.type(screen.getByLabelText('本次保存原因'), '不能替代读取失败的知识')
  expect(screen.getByRole('button', { name: '保存草稿新版本' })).toBeDisabled()
  expect(api.save).not.toHaveBeenCalled()
})
it('a stale-feedback rejection removes usable adoption controls and resets consent', async () => {
  const api = mount();api.analyzeFeedbackImprovement.mockRejectedValue(new Error('研判已变化，请重新核对'))
  await userEvent.clear(screen.getByLabelText('待分析的用药规则需求'))
  await userEvent.type(screen.getByLabelText('待分析的用药规则需求'), need)
  await userEvent.click(screen.getByRole('checkbox', { name: /已核对反馈/ }))
  await userEvent.click(screen.getByRole('button', { name: '分析需求与能力缺口' }))
  await screen.findByText('研判已变化，请重新核对')
  expect(screen.queryByRole('button', { name: /以此需求建立/ })).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /已核对反馈/ })).not.toBeChecked()
})

it('pharmacist feedback opens its linked latest knowledge without replacing clinical evidence', async () => {
  const source: IntakeImprovementOrigin = { feedback: null, knowledgeId: '100', knowledgeVersion: 1, title: '重复用药核查', pharmacy: { organizationId: '2', departmentId: '3', taskId: '10', review: { id: '20', reviewNo: 'R20', result: 'INTERVENE', description: '请核对例外', pharmacistPractitionerId: '4', reviewerUserId: '5', reviewerAssignmentId: '6', reviewedAt: '2026-09-21T00:00:00Z' }, finding: null } }
  const api = mount(false, source)
  await analyze()
  expect(api.analyzeFeedbackImprovement).toHaveBeenCalledWith(source, { requirement: need, parentId: undefined, answers: [] })
  await userEvent.click(screen.getByRole('button', { name: '以此需求建立重复用药知识草稿' }))
  await screen.findByText(/已载入当前第 3 版供修改/)
  expect(api.detail).toHaveBeenCalledWith('100')
  expect(screen.getByLabelText('来源原文片段')).toHaveValue('保留独立药学原文')
  expect(api.save).not.toHaveBeenCalled()
})
