import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { ClinicalSemanticImpactDialog } from './ClinicalSemanticImpactDialog'

const scope = { kind: 'FREQUENCY' as const, conceptId: '123', name: '合成频次' }
const report = { scope: { ...scope, code: 'BID', system: 'RHN.CLINICAL.FREQUENCY', version: '2', status: 'ACTIVE' }, inspectedAt: '2026-09-21T00:00:00Z', organizationId: '8', departmentId: '9', totals: { MEDICATION: 45, PRODUCT: 10, FREQUENCY_CONFIGURATION: 2, SEMANTIC_VERSION: 55, KNOWLEDGE: 3, RULE_VERSION: 7, DEPLOYMENT: 4 }, historicalCount: 54, potentialCount: 7,
  coverage: [{ area: 'ACTIVE_ORDERS', coverage: 'CURRENT_SCOPE', activeCount: '2', references: [], ruleRetestRequired: true, note: '仅当前工作范围' }, { area: 'ORDER_TEMPLATES', coverage: 'UNAVAILABLE', activeCount: null, references: [], ruleRetestRequired: true, note: '模板引用未知' }], limitations: ['不重写历史处方'], content: [{ kind: 'SEMANTIC_VERSION', id: '1', parentId: '123', name: '合成历史引用', version: 'frozen-hash', status: 'FROZEN', historical: true, relation: 'FROZEN_REFERENCE', references: [{ location: '冻结的频次定义', conceptId: '123', code: 'OLD', system: 'OLD.FREQ', version: '1', fingerprint: 'frozen-hash', note: '不能根据当前定义改写历史' }] }], totalElements: 55, totalPages: 3, page: 0, size: 20 }
function mount(response: unknown = report) {
  const references = vi.fn().mockResolvedValue(response)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><ClinicalSemanticImpactDialog api={{ clinicalSemanticImpact: { references } } as unknown as RhnApi} scope={scope} onClose={vi.fn()} /></QueryClientProvider>)
  return references
}
it('shows frozen identity, scoped order counts and unknown coverage without calling unknown zero', async () => {
  const references = mount()
  await screen.findByText('合成历史引用')
  expect(references).toHaveBeenCalledWith(scope, 'ALL', true, 0)
  expect(screen.getByRole('checkbox')).toBeChecked()
  expect(screen.getByText(/当前范围草稿／有效医嘱：2/)).toBeInTheDocument()
  expect(screen.getByText(/机构 8 \/ 科室 9/)).toBeInTheDocument()
  expect(screen.getByText('模板引用未知')).toBeInTheDocument()
  expect(screen.getByText(/存在未覆盖或未完成的来源/)).toBeInTheDocument()
  await userEvent.click(screen.getByText('冻结的频次定义'))
  expect(screen.getByText('来源：OLD.FREQ · 1')).toBeVisible()
  expect(screen.getByText('冻结指纹：frozen-hash')).toBeVisible()
  expect(screen.queryByRole('button', { name: /迁移|生效|停用/ })).not.toBeInTheDocument()
})
it('keeps totals across filters and resets paging when changing object type or history', async () => {
  const references = mount()
  await screen.findByText('合成历史引用')
  await userEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(references).toHaveBeenLastCalledWith(scope, 'ALL', true, 1))
  await userEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(references).toHaveBeenLastCalledWith(scope, 'ALL', false, 0))
  expect(screen.getByText('45')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('combobox', { name: '用法影响对象类型' }))
  await userEvent.click(screen.getByRole('option', { name: '知识版本' }))
  await waitFor(() => expect(references).toHaveBeenLastCalledWith(scope, 'KNOWLEDGE', false, 0))
})
it('does not present no matches or missing definitions as no impact', async () => {
  mount({ ...report, scope: { ...report.scope, status: 'MISSING' }, content: [], totalElements: 0, totalPages: 0 })
  expect(await screen.findByText(/当前筛选没有已识别的明细，不等于没有依赖/)).toBeInTheDocument()
  expect(screen.getByText(/当前标准定义不可见或已缺失/)).toBeInTheDocument()
  expect(screen.getByText('不重写历史处方')).toBeInTheDocument()
})
it('hides previous success after refresh failure so stale counts cannot appear as a new inventory', async () => {
  const references = mount()
  await screen.findByText('合成历史引用')
  references.mockRejectedValueOnce(new Error('盘点读取失败'))
  await userEvent.click(screen.getByRole('button', { name: '重新盘点' }))
  expect(await screen.findByText(/当前未能完成盘点，不能判断没有影响/)).toBeInTheDocument()
  expect(screen.queryByText('合成历史引用')).not.toBeInTheDocument()
  expect(screen.queryByText('45')).not.toBeInTheDocument()
})
