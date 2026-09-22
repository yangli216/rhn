import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi, StandardCatalogSourceReview, StandardCatalogReviewEvent } from '../../shared/rhnApi'
import { StandardCatalogSourceReviewDialog } from './StandardCatalogSourceReviewDialog'

const identity = {catalogId: 'catalog', catalogVersion: 'v1', contentHash: 'content-1', sourceHash: 'source-1'}
const evidence = {title: '测试来源', publisher: '测试机构', edition: '2026 测试版', location: '测试档案第 2 页', verificationNotes: '测试核对说明'}
const event: StandardCatalogReviewEvent = {id: '1', revision: 1, identity, status: 'SUBMITTED', evidence, submittedBy: '7', submitter: '提交人甲',
  actorId: '7', actor: '提交人甲', reason: '测试提交', recordedAt: '2026-09-21T00:00:00Z'}
const pending: StandardCatalogSourceReview = {identity, revision: 1, status: 'SUBMITTED', latest: event, history: [event],
  totalEvents: 1, historyPage: 0, historyPageSize: 20, allowedActions: ['VERIFY', 'REJECT']}
function setup(value: StandardCatalogSourceReview, mutate = vi.fn().mockResolvedValue(value)) {
  const get = vi.fn().mockResolvedValue(value)
  const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}, mutations: {retry: false}}})
  render(<QueryClientProvider client={client}><StandardCatalogSourceReviewDialog api={{masterData: {
    standardCatalogSourceReview: get, changeStandardCatalogSourceReview: mutate,
  }} as unknown as RhnApi} onClose={vi.fn()} /></QueryClientProvider>)
  return {get, mutate}
}

it('requires complete evidence and submits the pinned edition and revision', async () => {
  const {mutate} = setup({...pending, revision: 0, status: 'UNVERIFIED', latest: null, history: [], totalEvents: 0, allowedActions: ['SUBMIT']})
  const button = await screen.findByRole('button', {name: '提交来源材料'})
  expect(button).toBeDisabled()
  for (const [label, value] of [['来源名称', evidence.title], ['发布机构', evidence.publisher], ['来源版本或发布日期', evidence.edition],
    ['证据位置', evidence.location], ['核验说明', evidence.verificationNotes], ['操作理由', '申请复核']]) {
    await userEvent.type(screen.getByRole('textbox', {name: new RegExp(label)}), value)
  }
  await userEvent.click(button)
  expect(mutate).toHaveBeenCalledWith({identity, expectedRevision: 0, action: 'SUBMIT', evidence, reason: '申请复核'})
})

it('does not offer self approval when the server reports no allowed actions', async () => {
  setup({...pending, allowedActions: []})
  await screen.findByText(/当前账号没有可执行的操作/)
  expect(screen.queryByRole('button', {name: '复核通过'})).not.toBeInTheDocument()
  expect(screen.getByText(evidence.location)).toBeInTheDocument()
  expect(screen.getByText(/不代替临床知识审核/)).toBeInTheDocument()
})

it('cannot approve current work while showing historical material, and never replaces submitted evidence', async () => {
  const {mutate} = setup({...pending, history: [event, {...event, id: 'old', status: 'REVOKED', identity: {...identity, catalogVersion: 'old'}}], totalEvents: 2})
  await screen.findByText('当前核验材料')
  await userEvent.type(screen.getByRole('textbox', {name: /操作理由/}), '已核对测试材料')
  await userEvent.click(screen.getByRole('button', {name: /核验已撤销/}))
  expect(screen.getByText('历史核验材料')).toBeInTheDocument()
  expect(screen.getByRole('button', {name: '复核通过'})).toBeDisabled()
  await userEvent.click(screen.getByRole('button', {name: '返回当前材料'}))
  await userEvent.click(screen.getByRole('button', {name: '复核通过'}))
  expect(mutate).toHaveBeenCalledWith({identity, expectedRevision: 1, action: 'VERIFY', reason: '已核对测试材料'})
})

it('clears unsubmitted material when source identity changes', async () => {
  const {get} = setup({...pending, status: 'UNVERIFIED', revision: 0, latest: null, history: [], allowedActions: ['SUBMIT']})
  const input = await screen.findByRole('textbox', {name: /来源名称/})
  await userEvent.type(input, '旧文件材料')
  get.mockResolvedValue({...pending, identity: {...identity, sourceHash: 'new-source'}, revision: 0, status: 'UNVERIFIED', latest: null, history: [], allowedActions: ['SUBMIT']})
  await userEvent.click(screen.getByRole('button', {name: '刷新核验状态'}))
  await waitFor(() => expect(input).toHaveValue(''))
  expect(screen.getByText(/旧版未提交材料已清空/)).toBeInTheDocument()
})

it('shows a concurrent update error without claiming successful verification', async () => {
  setup(pending, vi.fn().mockRejectedValue(new Error('核验记录已变化，请刷新后重试')))
  await screen.findByText('当前核验材料')
  await userEvent.type(screen.getByRole('textbox', {name: /操作理由/}), '测试复核')
  await userEvent.click(screen.getByRole('button', {name: '复核通过'}))
  await screen.findByText('核验记录已变化，请刷新后重试')
  expect(screen.queryByText('复核通过成功')).not.toBeInTheDocument()
})
