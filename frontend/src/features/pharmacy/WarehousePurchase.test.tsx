import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { GoodsReceipt, PurchaseOrder, StockBin, StockItem, StockSite } from '../../shared/api'
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
  const historyOrder = {
    id: 'history-po',
    orderNo: 'PO-HIST',
    lines: [{ id: 'hist-line', stockItemId: 'item', unitPrice: 12.8 }],
  } as unknown as PurchaseOrder
  const testProduct = {
    id: 'item',
    prices: [
      { sdStatus: 'ACTIVE', sdPriceType: 'PURCHASE', price: 12.8, validFrom: '2020-01-01' },
      { sdStatus: 'ACTIVE', sdPriceType: 'SALE', price: 18.6, validFrom: '2020-01-01' },
    ],
  } as unknown as import('../../shared/api').MedicationProduct

  render(<PurchaseDialog
    api={{ pharmacy: { directGoodsReceipt } } as unknown as RhnApi}
    site={{ id: 'site' } as never}
    suppliers={[{ id: 'supplier', name: '优质供应商' }] as never}
    items={[item]}
    bins={[bin]}
    orders={[historyOrder]}
    products={[testProduct]}
    initialMode="direct"
    onNavigate={vi.fn()}
    onClose={vi.fn()}
    onDone={onDone}
  />)

  // 验证模式 Tab、零售单价列与已移除快捷提示
  expect(screen.getByText('直接采购入库')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('随货凭单号（选填）')).toBeInTheDocument()
  expect(screen.getByText('零售单价')).toBeInTheDocument()
  expect(screen.queryByText(/快捷提示/)).not.toBeInTheDocument()

  // 选择药品
  fireEvent.click(screen.getByRole('combobox', { name: '第1行药品' }))
  fireEvent.click(await screen.findByRole('option', { name: /阿莫西林/ }))

  // 验证采购单价与零售单价自动带出默认值
  expect(screen.getByLabelText('第1行采购单价')).toHaveValue(12.8)
  expect(screen.getByLabelText('第1行零售单价')).toHaveValue(18.6)

  // 录入批号、有效期（采购单价保留自动带出的默认值 12.8）
  // 验证连续键盘键入 20260408 能够自动映射到 2026-04-08
  fireEvent.change(screen.getByLabelText('第1行批号'), { target: { value: 'DIR-LOT-2026' } })
  fireEvent.change(screen.getByLabelText('第1行有效期至'), { target: { value: '20260408' } })
  expect(screen.getByLabelText('第1行有效期至')).toHaveValue('2026-04-08')

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
      expiryDate: '2026-04-08',
      quantity: 1,
      unitPrice: 12.8,
    })],
  }))
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringContaining('直接采购入库完成')))
})

it('keeps direct receipt rows readable until focused and advances through every field before adding a row', async () => {
  const user = userEvent.setup()
  const { PurchaseDialog } = await import('./WarehouseOperations')
  render(<PurchaseDialog api={{ pharmacy: {} } as RhnApi}
    site={{ id: 'site' } as StockSite} suppliers={[{ id: 'supplier', name: '供应商' }] as never}
    items={[item]} bins={[bin]} initialMode="direct"
    onNavigate={vi.fn()} onClose={vi.fn()} onDone={vi.fn()} />)
  const table = screen.getByRole('table', { name: '直接入库药品连续录入' })
  const row = within(table).getAllByRole('row')[1]
  expect(row).toHaveAttribute('data-mode', 'read')
  await user.click(screen.getByRole('combobox', { name: '第1行药品' }))
  expect(row).toHaveAttribute('data-mode', 'edit')
  await user.click(await screen.findByRole('option', { name: /阿莫西林/ }))
  await waitFor(() => expect(screen.getByLabelText('第1行数量')).toHaveFocus())
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('第1行采购单价')).toHaveFocus()
  await user.type(screen.getByLabelText('第1行采购单价'), '12')
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('第1行零售单价')).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('第1行批号')).toHaveFocus()
  await user.type(screen.getByLabelText('第1行批号'), 'LOT-1{Enter}')
  expect(screen.getByLabelText('第1行有效期至')).toHaveFocus()
  const calendar = screen.getByRole('dialog', { name: '日历选择' })
  expect(calendar.parentElement).toBe(document.body)
  await user.type(screen.getByLabelText('第1行有效期至'), '20301231{Enter}')
  expect(screen.queryByRole('dialog', { name: '日历选择' })).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '第1行货位' })).toHaveFocus()
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  await user.keyboard('{Enter}')
  await waitFor(() => expect(screen.getByRole('combobox', { name: '第2行药品' })).toHaveAttribute('aria-expanded', 'true'))
  expect(row).toHaveAttribute('data-mode', 'read')
  expect(within(row).getByText('LOT-1')).toBeInTheDocument()
  expect(within(row).getByText('2030-12-31')).toBeInTheDocument()
  await user.click(screen.getByLabelText('第1行数量'))
  expect(row).toHaveAttribute('data-mode', 'edit')
  expect(screen.getByLabelText('第1行采购单价')).toHaveValue(12)
})

