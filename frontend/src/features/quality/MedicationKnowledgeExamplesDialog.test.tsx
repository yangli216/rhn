import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { KnowledgeExample } from '../../shared/api/medicationKnowledgeDraftApi'
import { emptyKnowledge } from './MedicationKnowledgeDrafts'
import { MedicationKnowledgeExamplesDialog } from './MedicationKnowledgeExamplesDialog'

const example: KnowledgeExample = {
  id: 'duplicate', purpose: '核对重复开立', notes: ['两条是验收策略，不是医学阈值'],
  sourceUrl: 'https://www.nhc.gov.cn/example', sourceMaterial: '合成测试材料',
  body: { ...emptyKnowledge(), title: '测试重复用药样例' },
  assessment: { structureComplete: true, issues: [], ruleDescription: '测试范围', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] },
  medicationLabels: {}, manualCases: [],
  results: [{ name: '反例：一条医嘱', input: { age: 30, ageUnit: 'YEAR', date: '2026-09-21', medications: [] },
    expected: 'NO_MATCH', actual: { outcome: 'NO_MATCH', reasons: [], matchedOrderIds: [] }, passed: true }],
}
function mount(values = [example], error?: Error) {
  const examples = error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(values)
  const adopt = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MedicationKnowledgeExamplesDialog api={{ medicationKnowledgeDrafts: { examples } } as unknown as RhnApi}
    onClose={vi.fn()} onAdopt={adopt} /></QueryClientProvider>)
  return adopt
}
it('shows source and expected results and loads only when explicitly selected', async () => {
  const adopt = mount()
  expect(await screen.findByText('两条是验收策略，不是医学阈值')).toBeVisible()
  expect(screen.getByRole('link', { name: '查看公开原始依据' })).toHaveAttribute('href', example.sourceUrl)
  expect(screen.getByText('反例：一条医嘱')).toBeVisible()
  expect(adopt).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '填入未保存知识草稿' }))
  expect(adopt).toHaveBeenCalledWith(example)
})
it('does not allow a failed verification result to populate a draft', async () => {
  const adopt = mount([{ ...example, results: [{ ...example.results[0], passed: false }] }])
  expect(await screen.findByRole('button', { name: '填入未保存知识草稿' })).toBeDisabled()
  expect(adopt).not.toHaveBeenCalled()
})
it('does not show actionable samples when loading current standards fails', async () => {
  mount([], new Error('当前标准身份不一致'))
  expect(await screen.findByText('当前标准身份不一致')).toBeVisible()
  expect(screen.queryByRole('button', { name: '填入未保存知识草稿' })).not.toBeInTheDocument()
})
it('changes the displayed evidence and selected payload together', async () => {
  const interaction = { ...example, id: 'interaction', purpose: '核对相互作用', body: {
    ...example.body, kind: 'DRUG_INTERACTION', title: '测试相互作用样例',
  } }
  const adopt = mount([example, interaction])
  await userEvent.click(await screen.findByRole('button', { name: '核对相互作用' }))
  expect(screen.getByText('测试相互作用样例')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: '填入未保存知识草稿' }))
  await waitFor(() => expect(adopt).toHaveBeenCalledWith(interaction))
})
