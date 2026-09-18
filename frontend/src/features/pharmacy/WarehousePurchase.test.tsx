import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { GoodsReceipt, PurchaseOrder, StockBin, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { GoodsReceiptDialog, MultiItemDialog, purchaseReceivable } from './WarehouseOperations'

const item = { id: 'item', productName: '阿莫西林', packageSpec: '0.25g×24粒', packageUnitName: '盒',
  packageFactor: 24, baseUnitCode: 'CAPSULE', manufacturerName: '示例厂家', lotRequired: true } as StockItem
const order = { id: 'order', orderNo: 'PO-1', lines: [
  { id: 'line', stockItemId: 'item', remainingQuantity: 10, unitPrice: 2 },
] } as PurchaseOrder
const bin = { id: 'bin', name: '合格品区', active: true, receiveAllowed: true } as StockBin
const receipt = (status: string, qty: number, orderId = 'order') => ({ status, purchaseOrderId: orderId,
  lines: [{ purchaseOrderLineId: 'line', deliveredQuantity: qty }] }) as GoodsReceipt
function showReceipt(createGoodsReceipt = vi.fn().mockResolvedValue({ id: 'receipt' }), receipts: GoodsReceipt[] = []) {
  const onDone = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <GoodsReceiptDialog api={{ pharmacy: { createGoodsReceipt } } as unknown as RhnApi} order={order}
      receipts={receipts} items={[item]} bins={[bin]} onClose={vi.fn()} onDone={onDone} />
  </QueryClientProvider>)
  return { createGoodsReceipt, onDone }
}
function completeBatch() {
  fireEvent.change(screen.getByLabelText('批号'), { target: { value: 'LOT-1' } })
  fireEvent.change(screen.getByLabelText('有效期'), { target: { value: '2030-12-31' } })
}
it('deducts pending arrivals but not posted, rejected, or other purchase orders', () => {
  expect(purchaseReceivable(order, [receipt('RECEIVED', 2), receipt('ACCEPTED', 3), receipt('POSTED', 4),
    receipt('REJECTED', 1), receipt('RECEIVED', 9, 'other')])[0].availableQuantity).toBe(5)
})
it('prefills actual remaining packages and the only bin, then proceeds to inspection', async () => {
  const { createGoodsReceipt, onDone } = showReceipt(undefined, [receipt('RECEIVED', 4)])
  expect(screen.getByLabelText('本次到货数量')).toHaveValue(6)
  completeBatch()
  fireEvent.click(screen.getByRole('button', { name: '登记并继续验收' }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ id: 'receipt' }))
  expect(createGoodsReceipt).toHaveBeenCalledWith(expect.objectContaining({ deliveryNoteNo: undefined,
    lines: [expect.objectContaining({ deliveredQuantity: 6, destinationBinId: 'bin', lotNo: 'LOT-1' })] }))
})
it('explains excess quantity and blocks negative, zero and reversed dates', () => {
  showReceipt(); completeBatch()
  const quantity = screen.getByLabelText('本次到货数量')
  const submit = screen.getByRole('button', { name: '登记并继续验收' })
  fireEvent.change(quantity, { target: { value: '20' } })
  expect(screen.getByText('超出可收数量 10盒')).toBeInTheDocument()
  expect(submit).toBeDisabled()
  fireEvent.change(quantity, { target: { value: '-1' } }); expect(submit).toBeDisabled()
  fireEvent.change(quantity, { target: { value: '0' } }); expect(submit).toBeDisabled()
  fireEvent.change(quantity, { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('生产日期'), { target: { value: '2031-01-01' } })
  expect(submit).toBeDisabled()
  expect(screen.getByText('有效期不能早于生产日期')).toBeInTheDocument()
})
it('retries an uncertain receipt with identical data and request code', async () => {
  const create = vi.fn().mockRejectedValueOnce(new TypeError('network error')).mockResolvedValueOnce({ id: 'receipt' })
  const { onDone } = showReceipt(create); completeBatch()
  fireEvent.click(screen.getByRole('button', { name: '登记并继续验收' }))
  await screen.findByText(/本次内容已锁定/)
  expect(screen.getByLabelText('批号')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '登记并继续验收' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(create.mock.calls[1][0]).toEqual(create.mock.calls[0][0])
})
it('does not silently submit a valid row when another row is unfinished', async () => {
  const submit = vi.fn()
  render(<MultiItemDialog title="测试采购" submitText="保存" items={[item]} quantityLabel="数量" withPrice onClose={vi.fn()} onSubmit={submit} />)
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: /阿莫西林/ }))
  fireEvent.change(screen.getByLabelText('第1行采购单价'), { target: { value: '2' } })
  expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: /添加一行药品/ }))
  fireEvent.change(screen.getByLabelText('第2行数量'), { target: { value: '5' } })
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
})

