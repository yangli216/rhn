import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { InventoryBalance, InventoryPriceAdjustment, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { InventoryPriceAdjustmentManagement } from './InventoryPriceAdjustmentManagement'
import { validAdjustmentTargets } from './priceAdjustmentTruth'

const detail = { id: 'detail', inventoryBalanceId: 'balance', inventoryBalanceRevision: 1, stockBinId: 'bin', stockLotId: 'lot', lotNo: 'LOT', stockStatus: 'AVAILABLE', roundingAmount: 0, quantitySnapshot: 2,
  unitPriceBefore: 5, unitPriceAfter: 7, valueBefore: 10, valueAfter: 14, adjustmentAmount: 4 }
const line = { id: 'line', revision: 1, lineNo: 1, catalogItemId: 'catalog', packageId: 'package', roundingAmount: 0, stockItemId: 'item', newUnitCost: 7, oldUnitCost: 5, quantitySnapshot: 2,
  valueBefore: 10, valueAfter: 14, adjustmentAmount: 4, lineStatus: 'READY', details: [detail] }
const document = { id: 'adjustment', revision: 1, stockSiteId: 'site', adjustmentNo: 'PA-REAL', adjustmentType: 'COST_REVALUE',
  businessDate: '2026-10-03', currencyCode: 'CNY', reason: '成本核实', status: 'APPROVED', lineCount: 1,
  totalValueBefore: 10, totalValueAfter: 14, totalAdjustmentAmount: 4, lines: [line] } as InventoryPriceAdjustment
const draft = { ...document, status: 'DRAFT', totalValueBefore: 0, totalValueAfter: 0, totalAdjustmentAmount: 0,
  lines: [{ ...line, lineStatus: 'PENDING', oldUnitCost: undefined, quantitySnapshot: 0,
    valueBefore: 0, valueAfter: 0, adjustmentAmount: 0, details: [] }] } as InventoryPriceAdjustment
const item = { id: 'item', productName: '药品甲', productCode: 'A', packageFactor: 10, baseUnitCode: '粒', packageUnitName: '盒' } as StockItem

function show(value: unknown = [document], balances: InventoryBalance[] = []) {
  const list = vi.fn().mockResolvedValue(value)
  const create = vi.fn().mockImplementation(async input => ({ ...draft, requestCode: input.requestCode }))
  const submit = vi.fn().mockResolvedValue({ ...document, status: 'SUBMITTED' })
  const approve = vi.fn().mockResolvedValue(document)
  const post = vi.fn().mockResolvedValue({ ...document, status: 'POSTED', lines: [{ ...line, lineStatus: 'POSTED',
    details: [{ ...detail, valuationEntryId: 'entry' }] }] })
  const cancel = vi.fn().mockResolvedValue({ ...draft, status: 'CANCELLED' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const api = { pharmacy: { priceAdjustments: list, createPriceAdjustment: create, submitPriceAdjustment: submit,
    approvePriceAdjustment: approve, postPriceAdjustment: post, cancelPriceAdjustment: cancel } } as unknown as RhnApi
  render(<QueryClientProvider client={queryClient}><InventoryPriceAdjustmentManagement api={api} siteId="site"
    items={[item, { ...item, id: 'item2', productName: '药品乙' }]} bins={[]} balances={balances} /></QueryClientProvider>)
  return { list, create, submit, approve, post, cancel, queryClient }
}

it('does not display uncomputed draft placeholders as actual zero amounts or stock', async () => {
  show([draft])
  await screen.findByRole('button', { name: '提交预检' })
  expect(screen.getAllByText('预检后确认').length).toBeGreaterThan(2)
  expect(screen.queryByText('CNY 0.00')).not.toBeInTheDocument()
  expect(screen.queryByText('0 个库存维度')).not.toBeInTheDocument()
  expect(screen.getByText('CNY 7.00')).toBeInTheDocument()
})

it('retains genuine zero amounts and the returned currency after preview', async () => {
  show([{ ...document, currencyCode: 'USD', totalValueBefore: 0, totalValueAfter: 0, totalAdjustmentAmount: 0,
    lines: [{ ...line, newUnitCost: 0, oldUnitCost: 0, valueBefore: 0, valueAfter: 0, adjustmentAmount: 0,
      details: [{ ...detail, unitPriceBefore: 0, unitPriceAfter: 0, valueBefore: 0, valueAfter: 0, adjustmentAmount: 0 }] }] }])
  await screen.findByRole('button', { name: '正式记账' })
  expect(screen.getAllByText('USD 0.00').length).toBeGreaterThan(2)
  expect(screen.queryByText('预检后确认')).not.toBeInTheDocument()
})

it.each([null, {}, [null], [{ ...document, stockSiteId: 'other' }], [{ ...document, status: 'UNKNOWN' }],
  [{ ...document, totalAdjustmentAmount: undefined }], [{ ...document, totalValueAfter: 15 }],
  [{ ...document, lines: [{ ...line, oldUnitCost: null }] }],
  [{ ...document, lines: [{ ...line, details: [] }] }], [{ ...document, status: 'POSTED' }],
])('rejects incomplete or contradictory price adjustments %#', async value => {
  show(value)
  await screen.findByText('调价结果不可用')
  expect(screen.queryByRole('button', { name: '正式记账' })).not.toBeInTheDocument()
  expect(screen.queryByText('尚无库存调价单')).not.toBeInTheDocument()
})

it('invalidates an open confirmation after a failed refresh', async () => {
  const { list, queryClient, post } = show()
  fireEvent.click(await screen.findByRole('button', { name: '正式记账' }))
  expect(screen.getByRole('button', { name: '确认正式记账' })).toBeEnabled()
  list.mockRejectedValueOnce(new Error('服务不可用'))
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-price-adjustments', 'site'] }))
  await screen.findByText('调价结果不可用')
  await waitFor(() => expect(screen.getByRole('button', { name: '确认正式记账' })).toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: '确认正式记账' }))
  expect(post).not.toHaveBeenCalled()
})

it('invalidates an open confirmation when the document revision changes', async () => {
  const { list, queryClient, post } = show()
  fireEvent.click(await screen.findByRole('button', { name: '正式记账' }))
  list.mockResolvedValueOnce([{ ...document, revision: 2 }])
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-price-adjustments', 'site'] }))
  await waitFor(() => expect(screen.getByRole('button', { name: '确认正式记账' })).toBeDisabled())
  expect(post).not.toHaveBeenCalled()
})

it.each([undefined, { ...document, status: 'APPROVED' }, { ...document, id: 'other', status: 'POSTED' }])(
  'does not treat an unconfirmed posting response as successful %#', async result => {
    const { post } = show()
    post.mockResolvedValueOnce(result)
    fireEvent.click(await screen.findByRole('button', { name: '正式记账' }))
    fireEvent.click(screen.getByRole('button', { name: '确认正式记账' }))
    await screen.findByText('调价结果不可用')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '确认正式记账' })).toBeDisabled())
  })

