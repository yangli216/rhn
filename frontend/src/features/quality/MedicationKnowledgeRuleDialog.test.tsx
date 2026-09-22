import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeRuleCandidate, KnowledgeRulePreview, KnowledgeVersion } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgeRuleDialog } from './MedicationKnowledgeRuleDialog'
import { MedicationRuleCatalog } from './MedicationRuleCatalog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'

const knowledge: KnowledgeVersion = { id: '10', version: 2, status: 'DRAFT', body: { ...emptyKnowledge(), title: '合成重复知识', evidence: { ...emptyKnowledge().evidence, excerpt: '测试原文，非临床依据' } }, assessment: { structureComplete: true, issues: [], ruleDescription: '合成逻辑', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }, actor: '作者', savedAt: '2026-09-21T00:00:00Z', changeReason: '测试' }
const preview: KnowledgeRulePreview = { ready: true, knowledge, knowledgeHash: 'knowledge-hash', programHash: 'program-hash', issues: [], cases: [], program: { schemaVersion: 'v1', operator: 'SAME_STANDARD_ENTRY', exposureScope: 'SAME_PRESCRIPTION', groupA: { targets: [], routeMode: 'ALL', routes: [] }, groupB: { targets: [], routeMode: 'ALL', routes: [] }, minimumOrders: 2, age: { mode: 'ALL', unit: null, minimumInclusive: null, maximumExclusive: null }, effectiveFrom: null, effectiveTo: null, proposedAction: 'WARN', requiredFacts: ['冻结标准身份'] } }
const candidate: KnowledgeRuleCandidate = { ...preview, program: preview.program!, programHash: preview.programHash!, id: '20', knowledgeId: '10', version: 1, actorId: '7', actor: '候选作者', createdAt: '2026-09-21T00:00:00Z', reason: '合成验证' }
function mount(result: KnowledgeRulePreview | Error = preview) {
  const api = { previewRuleCandidate: result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result), createRuleCandidate: vi.fn().mockResolvedValue(candidate) }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgeRuleDialog api={{ medicationKnowledgeDrafts: api } as unknown as RhnApi} knowledge={knowledge} onClose={vi.fn()} /></QueryClientProvider>)
  return api
}
it('previews universal scope and creates only with reason, pinned source version and expression hash', async () => {
  const api = mount()
  await screen.findByText(/运行时依据冻结标准身份分组/)
  expect(api.createRuleCandidate).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '生成并纳入规则目录' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('候选生成原因'), '核对原文')
  await userEvent.click(screen.getByRole('button', { name: '生成并纳入规则目录' }))
  await waitFor(() => expect(api.createRuleCandidate).toHaveBeenCalledWith('10', 2, 'program-hash', '核对原文'))
  expect(await screen.findByText(/规则候选 v1 已纳入统一规则目录/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '生成并纳入规则目录' })).not.toBeInTheDocument()
  expect(screen.getByText('测试原文，非临床依据')).toBeInTheDocument()
})
it('blocks generation when current dependencies have gaps', async () => {
  const api = mount({ ...preview, ready: false, program: null, programHash: null, issues: [{ field: 'route', code: 'STALE_ROUTE', message: '途径版次已变化' }] })
  await screen.findByText(/当前不能生成：途径版次已变化/)
  await userEvent.type(screen.getByLabelText('候选生成原因'), '不能忽略缺口')
  expect(screen.getByRole('button', { name: '生成并纳入规则目录' })).toBeDisabled()
  expect(api.createRuleCandidate).not.toHaveBeenCalled()
})
it('refreshes failed stale creation and hides stale expression after refresh failure', async () => {
  const api = mount()
  await screen.findByText(/运行时依据冻结标准身份分组/)
  api.createRuleCandidate.mockRejectedValueOnce(new Error('知识版本已变化'))
  api.previewRuleCandidate.mockRejectedValueOnce(new Error('请重新打开最新知识版本'))
  await userEvent.type(screen.getByLabelText('候选生成原因'), '合成验证')
  await userEvent.click(screen.getByRole('button', { name: '生成并纳入规则目录' }))
  await screen.findByText('请重新打开最新知识版本')
  expect(screen.queryByText(/运行时依据冻结标准身份分组/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '生成并纳入规则目录' })).toBeDisabled()
})
it('unified catalog shows frozen knowledge and retirement but hides unimplemented publication actions', async () => {
  const api = { catalog: vi.fn().mockResolvedValue({ organizationId: '1', departmentId: '2', rules: [{ key: 'KNOWLEDGE:10', code: 'QMED.KNOWLEDGE.10', name: '合成重复知识', origin: 'KNOWLEDGE', revision: 0, versions: [{ id: '20', version: 1, name: '合成重复知识', reviewStatus: 'DRAFT', testsPassed: true, origin: 'KNOWLEDGE', candidate: null, builtin: null, review: null, knowledgeCandidate: candidate }], deployments: [], history: [] }] }), catalogRuns: vi.fn().mockResolvedValue([]) }
  render(<MedicationRuleCatalog api={{ medicationWorkbench: api } as unknown as RhnApi} onOpenCandidate={vi.fn()} onBuiltinTrial={vi.fn()} />)
  await screen.findByText('结构样例通过 · 人工验证另查')
  expect(screen.getByText('测试原文，非临床依据')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '提交审核' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '发布版本' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /废止/ })).toBeInTheDocument()
})
