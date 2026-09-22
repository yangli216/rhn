import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeExtractionRun } from '../../shared/api/medicationKnowledgeDraftApi'
import { MedicationKnowledgeExtractionDialog } from './MedicationKnowledgeExtractionDialog'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'

const source = { ...emptyKnowledge().evidence, title: '合成原文', excerpt: '合成相互作用：测试甲与测试乙，需结合肾功能。' }
const body = { ...emptyKnowledge('DRUG_INTERACTION'), title: '合成配对', evidence: source, conditions: { ...emptyKnowledge('DRUG_INTERACTION').conditions, additionalConditions: '需结合肾功能' } }
const run: KnowledgeExtractionRun = { id: '900', input: { evidence: source, requirement: '' }, sourceTextHash: 'b'.repeat(64), model: 'test-model', promptVersion: 'V1', actor: '作者', createdAt: '2026-09-21T00:00:00Z', rawOutput: '{"synthetic":true}', result: { adoptable: true, suggestedBody: body, citations: [{ field: 'kind', value: 'DRUG_INTERACTION', quote: '合成相互作用', start: 0, end: 6 }], medications: [{ mention: { group: 'A', name: '测试甲', level: 'ENTRY', specificationText: '', quote: '测试甲' }, start: 7, end: 10, candidates: [{ catalogId: 'C', catalogVersion: 'V1', contentHash: 'h', sourceHash: 's', entryId: 'E1', specificationId: 'S1', name: '测试甲', doseForm: 'TABLET', preparationSpec: '合成规格一' }, { catalogId: 'C', catalogVersion: 'V1', contentHash: 'h', sourceHash: 's', entryId: 'E2', specificationId: 'S2', name: '测试甲', doseForm: 'CAPSULE', preparationSpec: '合成规格二' }] }, { mention: { group: 'B', name: '测试乙', level: 'CLASS', specificationText: '', quote: '测试乙' }, start: 11, end: 14, candidates: [] }], questions: ['需核对标准范围'], assessment: null } }
function mount(result = run, runId?: string) {
  const api = { medicationKnowledgeDrafts: { extractionStatus: vi.fn().mockResolvedValue({ available: true, model: 'test-model' }), extractions: vi.fn().mockResolvedValue([]), extraction: vi.fn().mockResolvedValue(result), extract: vi.fn().mockResolvedValue(result) } }
  const onAdopt = vi.fn(), onClose = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationKnowledgeExtractionDialog api={api as unknown as RhnApi} evidence={source} runId={runId} onAdopt={onAdopt} onClose={onClose} /></QueryClientProvider>)
  return { api, onAdopt }
}
async function extract() { await waitFor(() => expect(screen.getByRole('button', { name: 'AI 提取知识' })).toBeEnabled()); await userEvent.click(screen.getByRole('button', { name: 'AI 提取知识' })); await screen.findByText('合成配对') }
it('does not call AI until requested, never selects the first standard, and preserves unresolved groups on adoption', async () => {
  const { api, onAdopt } = mount()
  expect(api.medicationKnowledgeDrafts.extract).not.toHaveBeenCalled()
  await extract()
  expect(api.medicationKnowledgeDrafts.extract).toHaveBeenCalledWith({ evidence: source, requirement: '' })
  expect(screen.getByRole('button', { name: '填入未保存草稿' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: '填入未保存草稿' }))
  expect(onAdopt).toHaveBeenCalledWith(expect.objectContaining({ groupA: [], groupB: [], conditions: expect.objectContaining({ additionalConditions: expect.stringContaining('A 组：测试甲') }) }), '900', {})
})
it('requires renewed review after a standard choice and retains unsupported group and conditions', async () => {
  const { onAdopt } = mount(); await extract()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('combobox', { name: '确认 A 组 测试甲 标准范围 1' }))
  await userEvent.click(await screen.findByRole('option', { name: /合成规格二/ }))
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await userEvent.click(screen.getByRole('checkbox')); await userEvent.click(screen.getByRole('button', { name: '填入未保存草稿' }))
  expect(onAdopt).toHaveBeenCalledWith(expect.objectContaining({ groupA: [expect.objectContaining({ specificationId: 'S2', catalogId: 'C', level: 'ENTRY' })], groupB: [], conditions: expect.objectContaining({ additionalConditions: expect.stringContaining('B 组：测试乙') }) }), '900', { S2: '测试甲 · 合成规格二' })
  expect(onAdopt.mock.calls[0][0].conditions.additionalConditions).toContain('需结合肾功能')
})
it('editing the input clears stale output and acknowledgement', async () => {
  mount(); await extract(); await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.type(screen.getByRole('textbox', { name: '供 AI 提取的原文' }), '新条件')
  expect(screen.queryByText('合成配对')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: '填入未保存草稿' })).not.toBeInTheDocument()
})
it('unsupported output cannot be adopted and historical audit is read only', async () => {
  mount({ ...run, result: { ...run.result, adoptable: false, suggestedBody: null } }, '900')
  expect(await screen.findByText('未形成草稿')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '供 AI 提取的原文' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '填入未保存草稿' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'AI 提取知识' })).not.toBeInTheDocument()
})
