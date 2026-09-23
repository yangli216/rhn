import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi, CatalogEdition, CatalogEditionDetail } from '../../shared/rhnApi'
import { StandardCatalogEditionsDialog } from './StandardCatalogEditionsDialog'
const current: CatalogEdition = { id: '0', identity: { catalogId: 'C', catalogVersion: '1', contentHash: 'old-content', sourceHash: 'source' }, packageHash: 'runtime-package', declaredContentHash: 'old-content', fileName: 'runtime.json', reason: '系统目录', actorId: null, actor: '系统', importedAt: null, entries: 100, specifications: 200, issues: 2, runtime: true, origin: 'RUNTIME', baselineId: null }
const target: CatalogEdition = { ...current, id: '10', identity: { ...current.identity, catalogVersion: '2', contentHash: 'new-content' }, runtime: false, origin: 'IMPORTED', baselineId: '9', fileName: 'new.json', actor: '登记人员' }
function detail(e = current): CatalogEditionDetail { return { edition: e, source: { title: '合成目录' }, notices: ['来源仍待核对'], review: { identity: e.identity, revision: 0, status: 'UNVERIFIED', latest: null, history: [], totalEvents: 0, historyPage: 0, historyPageSize: 20, allowedActions: ['SUBMIT'] } } }
function setup() {
  const api = { runtime: vi.fn().mockResolvedValue(current), list: vi.fn().mockResolvedValue({ content: [target], totalElements: 1, totalPages: 1, page: 0, size: 20 }), detail: vi.fn().mockImplementation((id: string) => Promise.resolve(detail(id === '0' ? current : target))), register: vi.fn().mockResolvedValue(detail(target)), compare: vi.fn().mockResolvedValue({ base: current, target, fingerprint: 'fixed-comparison', counts: { ENTRY: 0, SPECIFICATION: 25, METADATA: 2 }, changes: { content: [{ group: 'SPECIFICATION', objectId: 'S1', name: '合成规格', operation: 'CHANGED', path: '/strength/numerator/value', before: '1', after: '2' }], totalElements: 25, totalPages: 2, page: 0, size: 20 } }), dependencies: vi.fn().mockResolvedValue({ target, fingerprint: 'dependencies', coverage: ['完整保存关系'], limitations: ['不证明临床影响'], items: { content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 } }), review: vi.fn().mockResolvedValue(detail(target)) }
  const masterData = { standardCatalogSourceReview: vi.fn(), changeStandardCatalogSourceReview: vi.fn() }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><StandardCatalogEditionsDialog api={{ standardCatalogEditions: api, masterData } as unknown as RhnApi} onClose={vi.fn()} /></QueryClientProvider>)
  return { api, masterData }
}
it('requires an explicit file, reason and confirmation, pinning the current runtime hash', async () => {
  const { api } = setup()
  await screen.findByText('当前运行目录 · 1')
  expect(screen.getByRole('button', { name: '登记候选版次' })).toBeDisabled()
  const raw = '{"schemaVersion":1,"catalogVersion":"2"}', file = new File([raw], 'new.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => raw })
  await userEvent.upload(screen.getByLabelText('目录 JSON 文件'), file)
  await screen.findByText('待登记：new.json')
  await userEvent.type(screen.getByLabelText('登记原因'), '核对新版本')
  expect(api.register).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: '登记候选版次' }))
  await waitFor(() => expect(api.register).toHaveBeenCalledWith({ content: raw, fileName: 'new.json', reason: '核对新版本', expectedRuntimeHash: 'runtime-package' }))
  await screen.findByText(/已登记不可变候选版次/)
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})
it('compares the fixed import baseline, retains full counts across pages, and selects an explicit alternative baseline', async () => {
  const { api } = setup()
  await userEvent.click(await screen.findByRole('button', { name: /候选版 2/ }))
  await waitFor(() => expect(api.compare).toHaveBeenCalledWith('10', '9', 0, 'ALL'))
  expect(screen.getByText('/strength/numerator/value')).toBeInTheDocument()
  expect(screen.getByText(/剂型规格 25 处差异/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('combobox', { name: '差异对象范围' }))
  await userEvent.click(await screen.findByRole('option', { name: '剂型规格' }))
  await waitFor(() => expect(api.compare).toHaveBeenLastCalledWith('10', '9', 0, 'SPECIFICATION'))
  await userEvent.click(screen.getByRole('button', { name: '恢复运行版基准' }))
  await waitFor(() => expect(api.compare).toHaveBeenLastCalledWith('10', '0', 0, 'SPECIFICATION'))
  await userEvent.click(screen.getByRole('button', { name: '当前依赖清单' }))
  await screen.findByText('完整保存关系')
  expect(api.dependencies).toHaveBeenCalledWith('10', 0)
})
it('does not expose a second source review workflow for an admitted edition', async () => {
  setup()
  await screen.findByText(/来源已在目录准入时核对/)
  expect(screen.queryByRole('button', {name: '核验此版来源'})).not.toBeInTheDocument()
  expect(screen.getByText(/来源已在目录准入时核对/)).toBeInTheDocument()
})
it('read failure removes stale comparison and metadata actions rather than showing no difference', async () => {
  const { api } = setup()
  await screen.findByText('/strength/numerator/value')
  api.compare.mockRejectedValue(new Error('差异读取失败'));api.detail.mockRejectedValue(new Error('目录读取失败'))
  await userEvent.click(screen.getByRole('button', { name: '刷新材料' }))
  await screen.findByText('差异读取失败')
  expect(screen.queryByText('/strength/numerator/value')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '核验此版来源' })).not.toBeInTheDocument()
  expect(screen.queryByText(/所选范围无字段差异/)).not.toBeInTheDocument()
})
