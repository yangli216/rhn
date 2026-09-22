import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeRuleCandidate, KnowledgeTestSuiteDetail, KnowledgeTestRun } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgeTestDialog } from './MedicationKnowledgeTestDialog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'

const candidate: KnowledgeRuleCandidate = { id: '20', knowledgeId: '10', version: 1, knowledge: { id: '10', version: 2, status: 'DRAFT', body: { ...emptyKnowledge(), title: '合成重复知识' }, assessment: { structureComplete: true, issues: [], ruleDescription: '测试表达', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }, actor: '知识作者', savedAt: '2026-09-21T00:00:00Z', changeReason: '测试' }, knowledgeHash: 'knowledge-hash', programHash: 'program-hash', program: { schemaVersion: 'v1', operator: 'SAME_STANDARD_ENTRY', exposureScope: 'SAME_PRESCRIPTION', groupA: { targets: [], routeMode: 'ALL', routes: [] }, groupB: { targets: [], routeMode: 'ALL', routes: [] }, minimumOrders: 2, age: { mode: 'ALL', unit: null, minimumInclusive: null, maximumExclusive: null }, effectiveFrom: null, effectiveTo: null, proposedAction: 'WARN', requiredFacts: [] }, cases: [], actorId: '7', actor: '候选作者', createdAt: '2026-09-21T00:00:00Z', reason: '测试' }
const detail: KnowledgeTestSuiteDetail = { suiteHash: 'suite-hash', suite: { candidateId: '20', version: 1, programHash: 'program-hash', knowledgeHash: 'knowledge-hash', actorId: '8', actor: '样例作者', createdAt: '2026-09-21T00:00:00Z', reason: '人工定义预期', cases: [{ title: '手写重复例', rationale: '两条同标准条目应命中', expectedOutcome: 'MATCH', expectedOrderIds: ['A', 'B'], input: { age: null, ageUnit: null, date: null, medications: ['A', 'B'].map(orderId => ({ orderId, catalogId: 'C', catalogVersion: 'V1', contentHash: 'hash', entryId: 'E1', specificationId: 'S1', routeCode: null, status: 'ACTIVE' })) } }] } }
const run: KnowledgeTestRun = { id: '90', candidateId: '20', programHash: 'program-hash', knowledgeHash: 'knowledge-hash', engineVersion: 'v1', suite: detail.suite, suiteHash: 'suite-hash', actorId: '9', actor: '执行人', createdAt: '2026-09-21T00:00:00Z', reason: '核对历史', allPassed: false, missingOutcomeKinds: ['NO_MATCH', 'UNAVAILABLE'], results: [{ index: 0, passed: false, actual: { outcome: 'MATCH', matchedOrderIds: ['A'], reasons: ['测试用的错误实际明细'] } }] }
function mount(empty = false, unavailable = false, selectedCandidate = candidate) {
  const api = { examples: vi.fn().mockResolvedValue([{ id: 'duplicate', purpose: '核对重复开立', notes: ['验收样例'], sourceUrl: 'https://example.com/source', sourceMaterial: '合成材料', body: candidate.knowledge.body,
    assessment: candidate.knowledge.assessment, medicationLabels: {}, manualCases: detail.suite.cases,
    results: [{ name: '预定义正例', input: { age: null, ageUnit: null, date: '2026-09-21', medications: [] }, expected: 'MATCH', actual: { outcome: 'MATCH', reasons: [], matchedOrderIds: [] }, passed: true }] }]), testSuites: vi.fn().mockResolvedValue({ content: empty ? [] : [{ version: 1, caseCount: 1, actor: '样例作者', createdAt: detail.suite.createdAt, reason: '人工定义预期' }], totalElements: empty ? 0 : 1, totalPages: 1, page: 0, size: 20 }), testSuite: vi.fn().mockResolvedValue(detail), saveTestSuite: vi.fn().mockImplementation((_id, input) => Promise.resolve({ ...detail, suite: { ...detail.suite, version: input.expectedVersion + 1, cases: input.cases, reason: input.reason } })), testRuns: vi.fn().mockResolvedValue({ content: empty ? [] : [{ id: '90', suiteVersion: 1, caseCount: 1, passedCount: 0, actor: '执行人', createdAt: run.createdAt }], totalElements: empty ? 0 : 1, totalPages: 1, page: 0, size: 20 }), testRun: vi.fn().mockResolvedValue(run), executeTests: vi.fn().mockResolvedValue(run) }
  if (unavailable) api.testSuites.mockRejectedValueOnce(new Error('样例目录不可用'))
  const close = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgeTestDialog api={{ medicationKnowledgeDrafts: api } as unknown as RhnApi} candidate={selectedCandidate} onClose={close} /></QueryClientProvider>)
  return { api, close }
}
it('starts empty, requires manual expectations, saves without execution and explicitly runs the saved hash', async () => {
  const { api } = mount(true)
  await waitFor(() => expect(screen.getByRole('button', { name: '新建样例版本' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: '新建样例版本' }))
  expect(screen.getByLabelText('样例名称')).toHaveValue('')
  expect(screen.getByRole('combobox', { name: '预期结果' })).toHaveTextContent('由验证人明确选择')
  await userEvent.type(screen.getByLabelText('样例名称'), '空处方反例')
  await userEvent.type(screen.getByLabelText('预期依据与测试意图'), '没有医嘱不满足重复条数')
  await userEvent.click(screen.getByRole('combobox', { name: '预期结果' }))
  await userEvent.click(screen.getByRole('option', { name: '未命中' }))
  await userEvent.type(screen.getByLabelText('样例保存原因'), '建立独立反例')
  await userEvent.click(screen.getByRole('button', { name: '保存样例新版本' }))
  await waitFor(() => expect(api.saveTestSuite).toHaveBeenCalledWith('20', expect.objectContaining({ expectedVersion: 0, programHash: 'program-hash', cases: [expect.objectContaining({ title: '空处方反例', expectedOutcome: 'NO_MATCH', expectedOrderIds: [] })] })))
  expect(api.executeTests).not.toHaveBeenCalled()
  await userEvent.type(screen.getByLabelText('验证执行原因'), '运行固定样例')
  await userEvent.click(screen.getByRole('button', { name: '运行已保存样例' }))
  await waitFor(() => expect(api.executeTests).toHaveBeenCalledWith('20', 1, 'suite-hash', '运行固定样例'))
})
it('shows exact expected and actual orders for historical failures without re-executing them', async () => {
  const { api } = mount()
  await userEvent.click(await screen.findByRole('button', { name: /样例 v1 · 0\/1 通过/ }))
  expect(await screen.findByText('预期医嘱：A、B')).toBeInTheDocument()
  expect(screen.getByText('实际医嘱：A')).toBeInTheDocument()
  expect(screen.getByText('本例与预期不符')).toBeInTheDocument()
  expect(screen.getByText(/尚未定义这些预期结果：未命中、不可评价/)).toBeInTheDocument()
  expect(api.executeTests).not.toHaveBeenCalled()
  expect(screen.getByLabelText('样例名称')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '编辑为下一版本' }))
  expect(screen.queryByText('实际医嘱：A')).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'B' })).toBeChecked()
})
it('pins edits to the prior suite version and preserves input on stale-save errors', async () => {
  const { api } = mount()
  await userEvent.click(await screen.findByRole('button', { name: /样例 v1 · 1 项/ }))
  await userEvent.click(screen.getByRole('button', { name: '编辑为下一版本' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'B' }))
  await userEvent.type(screen.getByLabelText('样例保存原因'), '人工调整预期')
  api.saveTestSuite.mockRejectedValueOnce(new Error('样例已被修改，请刷新'))
  await userEvent.click(screen.getByRole('button', { name: '保存样例新版本' }))
  expect(await screen.findByText('样例已被修改，请刷新')).toBeInTheDocument()
  expect(api.saveTestSuite).toHaveBeenCalledWith('20', expect.objectContaining({ expectedVersion: 1, cases: [expect.objectContaining({ expectedOrderIds: ['A'] })] }))
  expect(screen.getByRole('checkbox', { name: 'B' })).not.toBeChecked()
  expect(screen.queryByRole('button', { name: '运行已保存样例' })).not.toBeInTheDocument()
})
it('asks before discarding unsaved samples and returns to the same edits', async () => {
  const { close } = mount()
  await userEvent.click(await screen.findByRole('button', { name: /样例 v1 · 1 项/ }))
  await userEvent.click(screen.getByRole('button', { name: '编辑为下一版本' }))
  await userEvent.type(screen.getByLabelText('样例名称'), '未保存')
  await userEvent.click(screen.getByRole('button', { name: '关闭弹窗' }))
  const dialog = await screen.findByRole('dialog', { name: '处理未保存样例' })
  expect(close).not.toHaveBeenCalled()
  await userEvent.click(within(dialog).getByRole('button', { name: '返回编辑' }))
  expect(screen.getByLabelText('样例名称')).toHaveValue('手写重复例未保存')
})
it('read failures clear previous results', async () => {
  const { api } = mount()
  const button = await screen.findByRole('button', { name: /样例 v1 · 0\/1 通过/ })
  await userEvent.click(button)
  await screen.findByText('本例与预期不符')
  api.testRun.mockRejectedValueOnce(new Error('记录读取失败'))
  await userEvent.click(button)
  expect(await screen.findByText('记录读取失败')).toBeInTheDocument()
  expect(screen.queryByText('本例与预期不符')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('样例名称')).not.toBeInTheDocument()
})