it('accepts a complete posted result and closes confirmation', async () => {
  const { list } = show()
  fireEvent.click(await screen.findByRole('button', { name: '正式记账' }))
  list.mockResolvedValue([{ ...document, status: 'POSTED', lines: [{ ...line, lineStatus: 'POSTED',
    details: [{ ...detail, valuationEntryId: 'entry' }] }] }])
  fireEvent.click(screen.getByRole('button', { name: '确认正式记账' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getAllByText('已记账')).toHaveLength(2)
})

it('does not turn a null cost into a free item and requires all selected target prices', async () => {
  const { create } = show([], [{ stockItemId: 'item', quantityOnHand: 20, averageUnitCost: null },
    { stockItemId: 'item2', quantityOnHand: 10, averageUnitCost: 5 }] as unknown as InventoryBalance[])
  await screen.findByText('尚无库存调价单')
  fireEvent.click(screen.getAllByRole('button', { name: '新建调价单' })[0])
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('成本未取得')).toBeInTheDocument()
  fireEvent.change(within(dialog).getByLabelText(/调价原因/), { target: { value: '核实价格' } })
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择药品甲' }))
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择药品乙' }))
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: '药品甲新价格' }), { target: { value: '0' } })
  expect(within(dialog).getByRole('button', { name: '创建调价单' })).toBeDisabled()
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: '药品乙新价格' }), { target: { value: '5' } })
  expect(within(dialog).getByRole('button', { name: '创建调价单' })).toBeEnabled()
  fireEvent.change(within(dialog).getByLabelText(/业务日期/), { target: { value: '' } })
  expect(within(dialog).getByRole('button', { name: '创建调价单' })).toBeDisabled()
  expect(create).not.toHaveBeenCalled()
})

