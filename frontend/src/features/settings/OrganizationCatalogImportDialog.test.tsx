import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationCatalogImportDialog } from './BasicDataManagement'
import { requireImportReceipt, type CatalogImportAttempt } from './catalogImportFacts'
import type { AdoptionBatchInput, RhnApi } from '../../shared/rhnApi'
import type { Organization } from '../../shared/model'

const items = ['检验甲', '检验乙'].map((name, i) => ({ id: `cat-${i}`, code: `S${i}`, name,
  itemType: 'SERVICE' as const, centerStatus: 'ACTIVE' as const, adoptionSourceType: 'NONE' as const, adoption: undefined, packages: [] }))
const page = { content: items, totalElements: 2, totalPages: 1, page: 0, size: 20 }
const org = { id: 'org', name: '机构', code: 'ORG' } as Organization
function receipt(input: AdoptionBatchInput, failed: number[] = []) {
  const rows = input.catalogItemIds.map((catalogItemId, i) => ({ id: `row-${i}`, rowNumber: i + 1, catalogItemId,
    status: failed.includes(i) ? 'FAILED' : 'SUCCEEDED', targetId: failed.includes(i) ? null : `adoption-${i}`,
    targetResourceType: failed.includes(i) ? null : 'ORGANIZATION_ADOPTION',
    errorCode: failed.includes(i) ? 'ADOPTION_PERIOD_OVERLAP' : null,
    errorMessage: failed.includes(i) ? '已有重叠有效期版本' : null,
  }))
  return { id: 'batch', revision: 0, batchType: 'ADOPTION', operationType: 'ADOPT', organizationId: input.organizationId,
    requestCode: input.requestCode, businessDate: input.businessDate,
    status: !failed.length ? 'COMPLETED' : failed.length === rows.length ? 'FAILED' : 'PARTIAL',
    totalRows: rows.length, succeededRows: rows.length - failed.length, failedRows: failed.length,
    createdAt: '2026-10-03T01:00:00Z', createdBy: 'user', updatedAt: '2026-10-03T01:00:00Z', rows }
}
function apiFixture() {
  return { masterData: { adoptionCandidates: vi.fn().mockResolvedValue(page),
    adoptionBatch: vi.fn().mockImplementation(async input => receipt(input)), catalogChangeBatch: vi.fn() } }
}
function setup(api = apiFixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn(), onCompleted = vi.fn().mockResolvedValue(undefined)
  const content = (value = api, visible = true) => <QueryClientProvider client={client}>{visible &&
    <OrganizationCatalogImportDialog api={value as unknown as RhnApi} organization={org} initialItemType="SERVICE"
      onClose={onClose} onCompleted={onCompleted} />}</QueryClientProvider>
  const view = render(content())
  return { api, client, onClose, onCompleted, ...view, reopen: () => view.rerender(content()),
    hide: () => view.rerender(content(api, false)), switchApi: (value: ReturnType<typeof apiFixture>) => view.rerender(content(value)) }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
async function selectAndSubmit(count = 2) {
  await userEvent.click(await screen.findByRole('checkbox', { name: '选择 检验甲' }))
  if (count === 2) await userEvent.click(screen.getByRole('checkbox', { name: '选择 检验乙' }))
  await userEvent.click(screen.getByRole('button', { name: `确认调入 ${count} 项` }))
}

describe('catalog import receipts', () => {
  const input: AdoptionBatchInput = { requestCode: 'request', operationType: 'ADOPT', organizationId: 'org', businessDate: '2026-10-03', catalogItemIds: ['cat-0', 'cat-1'] }
  const attempt: CatalogImportAttempt = { input, items }
  it('accepts complete, partial and failed receipts with real row outcomes', () => {
    for (const failed of [[], [1], [0, 1]]) expect(requireImportReceipt(receipt(input, failed), attempt)).toEqual(receipt(input, failed))
  })
  it.each([
    {}, { id: 'batch' }, { ...receipt(input), organizationId: 'other' }, { ...receipt(input), requestCode: 'other' },
    { ...receipt(input), businessDate: '2026-10-04' }, { ...receipt(input), totalRows: 3 },
    { ...receipt(input), succeededRows: 1 }, { ...receipt(input), status: 'PARTIAL' },
    { ...receipt(input), rows: [] }, { ...receipt(input), rows: [receipt(input).rows[0], receipt(input).rows[0]] },
    { ...receipt(input), rows: receipt(input).rows.map(row => ({ ...row, catalogItemId: 'other' })) },
    { ...receipt(input), rows: receipt(input).rows.map(row => ({ ...row, targetId: null })) },
    { ...receipt(input, [0, 1]), rows: receipt(input, [0, 1]).rows.map(row => ({ ...row, errorMessage: null })) },
    { ...receipt(input), createdAt: 'not-a-date' },
  ])('rejects incomplete/mismatched receipts %#', value => {
    expect(() => requireImportReceipt(value, attempt)).toThrow('调入批次回执')
  })
  it('checks the batch identity on a subsequent read', () => {
    expect(() => requireImportReceipt(receipt(input), { ...attempt, batchId: 'other' })).toThrow()
  })
})

describe('catalog import truthful workflows', () => {
  it.each(['network', 'missing', 'already-adopted'])('shows read %s as failure instead of an empty catalogue', async kind => {
    const api = apiFixture()
    if (kind === 'network') api.masterData.adoptionCandidates.mockRejectedValueOnce(new Error('offline'))
    else api.masterData.adoptionCandidates.mockResolvedValueOnce(kind === 'missing' ? {} : {
      ...page, content: items.map(item => ({ ...item, adoptionSourceType: 'LOCAL' })),
    })
    setup(api)
    expect(await screen.findByText(/待调入目录加载失败/)).toBeInTheDocument()
    expect(screen.queryByText('没有待调入项目')).not.toBeInTheDocument()
    expect(screen.queryByText('0 项待调入')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认调入' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '重新加载待调入目录' }))
    expect(await screen.findByRole('checkbox', { name: '选择 检验甲' })).toBeInTheDocument()
  })
  it('keeps selected items but disables submission on failed candidate refresh', async () => {
    const { api, client } = setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: '选择 检验甲' }))
    api.masterData.adoptionCandidates.mockRejectedValue(new Error('offline'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['master-data-adoption-candidates'] }) })
    await screen.findByText(/待调入目录加载失败/)
    expect(screen.getByRole('button', { name: '确认调入 1 项' })).toBeDisabled()
    expect(within(screen.getByRole('complementary', { name: '本批调入配置' })).getByText('检验甲')).toBeInTheDocument()
    expect(api.masterData.adoptionBatch).not.toHaveBeenCalled()
  })
  it('only reports full completion from a verified batch and does not repeat writes if parent refresh fails', async () => {
    const { api, onCompleted } = setup()
    await selectAndSubmit()
    expect(await screen.findByText(/全部调入完成：2 项/)).toBeInTheDocument()
    expect(onCompleted).not.toHaveBeenCalled()
    onCompleted.mockRejectedValueOnce(new Error('refresh offline'))
    await userEvent.click(screen.getByRole('button', { name: '完成并刷新列表' }))
    expect(await screen.findByText(/调入已完成，但列表刷新失败/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '完成并刷新列表' }))
    expect(onCompleted).toHaveBeenCalledTimes(2)
    expect(api.masterData.adoptionBatch).toHaveBeenCalledTimes(1)
  })
  it.each(['partial', 'failed'])('shows %s and carries only failures into the next batch', async kind => {
    const api = apiFixture()
    api.masterData.adoptionBatch.mockImplementationOnce(async input => receipt(input, kind === 'partial' ? [1] : [0, 1]))
    const { onCompleted } = setup(api)
    await selectAndSubmit()
    expect(await screen.findByText(kind === 'partial' ? /本批调入成功 1 项，失败 1 项/ : /本批调入成功 0 项，失败 2 项/)).toBeInTheDocument()
    expect(screen.getAllByText(/ADOPTION_PERIOD_OVERLAP：已有重叠有效期版本/).length).toBe(kind === 'partial' ? 1 : 2)
    expect(screen.queryByText(/全部调入完成/)).not.toBeInTheDocument()
    expect(onCompleted).not.toHaveBeenCalled()
    const before = api.masterData.adoptionBatch.mock.calls[0][0]
    await userEvent.click(screen.getByRole('button', { name: '继续处理失败项' }))
    const count = kind === 'partial' ? 1 : 2
    await waitFor(() => expect(screen.getByRole('button', { name: `确认调入 ${count} 项` })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: `确认调入 ${count} 项` }))
    expect(await screen.findByText(new RegExp(`全部调入完成：${count} 项`))).toBeInTheDocument()
    const after = api.masterData.adoptionBatch.mock.calls[1][0]
    expect(after.catalogItemIds).toEqual(kind === 'partial' ? ['cat-1'] : ['cat-0', 'cat-1'])
    expect(after.requestCode).not.toBe(before.requestCode)
  })
  it.each(['network', 'malformed', 'wrong-request'])('rechecks %s using the exact frozen command', async kind => {
    const api = apiFixture()
    if (kind === 'network') api.masterData.adoptionBatch.mockRejectedValueOnce(new Error('lost response'))
    else api.masterData.adoptionBatch.mockImplementationOnce(async input => kind === 'malformed' ? {} : { ...receipt(input), requestCode: 'wrong' })
    const { onCompleted } = setup(api)
    await userEvent.click(await screen.findByRole('checkbox', { name: '允许收费' }))
    await selectAndSubmit()
    expect(await screen.findByText(/调入结果未确认/)).toBeInTheDocument()
    expect(screen.queryByText(/全部调入完成/)).not.toBeInTheDocument()
    expect(onCompleted).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: '允许收费', hidden: true })).toBeDisabled()
    const first = api.masterData.adoptionBatch.mock.calls[0][0]
    expect(first.template.chargeable).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: '核实本批结果' }))
    expect(await screen.findByText(/全部调入完成：2 项/)).toBeInTheDocument()
    expect(api.masterData.adoptionBatch.mock.calls[1][0]).toEqual(first)
  })
  it('preserves the unresolved attempt and capabilities when the dialog is closed and reopened', async () => {
    const api = apiFixture()
    api.masterData.adoptionBatch.mockRejectedValueOnce(new Error('lost response'))
    const view = setup(api)
    await userEvent.click(await screen.findByRole('checkbox', { name: '允许收费' }))
    await selectAndSubmit()
    await screen.findByText(/调入结果未确认/)
    const original = api.masterData.adoptionBatch.mock.calls[0][0]
    view.hide(); view.reopen()
    expect(await screen.findByText(/上次调入结果待核实/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '允许收费', hidden: true })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: '核实本批结果' }))
    expect(await screen.findByText(/全部调入完成：2 项/)).toBeInTheDocument()
    expect(api.masterData.adoptionBatch.mock.calls[1][0]).toEqual(original)
  })
  it('reads a processing batch by confirmed ID instead of creating another write', async () => {
    const api = apiFixture()
    api.masterData.adoptionBatch.mockImplementationOnce(async input => ({ ...receipt(input), status: 'PROCESSING', succeededRows: 0, rows: [] }))
    setup(api)
    await selectAndSubmit()
    expect(await screen.findByText(/批次仍在处理/)).toBeInTheDocument()
    api.masterData.catalogChangeBatch.mockResolvedValue(receipt(api.masterData.adoptionBatch.mock.calls[0][0]))
    await userEvent.click(screen.getByRole('button', { name: '核实本批结果' }))
    expect(await screen.findByText(/全部调入完成：2 项/)).toBeInTheDocument()
    expect(api.masterData.catalogChangeBatch).toHaveBeenCalledWith('batch')
    expect(api.masterData.adoptionBatch).toHaveBeenCalledTimes(1)
  })
  it.each(['resolve', 'reject'])('blocks duplicate submit/close and ignores late %s in another API context', async response => {
    const api = apiFixture(), pending = deferred<unknown>()
    api.masterData.adoptionBatch.mockReturnValue(pending.promise)
    const view = setup(api)
    await selectAndSubmit(1)
    fireEvent.submit(document.getElementById('organization-catalog-import-form')!)
    expect(api.masterData.adoptionBatch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /^关闭$/ })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(view.onClose).not.toHaveBeenCalled()
    view.switchApi(apiFixture())
    await act(async () => response === 'resolve' ? pending.resolve(receipt(api.masterData.adoptionBatch.mock.calls[0][0])) : pending.reject(new Error('old request')))
    expect(screen.queryByText(/全部调入完成/)).not.toBeInTheDocument()
    expect(screen.queryByText(/调入结果未确认/)).not.toBeInTheDocument()
    expect(view.onCompleted).not.toHaveBeenCalled()
  })
})
