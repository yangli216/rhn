import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { InventoryReconciliationRun, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { InventoryAccuracyManagement } from './InventoryAccuracyManagement'

const passed: InventoryReconciliationRun = {
  id: 'run', stockSiteId: 'site', runNo: 'RECON-REAL', runType: 'MANUAL', status: 'PASSED',
  businessDate: '2026-10-03', startedAt: '2026-10-03T00:00:00Z', completedAt: '2026-10-03T00:00:01Z',
  dimensionCount: 2, issueCount: 0, lines: [],
}

function show(value: unknown = passed, items: StockItem[] = []) {
  const latest = vi.fn().mockResolvedValue(value)
  const packages = vi.fn().mockResolvedValue([])
  const reconcile = vi.fn().mockResolvedValue(passed)
  const balances = vi.fn().mockResolvedValue([])
  const openPackage = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const api = { pharmacy: { latestInventoryReconciliation: latest, openPackages: packages,
    lots: vi.fn().mockResolvedValue([]), reconcileInventory: reconcile, balances, openPackage } } as unknown as RhnApi
  render(<QueryClientProvider client={queryClient}><InventoryAccuracyManagement api={api}
    siteId="site" items={items} bins={[]} /></QueryClientProvider>)
  return { queryClient, latest, packages, reconcile, balances, openPackage }
}

it('only reports a verified completed reconciliation and does not claim a physical count', async () => {
  show()
  expect(await screen.findByText('本次账目校验通过')).toBeInTheDocument()
  expect(screen.getByText('本次已校验维度内未发现账目差异，不替代实物盘点。')).toBeInTheDocument()
  expect(screen.getByText('未记录')).toBeInTheDocument()
  expect(screen.queryByText('系统任务')).not.toBeInTheDocument()
})

it.each([
  ['FAILED', '库存校验未成功完成'], ['RUNNING', '库存校验尚在执行，暂不能确认结论。'],
  ['UNRECOGNIZED', '无法确认库存校验结论'],
])('does not turn empty lines into success for %s', async (status, message) => {
  show({ ...passed, status, completedAt: undefined })
  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(screen.queryByText('本次账目校验通过')).not.toBeInTheDocument()
})

it('distinguishes a run with no inventory dimensions from a populated reconciliation', async () => {
  show({ ...passed, dimensionCount: 0 })
  expect(await screen.findByText('本次没有可校验的库存维度')).toBeInTheDocument()
  expect(screen.queryByText('本次账目校验通过')).not.toBeInTheDocument()
})

it('preserves the legitimate absence of previous runs without inventing zero metrics', async () => {
  show(null)
  expect(await screen.findByText('尚未执行库存校验')).toBeInTheDocument()
  expect(screen.getByText('校验维度').textContent).toContain('—')
  expect(screen.getByText('差异项').textContent).toContain('—')
})

it.each([
  {}, { ...passed, stockSiteId: 'other' }, { ...passed, dimensionCount: -1 },
  { ...passed, issueCount: 1 }, { ...passed, completedAt: undefined },
  { ...passed, status: 'ISSUES' }, { ...passed, lines: null },
])('rejects incomplete or inconsistent results %#', async value => {
  show(value)
  expect(await screen.findByText('库存校验结果读取失败')).toBeInTheDocument()
  expect(screen.queryByText('本次账目校验通过')).not.toBeInTheDocument()
  expect(screen.queryByText('尚未执行库存校验')).not.toBeInTheDocument()
})

it('hides a previously passed result after refresh failure and permits retry', async () => {
  const { queryClient, latest } = show()
  await screen.findByText('本次账目校验通过')
  latest.mockRejectedValueOnce(new Error('校验查询不可用'))
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-reconciliation-latest', 'site'] }))
  expect(await screen.findByText('库存校验结果读取失败')).toBeInTheDocument()
  expect(screen.queryByText('本次账目校验通过')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新读取校验结果' }))
  expect(await screen.findByText('本次账目校验通过')).toBeInTheDocument()
})

it('does not retain a green result when a new reconciliation fails or returns no result', async () => {
  const { reconcile } = show()
  await screen.findByText('本次账目校验通过')
  reconcile.mockRejectedValueOnce(new Error('校验执行失败')).mockResolvedValueOnce(null)
  fireEvent.click(screen.getByRole('button', { name: '立即校验' }))
  expect(await screen.findByText('库存校验结果读取失败')).toBeInTheDocument()
  expect(screen.queryByText('本次账目校验通过')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '立即校验' }))
  await screen.findByText('库存校验结果不完整或计数不一致，请重新读取。')
  expect(screen.queryByText('本次账目校验通过')).not.toBeInTheDocument()
})

it('shows actual discrepancy quantities', async () => {
  show({ ...passed, status: 'ISSUES', issueCount: 1, lines: [{ id: 'line', issueType: 'LEDGER_BALANCE',
    expectedQuantity: 8, actualQuantity: 3, differenceQuantity: -5, severity: 'ERROR', description: '余额差异' }] })
  expect(await screen.findByText('余额差异')).toBeInTheDocument()
  expect(screen.getByText('-5')).toBeInTheDocument()
  expect(screen.queryByText('本次账目校验通过')).not.toBeInTheDocument()
})

it('does not turn failed or malformed package queries into an empty ledger', async () => {
  const { queryClient, packages } = show()
  await screen.findByText('暂无拆零包装')
  packages.mockRejectedValueOnce(new Error('拆零查询失败')).mockResolvedValueOnce(null).mockResolvedValueOnce([])
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-open-packages', 'site'] }))
  expect(await screen.findByText('拆零包装台账读取失败')).toBeInTheDocument()
  expect(screen.queryByText('暂无拆零包装')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新读取拆零台账' }))
  await screen.findByText('拆零包装台账返回不完整或数量无效，请重新读取。')
  expect(screen.queryByText('暂无拆零包装')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新读取拆零台账' }))
  await waitFor(() => expect(screen.getByText('暂无拆零包装')).toBeInTheDocument())
})


it('blocks opening a package when stock lookup fails, including after a successful lookup', async () => {
  const { balances, queryClient, openPackage } = show(passed, [{ id: 'item', splitAllowed: true,
    productName: '真实药品', productCode: 'ITEM' } as StockItem])
  balances.mockRejectedValueOnce(new Error('库存读取不可用')).mockResolvedValue([{ stockBinId: 'bin',
    stockLotId: 'lot', stockStatus: 'AVAILABLE', quantityOnHand: 10, quantityAvailable: 10, lotNo: 'LOT', baseUnitCode: '片' }])
  fireEvent.click(screen.getByRole('button', { name: '登记拆零' }))
  expect(await screen.findByText('可开包库存读取失败')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认开包' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '重新读取库存' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '确认开包' })).toBeEnabled())
  balances.mockRejectedValueOnce(new Error('库存刷新失败'))
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-open-package-balances', 'site', 'item'] }))
  expect(await screen.findByText('可开包库存读取失败')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认开包' })).toBeDisabled()
  expect(openPackage).not.toHaveBeenCalled()
})
