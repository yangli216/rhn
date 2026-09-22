import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { RuleIntakeRun, RuleIntakeCapability } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationRuleIntake } from './MedicationRuleIntake'
import { MedicationKnowledgeDrafts } from './MedicationKnowledgeDrafts'
const duplicate: RuleIntakeCapability = { kind: 'DUPLICATE_THERAPY', name: '重复用药', knowledgeWorkflow: true, prerequisites: ['重复关系与标准身份'], boundary: '只支持同一处方；不推断药理等效' }
const dose: RuleIntakeCapability = { kind: 'SINGLE_DOSE', name: '单次剂量', knowledgeWorkflow: false, prerequisites: ['制剂规格不是常规用量'], boundary: '剂量知识工作流尚未覆盖' }
const quote = { source: 'requirement', quote: '所有药品重复用药时提示', start: 0, end: 11 }
const run: RuleIntakeRun = { id: '50', parentId: null, input: { requirement: quote.quote, clarifications: [] }, inputHash: 'input-hash', model: 'test', promptVersion: 'v1', capabilityVersion: 'cap-v1', result: { status: 'ANALYZED', intents: [{ kind: duplicate.kind, name: duplicate.name, citation: quote, scope: 'ALL_DRUGS', scopeCitation: quote, conditions: [], capability: duplicate }], questions: [{ id: 'Q1', text: '是否只检查同一处方？', origin: 'AI' }], notes: ['这不是药学证据'] }, resultHash: 'result-hash', rawOutput: '{}', rawTruncated: false, actorId: '7', actor: '用户', createdAt: '2026-09-21T00:00:00Z' }
function setup(result = run, available = true) {
  const api = { intakeFeedbackOrigin: vi.fn().mockResolvedValue(null), intakeCapabilities: vi.fn().mockResolvedValue([duplicate, dose]), intakeHistory: vi.fn().mockResolvedValue({ content: [{ id: '50', requirement: run.input.requirement, status: 'ANALYZED', actor: '用户', createdAt: run.createdAt }], totalElements: 1, totalPages: 1, page: 0, size: 20 }), analyzeIntake: vi.fn().mockResolvedValue(result), intake: vi.fn().mockResolvedValue(run) }
  const onStart = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationRuleIntake api={{ medicationKnowledgeDrafts: api, medicationWorkbench: { status: vi.fn().mockResolvedValue({ available, model: 'test', message: '模型未配置' }) } } as unknown as RhnApi} onStartKnowledge={onStart} /></QueryClientProvider>)
  return { api, onStart }
}
async function analyze() { await userEvent.type(screen.getByLabelText('待分析的用药规则需求'), run.input.requirement); await userEvent.click(screen.getByRole('button', { name: '分析需求与能力缺口' })) }
it('analyzes universal demand without medication selection and routes only after explicit user adoption', async () => {
  const { api, onStart } = setup()
  await analyze()
  await screen.findByText('建议分类：重复用药')
  expect(api.analyzeIntake).toHaveBeenCalledWith({ requirement: run.input.requirement, parentId: undefined, answers: [] })
  expect(onStart).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '以此需求建立重复用药知识草稿' }))
  expect(onStart).toHaveBeenCalledWith({ kind: 'DUPLICATE_THERAPY', run })
})
it('retains unsupported dose requirements and explains the distinction between strength and routine dose', async () => {
  setup({ ...run, result: { ...run.result, intents: [{ ...run.result.intents[0], kind: dose.kind, name: dose.name, capability: dose }] } })
  await analyze()
  await screen.findByText('建议分类：单次剂量')
  expect(screen.getByText('制剂规格不是常规用量')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /以此需求建立/ })).not.toBeInTheDocument()
  expect(screen.getByText('保留为能力建设需求')).toBeInTheDocument()
})
it('reanalysis carries answers with the exact parent id and does not replace the original demand', async () => {
  const { api } = setup()
  await analyze()
  await userEvent.type(await screen.findByLabelText('是否只检查同一处方？'), '仅同一处方')
  await userEvent.click(screen.getByRole('button', { name: '结合回答重新分析' }))
  await waitFor(() => expect(api.analyzeIntake).toHaveBeenLastCalledWith({ requirement: run.input.requirement, parentId: '50', answers: [{ questionId: 'Q1', value: '仅同一处方' }] }))
})
it('history is read-only, editing invalidates results, and failed reads do not leave an old adoption action', async () => {
  const { api } = setup()
  await userEvent.click(await screen.findByRole('button', { name: /所有药品重复用药时提示/ }))
  await screen.findByText('历史分析 · 只读')
  expect(screen.queryByRole('button', { name: /以此需求建立/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '基于此记录继续澄清' }))
  expect(screen.getByRole('button', { name: /以此需求建立/ })).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('待分析的用药规则需求'), '，例外待补充')
  expect(screen.queryByRole('button', { name: /以此需求建立/ })).not.toBeInTheDocument()
  api.intake.mockRejectedValueOnce(new Error('历史读取失败'))
  await userEvent.click(screen.getByRole('button', { name: /所有药品重复用药时提示/ }))
  await screen.findByText('历史读取失败')
  expect(screen.queryByRole('button', { name: /以此需求建立/ })).not.toBeInTheDocument()
})
it('model unavailability disables model work while retaining the capability guide', async () => {
  const { api } = setup(run, false)
  await screen.findByText('模型未配置')
  await userEvent.type(screen.getByLabelText('待分析的用药规则需求'), '分析需求')
  expect(screen.getByRole('button', { name: '分析需求与能力缺口' })).toBeDisabled()
  expect(api.analyzeIntake).not.toHaveBeenCalled()
  expect(screen.getByText('当前知识建设能力范围')).toBeInTheDocument()
})
it('retries a failed analysis without discarding its prior clarification context', async () => {
  const failed = { ...run, id: '51', input: { ...run.input, clarifications: [{ analysisId: '50', questionId: 'Q1', question: '是否只检查同一处方？', answer: '仅同一处方' }] }, result: { status: 'MODEL_ERROR', intents: [], questions: [], notes: ['调用失败'] } }
  const { api } = setup(failed)
  await analyze()
  await userEvent.click(await screen.findByRole('button', { name: '保留澄清重试分析' }))
  await waitFor(() => expect(api.analyzeIntake).toHaveBeenLastCalledWith({ requirement: run.input.requirement, parentId: '51', answers: [] }))
})
it('a routed draft links requirement provenance but keeps dosage, scope and evidence unresolved', async () => {
  const knowledgeApi = { intakeFeedbackOrigin: vi.fn().mockResolvedValue(null), intake: vi.fn().mockResolvedValue(run), list: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }), save: vi.fn().mockRejectedValue(new Error('留在草稿编辑供核对')) }
  const consume = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MedicationKnowledgeDrafts api={{ medicationKnowledgeDrafts: knowledgeApi, masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue({ routes: [] }) } } as unknown as RhnApi} initialIntake={{ kind: 'DUPLICATE_THERAPY', run }} onIntakeConsumed={consume} /></QueryClientProvider>)
  await screen.findByText('关联需求分析 · 非药学证据')
  expect(screen.getByLabelText('来源原文片段')).toHaveValue('')
  expect(screen.getByLabelText('触发医嘱条数')).toHaveValue(null)
  await userEvent.type(screen.getByLabelText('本次保存原因'), '保留需求待核查')
  await userEvent.click(screen.getByRole('button', { name: '保存草稿新版本' }))
  await waitFor(() => expect(knowledgeApi.save).toHaveBeenCalledWith(undefined, 0, expect.objectContaining({ minimumOrders: null, exposureScope: '', matchMode: '', conditions: expect.objectContaining({ ageMode: 'UNSPECIFIED', additionalConditions: expect.stringContaining('尚待逐项结构化') }) }), '保留需求待核查', undefined, '50'))
  expect(consume).toHaveBeenCalled()
})
