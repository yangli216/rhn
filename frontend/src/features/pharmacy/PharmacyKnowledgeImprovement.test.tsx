import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { PharmacyIntakeOrigin } from '../../shared/api/medicationKnowledgeDraftApi'
import { PharmacyKnowledgeImprovement } from './PharmacyKnowledgeImprovement'

const finding = { findingId: '7', ruleCode: 'QMED.KNOWLEDGE.10', ruleVersion: 1, category: 'DUPLICATE_THERAPY', severity: 'HIGH' as const, decision: 'WARN' as const, message: '合成重复提示', medicationRequestIds: ['2'], evidence: [], overridePolicy: 'ACKNOWLEDGE' as const, suggestedAction: '核对范围' }
const origin: PharmacyIntakeOrigin = { feedback: null, knowledgeId: '10', knowledgeVersion: 1, title: '重复用药', pharmacy: { taskId: '5', organizationId: '1', departmentId: '3', review: { id: '6', reviewNo: 'R6', result: 'INTERVENE', description: '审方原文仅供本地核对', reviewedAt: '2026-09-21T00:00:00Z', pharmacistPractitionerId: '8', reviewerUserId: '9', reviewerAssignmentId: '11' }, finding } }
const requirement = '核查重复用药的适用范围'
const capability = { kind: 'DUPLICATE_THERAPY', name: '重复用药', knowledgeWorkflow: true, prerequisites: [], boundary: '同处方' }
function mount(failure = false) {
  const api = { medicationWorkbench: { status: vi.fn().mockResolvedValue({ available: true, model: 'test' }) }, medicationKnowledgeDrafts: {
    pharmacyImprovementSource: failure ? vi.fn().mockRejectedValue(new Error('无权读取本任务')) : vi.fn().mockResolvedValue(origin),
    intakeCapabilities: vi.fn().mockResolvedValue([capability]), feedbackImprovementHistory: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0 }),
    analyzeFeedbackImprovement: vi.fn().mockResolvedValue({ id: '20', input: { requirement, clarifications: [] }, result: { status: 'ANALYZED', intents: [], notes: [], questions: [] }, createdAt: '2026-09-21T00:00:00Z' }),
    intakeFeedbackOrigin: vi.fn().mockResolvedValue(origin),
  } }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><PharmacyKnowledgeImprovement api={api as unknown as RhnApi} taskId="5" reviewId="6" findings={[finding]} /></QueryClientProvider>)
  return api.medicationKnowledgeDrafts
}
it('does not analyze on opening; sends only edited requirement after source confirmation', async () => {
  const api = mount()
  expect(api.pharmacyImprovementSource).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '转为 AI 改进需求' }))
  await screen.findByText('将改进知识：重复用药')
  expect(api.analyzeFeedbackImprovement).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '编辑改进需求' }))
  expect(screen.getByRole('button', { name: '分析需求与能力缺口' })).toBeDisabled()
  await userEvent.clear(screen.getByLabelText('待分析的用药规则需求'))
  await userEvent.type(screen.getByLabelText('待分析的用药规则需求'), requirement)
  await userEvent.click(screen.getByRole('checkbox', { name: /已核对反馈/ }))
  await userEvent.click(screen.getByRole('button', { name: '分析需求与能力缺口' }))
  await waitFor(() => expect(api.analyzeFeedbackImprovement).toHaveBeenCalledWith(origin, { requirement, parentId: undefined, answers: [] }))
})
it('prevents entering the improvement editor when the saved review cannot be read', async () => {
  const api = mount(true)
  await userEvent.click(screen.getByRole('button', { name: '转为 AI 改进需求' }))
  await screen.findByText('无权读取本任务')
  expect(screen.getByRole('button', { name: '编辑改进需求' })).toBeDisabled()
  expect(api.analyzeFeedbackImprovement).not.toHaveBeenCalled()
})
