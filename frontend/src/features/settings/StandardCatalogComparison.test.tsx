import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { StandardCatalogComparison } from './StandardCatalogComparison'

vi.mock('./StandardCatalogPdfPage', () => ({StandardCatalogPdfPage: ({page, onReady}: {page: number; onReady: (page: number) => void}) => {useEffect(() => onReady(page), [page, onReady]); return <div title={`来源原稿 PDF · 第 ${page} 页`} />}}))

const hash = '25671de0d85d12e409d79764d48865522e03122d8e9c1b0957a7ad1c8bf97e8e'
const identity = {catalogId: 'catalog', catalogVersion: 'v1', contentHash: 'content', sourceHash: 'source'}
const content = {source: {claimedEdition: '2026', officialAttachmentSha256: hash}, entries: [
  {id: 'a', name: '青霉素', legacyCode: 'A', sourceSpecification: '原文规格', pdfLocations: [{page: 15, location: 'row:3'}]},
  {id: 'b', name: '阿莫西林', legacyCode: 'B', sourceSpecification: '另一条规格', pdfLocations: [{page: 16, location: 'row:4'}]},
], specifications: [
  {id: 's', entryId: 'a', doseFormName: '注射用无菌粉末', specification: '0.25g（40万单位）', substanceQualifier: '钾盐'},
  {id: 's2', entryId: 'a', doseFormName: '注射用无菌粉末', specification: '0.24g（40万单位）', substanceQualifier: '钠盐'},
  {id: 's3', entryId: 'b', doseFormName: '片剂', specification: '4:1', substanceQualifier: ''},
  {id: 's4', entryId: 'b', doseFormName: '片剂', specification: '阿莫西林:克拉维酸=2:1', substanceQualifier: ''},
]}
function setup(options: {wrongHash?: boolean; failSave?: boolean; supported?: boolean; saved?: boolean} = {}) {
  vi.stubGlobal('crypto', {subtle: {digest: vi.fn().mockResolvedValue(options.wrongHash ? new Uint8Array([1]).buffer : new Uint8Array(hash.match(/../g)!.map(b => parseInt(b, 16))).buffer)}})
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:review')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const download = vi.fn().mockResolvedValue({arrayBuffer: async () => new ArrayBuffer(1)})
  const reviewEntry = options.failSave ? vi.fn().mockRejectedValue(new Error('保存失败，请重试')) : vi.fn().mockImplementation(async (_edition, id, input) => ({...input, entryId: id, revision: input.expectedRevision + 1, actor: '核对员', recordedAt: '2026-09-23T00:00:00Z'}))
  const api = {masterData: {downloadStandardCatalogSourceDocument: download}, standardCatalogEditions: {
    entryReviews: vi.fn().mockResolvedValue({identity, entries: options.saved ? [{entryId: 'a', status: 'CHECKED', revision: 1, actor: '核对员', recordedAt: '2026-09-23T00:00:00Z'}] : []}), reviewEntry,
  }} as unknown as RhnApi
  const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}, mutations: {retry: false}}})
  const view = render(<QueryClientProvider client={client}><StandardCatalogComparison api={api} identity={identity} content={options.supported === false ? {...content, source: {claimedEdition: '2027'}} : content} /></QueryClientProvider>)
  return {...view, download, revoke, reviewEntry}
}
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks()})

it('automatically locates the first entry and follows selection without file upload', async () => {
  const {unmount, revoke} = setup()
  expect(screen.queryByLabelText('选择对应原稿 PDF')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.getByTitle('来源原稿 PDF · 第 15 页')).toBeInTheDocument())
  expect(screen.getByText('注射用无菌粉末 · 0.25g（40万单位）')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', {name: '下一条'}))
  expect(screen.getByTitle('来源原稿 PDF · 第 16 页')).toBeInTheDocument()
  unmount(); expect(revoke).toHaveBeenCalledWith('blob:review')
})
it('groups electronic specifications by salt and exposes the identity rule', async () => {
  setup()
  await waitFor(() => expect(screen.getByTitle('来源原稿 PDF · 第 15 页')).toBeInTheDocument())
  expect(screen.getByRole('heading', {name: '钾盐'})).toBeInTheDocument()
  expect(screen.getByRole('heading', {name: '钠盐'})).toBeInTheDocument()
  expect(screen.getByText(/盐型属于药品身份限定/)).toBeInTheDocument()
  expect(screen.getByText('注射用无菌粉末 · 0.25g（40万单位）')).toBeInTheDocument()
  expect(screen.getByText('注射用无菌粉末 · 0.24g（40万单位）')).toBeInTheDocument()
})
it('separates ratio-only fragments from concrete electronic specifications', async () => {
  setup()
  await waitFor(() => expect(screen.getByRole('button', {name: '下一条'})).toBeEnabled())
  await userEvent.click(screen.getByRole('button', {name: '下一条'}))
  expect(screen.getByRole('heading', {name: '待核对片段（不可直接建档）'})).toBeInTheDocument()
  expect(screen.getAllByRole('listitem').some(item => item.textContent?.includes('4:1'))).toBe(true)
  expect(screen.getByText(/不能作为本院可开立药品的完整规格/)).toBeInTheDocument()
})
it('saves a pinned entry without notes and moves to the next entry only after success', async () => {
  const {reviewEntry} = setup()
  const button = screen.getByRole('button', {name: '核对无误，下一条'})
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
  expect(reviewEntry).toHaveBeenCalledWith('0', 'a', {identity, expectedRevision: 0, status: 'CHECKED', note: ''})
  expect(await screen.findByTitle('来源原稿 PDF · 第 16 页')).toBeInTheDocument()
  expect(screen.getByText('已核对 1 / 2 · 有问题 0')).toBeInTheDocument()
})
it('keeps the current entry and problem note when saving fails', async () => {
  setup({failSave: true})
  await waitFor(() => expect(screen.getByRole('button', {name: '有问题'})).toBeEnabled())
  await userEvent.click(screen.getByRole('button', {name: '有问题'}))
  expect(screen.getByRole('button', {name: '记录问题，下一条'})).toBeDisabled()
  await userEvent.type(screen.getByRole('textbox', {name: /问题说明/}), '规格不一致')
  await userEvent.click(screen.getByRole('button', {name: '记录问题，下一条'}))
  await screen.findByText('保存失败，请重试')
  expect(screen.getByRole('textbox', {name: /问题说明/})).toHaveValue('规格不一致')
  expect(screen.getByTitle('来源原稿 PDF · 第 15 页')).toBeInTheDocument()
})
it('restores saved progress and uses its revision', async () => {
  const {reviewEntry} = setup({saved: true})
  await waitFor(() => expect(screen.getByRole('button', {name: '核对无误，下一条'})).toBeEnabled())
  await userEvent.click(screen.getByRole('button', {name: '核对无误，下一条'}))
  expect(reviewEntry).toHaveBeenCalledWith('0', 'a', expect.objectContaining({expectedRevision: 1}))
})
it('does not preview or allow checking a PDF with a different fingerprint', async () => {
  setup({wrongHash: true})
  await screen.findByText(/原稿校验失败/)
  expect(screen.getByRole('button', {name: '核对无误，下一条'})).toBeDisabled()
})
it('does not load the 2026 original for an unsupported source', async () => {
  const {download} = setup({supported: false})
  expect(screen.getByText(/当前仅支持国家基本药物目录/)).toBeInTheDocument()
  expect(download).not.toHaveBeenCalled()
  expect(screen.getByRole('button', {name: '核对无误，下一条'})).toBeDisabled()
})