it('a failed version list cannot be treated as an empty new suite and can be explicitly refreshed', async () => {
  mount(false, true)
  await screen.findByText('样例目录不可用')
  expect(screen.getByRole('button', { name: '新建样例版本' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '刷新版本与记录' }))
  await screen.findByRole('button', { name: /样例 v1 · 1 项/ })
  expect(screen.getByRole('button', { name: '新建样例版本' })).toBeEnabled()
})

it('keeps a selected standard identity and its display name together in the saved fixture', async () => {
  const reference = { catalogId: 'C2', catalogVersion: 'V2', contentHash: 'h2', sourceHash: 'source', entryId: 'E2', specificationId: 'S2', name: '合成标准药甲', doseForm: 'TABLET', preparationSpec: '合成规格' }
  const { api } = mount(false, false, { ...candidate, program: { ...candidate.program, groupA: { ...candidate.program.groupA, targets: [{ level: 'SPECIFICATION', reference }] } } })
  await userEvent.click(await screen.findByRole('button', { name: /样例 v1 · 1 项/ }))
  await userEvent.click(screen.getByRole('button', { name: '编辑为下一版本' }))
  await userEvent.click(screen.getByRole('combobox', { name: '医嘱 1 使用候选范围药品' }))
  await userEvent.click(screen.getByRole('option', { name: '合成标准药甲 · 合成规格' }))
  await userEvent.type(screen.getByLabelText('样例保存原因'), '改用指定标准范围')
  await userEvent.click(screen.getByRole('button', { name: '保存样例新版本' }))
  await waitFor(() => expect(api.saveTestSuite).toHaveBeenCalledWith('20', expect.objectContaining({ cases: [expect.objectContaining({ medicationLabels: { S2: '合成标准药甲 · 合成规格' }, input: expect.objectContaining({ medications: [expect.objectContaining({ orderId: 'A', entryId: 'E2', specificationId: 'S2', catalogVersion: 'V2' }), expect.objectContaining({ orderId: 'B', entryId: 'E1' })] }) })] })))
})

it('loads example cases into the editor without silently saving or executing them', async () => {
  const { api } = mount(true)
  await waitFor(() => expect(screen.getByRole('button', { name: '新建样例版本' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: '新建样例版本' }))
  await userEvent.click(screen.getByRole('button', { name: '载入验收样例' }))
  await userEvent.click(await screen.findByRole('button', { name: '填入未保存验证样例' }))
  await userEvent.click(screen.getByRole('button', { name: '放弃修改并继续' }))
  expect(screen.getByLabelText('样例名称')).toHaveValue('手写重复例')
  expect(api.saveTestSuite).not.toHaveBeenCalled()
  expect(api.executeTests).not.toHaveBeenCalled()
  await userEvent.type(screen.getByLabelText('样例保存原因'), '已核对验收样例与候选范围')
  await userEvent.click(screen.getByRole('button', { name: '保存样例新版本' }))
  await waitFor(() => expect(api.saveTestSuite).toHaveBeenCalledWith('20', expect.objectContaining({ cases: detail.suite.cases })))
})
