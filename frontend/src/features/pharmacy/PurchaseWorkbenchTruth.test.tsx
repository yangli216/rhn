import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { GoodsReceipt, PurchaseOrder, StockSite } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { PurchaseWorkbench } from './WarehouseOperations'

const receipt = (changes: Record<string, unknown> = {}) => ({
  id: 'receipt', receiptNo: 'REAL-RECEIPT', supplierId: 'supplier', purchaseOrderId: 'order', stockSiteId: 'site',
  status: 'RECEIVED', receivedAt: '2026-10-03T00:00:00Z',
  lines: [{ id: 'line', stockItemId: 'item', packageId: 'box', destinationBinId: 'actual-bin',
    lotNo: 'ACTUAL-LOT', deliveredQuantity: 12, qualityStatus: 'PENDING', unitCost: 4, ...changes }],
}) as GoodsReceipt

function show(value: unknown, orderValues: PurchaseOrder[] = []) {
  const receipts = vi.fn().mockResolvedValue(value)
  const orders = vi.fn().mockResolvedValue(orderValues)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = { pharmacy: { suppliers: vi.fn().mockResolvedValue([{ id: 'supplier', name: '真实供应商' }]),
    purchaseOrders: orders, goodsReceipts: receipts },
    masterData: { searchMedicationProducts: vi.fn().mockResolvedValue({ content: [] }) } } as unknown as RhnApi
  render(<QueryClientProvider client={queryClient}><PurchaseWorkbench api={api}
    site={{ id: 'site', organizationId: 'org', siteType: 'WAREHOUSE' } as StockSite} items={[]} bins={[]}
    onNavigate={vi.fn()} /></QueryClientProvider>)
  return { receipts, queryClient }
}

it('does not treat uninspected deliveries as accepted stock or invent a bin and unit', async () => {
  show([receipt()])
  expect(await screen.findByText('未验收')).toBeInTheDocument()
  expect(screen.getByText('合格总数：').textContent).toContain('数量未取得')
  expect(screen.getAllByText('金额未取得').length).toBeGreaterThan(0)
  expect(screen.getByText('货位 actual-bin')).toBeInTheDocument()
  expect(screen.queryByText('中心合格品库')).not.toBeInTheDocument()
  expect(screen.queryByText('通用规格')).not.toBeInTheDocument()
  expect(screen.queryByText('1盒=1粒')).not.toBeInTheDocument()
})

it('preserves fully rejected zero acceptance and does not invent a rejection reason', async () => {
  show([{ ...receipt({ acceptedQuantity: 0, rejectedQuantity: 12, qualityStatus: 'REJECTED' }), status: 'REJECTED' }])
  await screen.findByText('合格总数：')
  expect(screen.getByText('合格总数：').textContent).toBe('合格总数：0')
  expect(screen.getByText(/原因未记录/)).toBeInTheDocument()
  expect(screen.queryByText(/\(破损\)/)).not.toBeInTheDocument()
  expect(screen.getByText('入库采购总额：').textContent).toContain('0.00')
})

it('does not show a zero posted amount when accepted inventory has no recorded cost', async () => {
  show([{ ...receipt({ acceptedQuantity: 12, rejectedQuantity: 0, unitCost: undefined }), status: 'POSTED' }])
  await screen.findByText('累计入库总额')
  expect(screen.getByText('累计入库总额').parentElement?.textContent).toContain('金额未取得')
  expect(screen.getByText('入库采购总额：').textContent).toContain('金额未取得')
})

it('shows actual zero purchase prices', async () => {
  show([{ ...receipt({ acceptedQuantity: 12, rejectedQuantity: 0, unitCost: 0 }), status: 'POSTED' }])
  await screen.findByText('累计入库总额')
  expect(screen.getByText('累计入库总额').parentElement?.textContent).toContain('0.00')
  expect(screen.queryByText('金额未取得')).not.toBeInTheDocument()
})

it('hides stale documents and totals after failure and allows retry', async () => {
  const { queryClient, receipts } = show([{ ...receipt({ acceptedQuantity: 12 }), status: 'POSTED' }])
  await screen.findByText('累计入库总额')
  receipts.mockRejectedValueOnce(new Error('单据查询不可用'))
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-goods-receipts', 'site'] }))
  expect(await screen.findByText('采购验收数据读取失败')).toBeInTheDocument()
  expect(screen.queryByText('累计入库总额')).not.toBeInTheDocument()
  expect(screen.queryByText('暂无作业单据')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新读取采购验收数据' }))
  await screen.findByText('累计入库总额')
})

it.each([null, {}, [null], [{ ...receipt(), lines: null }]])('rejects malformed lists without reporting no documents %#', async value => {
  show(value)
  expect(await screen.findByText('采购验收数据读取失败')).toBeInTheDocument()
  expect(screen.queryByText('暂无作业单据')).not.toBeInTheDocument()
})
