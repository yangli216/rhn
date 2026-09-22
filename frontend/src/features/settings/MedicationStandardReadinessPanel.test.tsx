import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationStandardReadinessPanel } from './MedicationStandardReadinessPanel'

const data = { inspectedAt: '2026-09-21T00:00:00Z', summary: { totalActive: 90,
  referenceStatuses: {LINKED: 2, UNMAPPED: 88, AMBIGUOUS: 0, STALE: 0, MISMATCH: 0}, sourceUnverified: 2, conversionUnavailable: 1 },
  content: [{medicationId: '1', code: 'LOCAL-1', name: '示例药品', preparationSpec: '0.25g',
    standardReference: {status: 'LINKED', sourceVerificationStatus: 'UNVERIFIED', specificationId: 'STD-1', catalogVersion: 'v1', issues: []},
    presentationConversionStatus: 'COMPUTABLE', conversionReasons: []}], totalElements: 90, totalPages: 5 }

function mount(fn = vi.fn().mockResolvedValue(data), onOpenCatalog = vi.fn()) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}})
  render(<QueryClientProvider client={client}><MedicationStandardReadinessPanel
    api={{masterData: {medicationStandardReadiness: fn}} as unknown as RhnApi} onOpenCatalog={onOpenCatalog} /></QueryClientProvider>)
  return { fn, onOpenCatalog }
}

it('keeps source verification separate from linked and computable, and exposes the remediation entry', async () => {
  const { onOpenCatalog } = mount()
  const row = (await screen.findByText('示例药品')).closest('tr')!
  expect(within(row).getByText('关联一致')).toBeInTheDocument()
  expect(within(row).getByText('待核验')).toBeInTheDocument()
  expect(within(row).getByText('可换算')).toBeInTheDocument()
  expect(screen.getByText(/不构成用药安全评分/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', {name: '前往标准参考目录'}))
  expect(onOpenCatalog).toHaveBeenCalledOnce()
})

it('resets pagination when searching and keeps full-inventory metrics on an empty result', async () => {
  const fn = vi.fn().mockImplementation((query: string) => Promise.resolve(query ? {...data, content: [], totalElements: 0, totalPages: 0} : data))
  mount(fn)
  await screen.findByText('示例药品')
  await userEvent.click(screen.getByRole('button', {name: '下一页'}))
  await waitFor(() => expect(fn).toHaveBeenLastCalledWith('', 'ALL', 1, 20))
  await userEvent.type(screen.getByRole('searchbox', {name: '搜索标准建设药品'}), '不匹配')
  await userEvent.click(screen.getByRole('button', {name: '查询'}))
  await screen.findByText('当前条件下没有药品')
  expect(fn).toHaveBeenLastCalledWith('不匹配', 'ALL', 0, 20)
  expect(screen.getByText('启用药品').parentElement).toHaveTextContent('90')
})

it('shows a failed audit as an error, without a zero or complete result', async () => {
  mount(vi.fn().mockRejectedValue(new Error('核查服务不可用')))
  await screen.findByText('核查服务不可用')
  expect(screen.queryByText('启用药品')).not.toBeInTheDocument()
  expect(screen.queryByText('当前条件下没有药品')).not.toBeInTheDocument()
})

it('groups unmapped work by actual cause and filters without changing the inventory denominator', async () => {
  const fn = vi.fn().mockResolvedValue({...data, summary: {...data.summary, matchingStatuses: {DUPLICATE_LOCAL: 2}},
    content: [{...data.content[0], standardReference: {status: 'UNMAPPED', issues: ['STANDARD_REFERENCE_MISSING']},
      matching: {status: 'DUPLICATE_LOCAL', candidateCount: 3, consistentCount: 1}}]})
  mount(fn)
  await screen.findByText(/多个本地档案对应同一标准规格/)
  await userEvent.click(screen.getByRole('button', {name: '本地重复档案待整理 · 2'}))
  await waitFor(() => expect(fn).toHaveBeenLastCalledWith('', 'DUPLICATE_LOCAL', 0, 20))
  expect(screen.getByText('启用药品').parentElement).toHaveTextContent('90')
})
