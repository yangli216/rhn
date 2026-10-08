import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { InventoryPeriod, PeriodCloseRun } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { InventoryPeriodManagement } from './InventoryPeriodManagement'

const period = { id: 'period', stockSiteId: 'site', periodCode: '202610', periodFrom: '2026-10-01',
  periodTo: '2026-10-31', status: 'OPEN' } as InventoryPeriod
const run = { id: 'run', stockSiteId: 'site', inventoryPeriodId: 'period', runNo: 'REAL-CLOSE',
  status: 'VALIDATED', startedAt: '2026-10-03T00:00:00Z', dimensionCount: 1, differenceCount: 0,
  totals: [{ valuationBasis: 'COST', currencyCode: 'CNY', openingValue: 0, movementAmount: 10,
    valuationAdjustmentAmount: 0, roundingAdjustmentAmount: 0, closingValue: 10, balanceValue: 10, valueDifference: 0 }],
} as PeriodCloseRun

function show(runValue: unknown = [run], periodValue: unknown = [period]) {
  const periods = vi.fn().mockResolvedValue(periodValue)
  const runs = vi.fn().mockResolvedValue(runValue)
  const differences = vi.fn().mockResolvedValue([])
  const prepare = vi.fn().mockResolvedValue(run)
  const post = vi.fn().mockResolvedValue({ ...run, status: 'POSTED' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const api = { pharmacy: { inventoryPeriods: periods, periodCloseRuns: runs, periodCloseDifferences: differences,
    preparePeriodClose: prepare, postPeriodClose: post } } as unknown as RhnApi
  render(<QueryClientProvider client={queryClient}><InventoryPeriodManagement api={api} siteId="site"
    items={[]} bins={[]} /></QueryClientProvider>)
  return { queryClient, periods, runs, differences, prepare, post }
}

it('enables closing only for a validated complete zero-difference result', async () => {
  show()
  await screen.findByText('本次预检未发现差异')
  expect(screen.getByRole('button', { name: '正式月结' })).toBeEnabled()
  expect(screen.getAllByText('CNY 10.00').length).toBeGreaterThan(0)
})

it.each([
  ['FAILED', '月结预检执行失败'], ['RUNNING', '月结预检尚未完成，暂不能确认结论。'], ['UNKNOWN', '无法确认月结状态'],
])('does not turn zero differences into success for %s', async (status, message) => {
  show([{ ...run, status, totals: [] }])
  await screen.findByText(message)
  expect(screen.queryByText('本次预检未发现差异')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '正式月结' })).toBeDisabled()
  expect(screen.getAllByText('金额未取得').length).toBeGreaterThan(0)
})

it.each([
  null, {}, [null], [{ ...run, totals: [] }], [{ ...run, differenceCount: undefined }],
  [{ ...run, totals: [{ ...run.totals[0], closingValue: undefined }] }],
  [{ ...run, totals: [{ ...run.totals[0], balanceValue: 20 }] }],
  [{ ...run, inventoryPeriodId: 'different-period' }],
])('rejects incomplete or contradictory runs %#', async value => {
  show(value)
  await screen.findByText('月结预检结果不可用')
  expect(screen.queryByText('本次预检未发现差异')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '正式月结' })).toBeDisabled()
})

it('does not describe a posted batch as ready to close again', async () => {
  show([{ ...run, status: 'POSTED' }], [{ ...period, status: 'CLOSED' }])
  await screen.findByText('本批次已正式月结')
  expect(screen.queryByText('本次预检未发现差异')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '正式月结' })).toBeDisabled()
})

it('does not mistake unavailable periods for an uninitialized warehouse', async () => {
  show([run], null)
  await screen.findByText('库存期间读取失败')
  expect(screen.queryByText('尚未启用库存期间')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '启用本月期间' })).not.toBeInTheDocument()
})

it('invalidates an open confirmation after a failed refresh', async () => {
  const { queryClient, runs, post } = show()
  await screen.findByText('本次预检未发现差异')
  fireEvent.click(screen.getByRole('button', { name: '正式月结' }))
  expect(screen.getByRole('button', { name: '确认正式月结' })).toBeEnabled()
  runs.mockRejectedValueOnce(new Error('月结服务不可用'))
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-period-close-runs', 'period'] }))
  await screen.findByText('当前预检结果不可用')
  expect(screen.getByRole('button', { name: '确认正式月结' })).toBeDisabled()
  expect(screen.queryByText('预检差异为 0，数量账与成本账均已勾稽。')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认正式月结' }))
  expect(post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  fireEvent.click(screen.getByRole('button', { name: '重新读取月结批次' }))
  await screen.findByText('本次预检未发现差异')
})

it('does not retain a previous successful precheck when a new one fails', async () => {
  const { prepare } = show()
  await screen.findByText('本次预检未发现差异')
  prepare.mockRejectedValueOnce(new Error('预检失败'))
  fireEvent.click(screen.getByRole('button', { name: '重新预检' }))
  await screen.findByText('月结预检结果不可用')
  expect(screen.queryByText('本次预检未发现差异')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '正式月结' })).toBeDisabled()
})

it('does not treat missing difference details as a passed precheck', async () => {
  const { differences, queryClient } = show([{ ...run, differenceCount: 1 }])
  await screen.findByText('差异明细未取得')
  expect(screen.getByRole('button', { name: '正式月结' })).toBeDisabled()
  differences.mockRejectedValueOnce(new Error('差异查询不可用'))
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-period-close-differences', 'run'] }))
  await screen.findByText('月结差异明细读取失败')
  expect(screen.queryByText('本次预检未发现差异')).not.toBeInTheDocument()
})

it('uses the returned currency instead of labelling every value as CNY', async () => {
  show([{ ...run, totals: [{ ...run.totals[0], currencyCode: 'USD' }] }])
  await screen.findByText('本次预检未发现差异')
  expect(screen.getAllByText('USD 10.00').length).toBeGreaterThan(0)
  expect(screen.queryByText('CNY')).not.toBeInTheDocument()
})

it('does not dismiss the confirmation when posting returns no actual result', async () => {
  const { post } = show()
  await screen.findByText('本次预检未发现差异')
  post.mockResolvedValueOnce(null)
  fireEvent.click(screen.getByRole('button', { name: '正式月结' }))
  fireEvent.click(screen.getByRole('button', { name: '确认正式月结' }))
  await waitFor(() => expect(post).toHaveBeenCalledOnce())
  await screen.findByText('月结预检记录不完整，无法确认预检结论。')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByText('本批次已正式月结')).not.toBeInTheDocument()
})