it('saves and submits once, preserving the saved order when submission fails', async () => {
  const { PurchaseDialog } = await import('./WarehouseOperations')
  const createPurchaseOrder = vi.fn().mockResolvedValue({ id: 'saved', orderNo: 'PO-SAVED' })
  const submitPurchaseOrder = vi.fn().mockRejectedValue(new Error('审批服务不可用'))
  const onDone = vi.fn()
  render(<PurchaseDialog api={{ pharmacy: { addSupplierItem: vi.fn().mockResolvedValue({}), createPurchaseOrder, submitPurchaseOrder } } as unknown as RhnApi}
    site={{ id: 'site' } as never} suppliers={[{ id: 'supplier', name: '供应商' }] as never}
    items={[item]} onNavigate={vi.fn()} onClose={vi.fn()} onDone={onDone} />)
  fireEvent.click(screen.getAllByRole('combobox')[1])
  fireEvent.click(await screen.findByRole('option', { name: /阿莫西林/ }))
  fireEvent.change(screen.getByLabelText('第1行采购单价'), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: '保存并提交审核' }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringContaining('PO-SAVED 已保存')))
  expect(createPurchaseOrder).toHaveBeenCalledTimes(1)
  expect(submitPurchaseOrder).toHaveBeenCalledWith('saved')
})

it('deducts rejected packages from accepted packages and requires a reason', async () => {
  const { GoodsInspectionDialog } = await import('./WarehouseOperations')
  const inspectGoodsReceipt = vi.fn().mockResolvedValue({})
  render(<QueryClientProvider client={new QueryClient()}><GoodsInspectionDialog
    api={{ pharmacy: { inspectGoodsReceipt } } as unknown as RhnApi} items={[item]}
    receipt={{ id: 'receipt', receiptNo: 'GR-1', lines: [{ id: 'batch', stockItemId: 'item', lotNo: 'LOT', deliveredQuantity: 10 }] } as GoodsReceipt}
    onClose={vi.fn()} onDone={vi.fn()} /></QueryClientProvider>)
  fireEvent.change(screen.getByLabelText('LOT不合格数'), { target: { value: '2' } })
  expect(screen.getByLabelText('LOT合格数')).toHaveValue(8)
  expect(screen.getByRole('button', { name: '确认验收结果' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('LOT不合格原因'), { target: { value: '包装破损' } })
  fireEvent.click(screen.getByRole('button', { name: '确认验收结果' }))
  await waitFor(() => expect(inspectGoodsReceipt).toHaveBeenCalledWith('receipt', [
    { goodsReceiptLineId: 'batch', acceptedQuantity: 8, rejectedQuantity: 2, rejectionReason: '包装破损' },
  ]))
})

it('supports direct purchase receipt with immediate inspection and inventory posting', async () => {
  const { PurchaseDialog } = await import('./WarehouseOperations')
  const directGoodsReceipt = vi.fn().mockResolvedValue({ id: 'gr-direct', status: 'POSTED' })
  const onDone = vi.fn()
  render(<PurchaseDialog
    api={{ pharmacy: { directGoodsReceipt } } as unknown as RhnApi}
    site={{ id: 'site' } as never}
    suppliers={[{ id: 'supplier', name: '优质供应商' }] as never}
    items={[item]}
    bins={[bin]}
    initialMode="direct"
    onNavigate={vi.fn()}
    onClose={vi.fn()}
    onDone={onDone}
  />)

  // 验证模式 Tab 与直接入库专属字段呈现
  expect(screen.getByText('直接采购入库')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('随货凭单号（选填）')).toBeInTheDocument()

  // 选择药品
  fireEvent.click(screen.getByText('拼音/名称搜索药品'))
  fireEvent.click(await screen.findByRole('option', { name: /阿莫西林/ }))

  // 录入采购单价、批号、有效期
  fireEvent.change(screen.getByLabelText('第1行采购单价'), { target: { value: '15.5' } })
  fireEvent.change(screen.getByLabelText('第1行批号'), { target: { value: 'DIR-LOT-2026' } })
  fireEvent.change(screen.getByLabelText('第1行有效期至'), { target: { value: '2028-12-31' } })

  const submitBtn = screen.getByRole('button', { name: '直接验收入库并记账' })
  expect(submitBtn).toBeEnabled()
  fireEvent.click(submitBtn)

  await waitFor(() => expect(directGoodsReceipt).toHaveBeenCalledTimes(1))
  expect(directGoodsReceipt).toHaveBeenCalledWith(expect.objectContaining({
    stockSiteId: 'site',
    supplierId: 'supplier',
    lines: [expect.objectContaining({
      stockItemId: 'item',
      destinationBinId: 'bin',
      lotNo: 'DIR-LOT-2026',
      expiryDate: '2028-12-31',
      quantity: 1,
      unitPrice: 15.5,
    })],
  }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringContaining('直接采购入库完成')))
})
