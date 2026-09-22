import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeReplayRun, KnowledgeVersion } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgeReplayDialog } from './MedicationKnowledgeReplayDialog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'
const knowledge: KnowledgeVersion = { id: '10', version: 2, status: 'DRAFT', body: { ...emptyKnowledge(), title: '合成重复草稿' }, assessment: { structureComplete: true, issues: [], ruleDescription: '合成逻辑', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }, actor: '作者', savedAt: '2026-09-21T00:00:00Z', changeReason: '测试' }
const source = { evaluationId: '100', prescriptionId: '200', encounterId: '300', prescriptionRevision: 3, organizationId: '400', departmentId: '500', evaluatedAt: '2026-01-10T00:00:00Z', inputHash: 'original-input-hash', originalMode: 'SHADOW' }
const run: KnowledgeReplayRun = { id: '900', engineVersion: 'v1', knowledge, knowledgeHash: 'knowledge-hash', source, input: { facts: { age: 33, ageUnit: 'YEAR', date: '2026-01-10' }, dateBasis: '原评价冻结日期 · Asia/Shanghai', gaps: [], items: [{ orderId: '1', revision: 1, originalStatus: 'DRAFT', medicationName: '冻结测试药品', semanticVersion: 'medication-hash', fact: { catalogId: 'C', catalogVersion: '旧版', contentHash: 'old-hash', entryId: 'E', specificationId: 'S', routeCode: 'PO' }, route: { conceptId: 'R1', code: 'PO', system: 'R', version: '1' }, gaps: [] }] }, inputHash: 'adapted-input-hash', result: { outcome: 'MATCH', reasons: ['合成草稿逻辑命中'], matchedOrderIds: ['1'] }, currentKnowledgeIssues: [], actor: '回放人', createdAt: '2026-09-21T00:00:00Z' }
const sourcesPage = { content: [source, { ...source, evaluationId: '101', prescriptionId: '201' }], totalElements: 21, totalPages: 2, page: 0, size: 20 }
function mount(sourceResult: unknown = sourcesPage) {
  const api = { replaySources: sourceResult instanceof Error ? vi.fn().mockRejectedValue(sourceResult) : vi.fn().mockResolvedValue(sourceResult),
    replay: vi.fn().mockResolvedValue(run), replays: vi.fn().mockResolvedValue({ content: [{ id: '899', knowledgeVersion: 1, evaluationId: '99', prescriptionId: '199', outcome: 'UNAVAILABLE', actor: '旧回放人', createdAt: '2026-01-01T00:00:00Z' }], totalElements: 1, totalPages: 1, page: 0, size: 20 }), replayDetail: vi.fn().mockResolvedValue({ ...run, id: '899', knowledge: { ...knowledge, version: 1 }, result: { outcome: 'UNAVAILABLE', reasons: ['原评价日期缺失'], matchedOrderIds: [] }, currentKnowledgeIssues: [{ field: 'route', code: 'STALE_ROUTE', message: '途径版次已变化' }] }) }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgeReplayDialog api={{ medicationKnowledgeDrafts: api } as unknown as RhnApi} knowledge={knowledge} onClose={vi.fn()} /></QueryClientProvider>)
  return api
}
it('requires explicit selection and replay, pins the saved knowledge version and displays frozen facts', async () => {
  const api = mount()
  expect(screen.getByRole('button', { name: '执行并保存回放' })).toBeDisabled()
  await userEvent.click(await screen.findByRole('button', { name: /处方 200/ }))
  expect(api.replay).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '执行并保存回放' }))
  await waitFor(() => expect(api.replay).toHaveBeenCalledWith('10', 2, '100'))
  expect(await screen.findByText('冻结测试药品')).toBeInTheDocument()
  expect(screen.getByText('参与命中')).toBeInTheDocument()
  expect(screen.getByText(/年龄：33 岁；评价日期：2026-01-10/)).toBeInTheDocument()
  expect(screen.getByText(/不计入正式规则的旁路观察/)).toBeInTheDocument()
  await userEvent.click(screen.getByText('知识依据与回放指纹'))
  expect(screen.getByText('原评价输入指纹：original-input-hash')).toBeVisible()
})
it('clears previous output on source changes and errors rather than keeping stale matches', async () => {
  const api = mount()
  await userEvent.click(await screen.findByRole('button', { name: /处方 200/ }))
  await userEvent.click(screen.getByRole('button', { name: '执行并保存回放' }))
  await screen.findByText('冻结测试药品')
  await userEvent.click(screen.getByRole('button', { name: /处方 201/ }))
  expect(screen.queryByText('冻结测试药品')).not.toBeInTheDocument()
  api.replay.mockRejectedValueOnce(new Error('知识版本已变化'))
  await userEvent.click(screen.getByRole('button', { name: '执行并保存回放' }))
  expect(await screen.findByText('知识版本已变化')).toBeInTheDocument()
  expect(screen.queryByText('参与命中')).not.toBeInTheDocument()
})
it('opens historical replay read-only and distinguishes saved version from current dependencies', async () => {
  const api = mount()
  await userEvent.click(await screen.findByRole('button', { name: /知识第 1 版 · 不可评价/ }))
  expect(await screen.findByText('原评价日期缺失')).toBeInTheDocument()
  expect(screen.getByText(/知识第 1 版 · 回放 899/)).toBeInTheDocument()
  expect(screen.getByText(/途径版次已变化/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '执行并保存回放' })).toBeDisabled()
  expect(api.replay).not.toHaveBeenCalled()
  expect(api.replayDetail).toHaveBeenCalledWith('10', '899')
})
it('source paging clears selection and a read failure is not shown as an empty successful list', async () => {
  const api = mount()
  await userEvent.click(await screen.findByRole('button', { name: /处方 200/ }))
  await userEvent.click(within(screen.getByRole('navigation', { name: '原审查记录分页' })).getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(api.replaySources).toHaveBeenLastCalledWith(1))
  expect(screen.getByRole('button', { name: '执行并保存回放' })).toBeDisabled()
  api.replaySources.mockRejectedValueOnce(new Error('当前工作范围不可用'))
  await userEvent.click(screen.getByRole('button', { name: '刷新原记录' }))
  expect(await screen.findByText('当前工作范围不可用')).toBeInTheDocument()
  expect(screen.queryByText(/当前范围暂无原审查快照/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /处方 200/ })).not.toBeInTheDocument()
})