it('renders modern split procurement workbench with KPI cards, document queue and detail pane', async () => {
  const { PurchaseWorkbench } = await import('./WarehouseOperations')
  const testOrder = {
    id: 'po-1',
    orderNo: 'PO202609180743336Z5R1X',
    supplierId: 'supplier-1',
    orderDate: '2026-09-18',
    status: 'COMPLETED',
    lines: [{ id: 'pol-1', stockItemId: 'item', orderedQuantity: 100, remainingQuantity: 0, unitPrice: 12 }],
  } as unknown as PurchaseOrder

  const testReceipt = {
    id: 'gr-1',
    receiptNo: 'GR20260918074333VRTTMTT',
    supplierId: 'supplier-1',
    purchaseOrderId: 'po-1',
    status: 'POSTED',
    receivedAt: '2026-09-18T15:42:00.000Z',
    lines: [{
      id: 'grl-1',
      stockItemId: 'item',
      destinationBinId: 'bin',
      lotNo: 'LOT-202609',
      expiryDate: '2028-12-31',
      deliveredQuantity: 100,
      acceptedQuantity: 100,
      unitCost: 12,
      qualityStatus: 'ACCEPTED',
    }],
  } as unknown as GoodsReceipt

  const mockApi = {
    pharmacy: {
      suppliers: vi.fn().mockResolvedValue([{ id: 'supplier-1', name: '创新隆源' }]),
      purchaseOrders: vi.fn().mockResolvedValue([testOrder]),
      goodsReceipts: vi.fn().mockResolvedValue([testReceipt]),
    },
    masterData: {
      searchMedicationProducts: vi.fn().mockResolvedValue({ content: [], totalElements: 0 }),
    },
  } as unknown as RhnApi

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PurchaseWorkbench
        api={mockApi}
        site={{ id: 'site', organizationId: 'org-1', siteType: 'PHARMACY' } as StockSite}
        items={[item]}
        bins={[bin]}
        onNavigate={vi.fn()}
      />
    </QueryClientProvider>
  )

  // 验证顶部业务 KPI 看板
  expect(await screen.findByText('待审核采购计划')).toBeInTheDocument()
  expect(screen.getByText('在途待到货单')).toBeInTheDocument()
  expect(screen.getByText('待质量检验验收')).toBeInTheDocument()
  expect(screen.getByText('累计入库总额')).toBeInTheDocument()

  // 验证药房指引胶囊
  expect(screen.getByText('药房补货指引')).toBeInTheDocument()

  // 验证左侧工作队列
  expect(screen.getByText(/全部单据/)).toBeInTheDocument()
  expect(screen.getAllByText('PO202609180743336Z5R1X').length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('GR20260918074333VRTTMTT')).toBeInTheDocument()

  // 验证右侧详情全景与药品明细
  expect(screen.getByText('采购用途 / 说明')).toBeInTheDocument()
  expect(screen.getByText('编制计划')).toBeInTheDocument()
  expect(screen.getByText('全部验收入库')).toBeInTheDocument()
  expect(screen.getByText('阿莫西林')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /打印采购单/ })).toBeInTheDocument()

  // 点击左侧验收单，右侧联动切换为到货验收详情
  fireEvent.click(screen.getByText('GR20260918074333VRTTMTT'))
  expect(await screen.findByText('逐批质量验收')).toBeInTheDocument()
  expect(screen.getByText('LOT-202609')).toBeInTheDocument()
  expect(screen.getByText('效期至：2028-12-31')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /打印入库单/ })).toBeInTheDocument()
})