it('keeps creation open on an empty result and reuses the request code when retrying', async () => {
  const { create } = show([], [{ stockItemId: 'item', quantityOnHand: 20, averageUnitCost: 5 }] as InventoryBalance[])
  create.mockResolvedValue(undefined)
  await screen.findByText('尚无库存调价单')
  fireEvent.click(screen.getAllByRole('button', { name: '新建调价单' })[0])
  fireEvent.change(screen.getByLabelText(/调价原因/), { target: { value: '核实价格' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '选择药品甲' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: '药品甲新价格' }), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: '创建调价单' }))
  await screen.findByText('调价结果未完整返回或与当前操作不一致，请重新读取确认。')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '创建调价单' }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
  expect(create.mock.calls[0][0].requestCode).toBe(create.mock.calls[1][0].requestCode)
  expect(create.mock.calls[0][0].lines).toEqual([{ stockItemId: 'item', newUnitCost: 0 }])
})

it.each(['', ' ', 'NaN', 'Infinity', '-1'])('rejects invalid selected price %s', value => {
  expect(validAdjustmentTargets({ item: value })).toBe(false)
})

it.each([draft, { ...document, status: 'SUBMITTED' }])('blocks further actions after an empty transition result %#', async value => {
  const { submit, approve } = show([value])
  submit.mockResolvedValueOnce(undefined)
  approve.mockResolvedValueOnce(undefined)
  fireEvent.click(await screen.findByRole('button', { name: value.status === 'DRAFT' ? '提交预检' : '审核通过' }))
  await screen.findByText('调价结果不可用')
  expect(screen.queryByRole('button', { name: '正式记账' })).not.toBeInTheDocument()
})

it.each([draft, document])('preserves whether a cancelled adjustment was previewed %#', async value => {
  show([{ ...value, status: 'CANCELLED' }])
  await screen.findAllByText('已取消')
  expect(screen.queryByRole('button', { name: '正式记账' })).not.toBeInTheDocument()
  if (value.status === 'DRAFT') expect(screen.getAllByText('尚未预检').length).toBeGreaterThan(0)
  else expect(screen.getAllByText('+CNY 4.00').length).toBeGreaterThan(0)
})

it('accepts a real sale price preview with no stock dimensions', async () => {
  show([{ ...document, adjustmentType: 'SALE_PRICE', totalValueBefore: 0, totalValueAfter: 0, totalAdjustmentAmount: 0,
    lines: [{ ...line, oldSalePrice: 50, newSalePrice: 70, quantitySnapshot: 0, valueBefore: 0, valueAfter: 0, adjustmentAmount: 0, details: [] }] }])
  expect(await screen.findByRole('button', { name: '正式记账' })).toBeEnabled()
  expect(screen.getByText('CNY 50.00')).toBeInTheDocument()
  expect(screen.getByText('CNY 70.00')).toBeInTheDocument()
  expect(screen.getByText('0 个库存维度')).toBeInTheDocument()
})
