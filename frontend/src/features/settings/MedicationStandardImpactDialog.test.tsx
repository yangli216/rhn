import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi, StandardMedicationDetail } from '../../shared/rhnApi'
import { MedicationStandardImpactDialog } from './MedicationStandardImpactDialog'

const report = { scope: { catalogId: 'C', entryId: 'E' }, inspectedAt: '2026-09-21T00:00:00Z', totals: { MEDICATION: 45, PRODUCT: 10, KNOWLEDGE: 55, RULE_VERSION: 7, DEPLOYMENT: 2 }, historicalCount: 54, potentialCount: 7,
  coverage: ['包括停用药品与旧知识版本'], limitations: ['未扫描历史处方，不能判断变更无风险'], content: [{ kind: 'KNOWLEDGE', id: '1', parentId: null, name: '合成知识', version: '1', status: 'DRAFT', historical: true, matchType: 'REFERENCED', traces: [{ relation: 'FROZEN_REFERENCE', location: 'A 组 · 整个标准条目', catalogId: 'C', catalogVersion: '旧目录版', entryId: 'E', specificationId: 'S', contentHash: 'old-content-hash', reason: '保存时的标准范围' }], mode: null, organizationId: null, departmentId: null, effectiveFrom: null, effectiveTo: null }], totalElements: 55, totalPages: 3, page: 0, size: 20 }
function mount(response: unknown = report) {
  const inspect = vi.fn().mockResolvedValue(response)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MedicationStandardImpactDialog api={{ medicationStandardImpact: { inspect } } as unknown as RhnApi} catalogId="C" entry={{ id: 'E', name: '合成标准药品', specifications: [{ id: 'S', doseFormName: '片剂', specification: '测试规格' }] } as StandardMedicationDetail} onClose={vi.fn()} /></QueryClientProvider>)
  return inspect
}
it('defaults to all versions of the selected entry and exposes frozen identity plus coverage limits', async () => {
  const inspect = mount()
  expect(await screen.findByText('合成知识')).toBeInTheDocument()
  expect(inspect).toHaveBeenCalledWith({ catalogId: 'C', entryId: 'E' }, 'ALL', true, 0)
  expect(screen.getByRole('checkbox')).toBeChecked()
  expect(screen.getByText('未扫描历史处方，不能判断变更无风险')).toBeInTheDocument()
  await userEvent.click(screen.getByText('A 组 · 整个标准条目'))
  expect(screen.getByText('目录：C · 旧目录版')).toBeVisible()
  expect(screen.getByText('内容指纹：old-content-hash')).toBeVisible()
})
it('keeps full-scope totals while filtering history and resets paging when changing scope', async () => {
  const inspect = mount()
  await screen.findByText('合成知识')
  await userEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(inspect).toHaveBeenLastCalledWith({ catalogId: 'C', entryId: 'E' }, 'ALL', false, 0))
  expect(screen.getByText('45')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(inspect).toHaveBeenLastCalledWith({ catalogId: 'C', entryId: 'E' }, 'ALL', false, 1))
  await userEvent.click(screen.getByRole('combobox', { name: '标准影响范围' }))
  await userEvent.click(screen.getByRole('option', { name: '合成标准药品 · 片剂 · 测试规格' }))
  await waitFor(() => expect(inspect).toHaveBeenLastCalledWith({ catalogId: 'C', entryId: 'E', specificationId: 'S' }, 'ALL', false, 0))
})
it('empty matches remain an explicitly limited inventory result', async () => {
  mount({ ...report, content: [], totalElements: 0, totalPages: 0 })
  expect(await screen.findByText(/不能据此判断变更无影响/)).toBeInTheDocument()
  expect(screen.getByText('未扫描历史处方，不能判断变更无风险')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /迁移|生效|停用/ })).not.toBeInTheDocument()
})
