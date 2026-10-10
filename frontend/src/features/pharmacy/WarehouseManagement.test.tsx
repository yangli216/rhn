import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { InventoryBalance, InventoryTransactionPage, StockSite } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { WarehouseManagement } from './WarehouseManagement'

const clinicalContext = {
  organization: { id: 'org-1', name: '三江镇中心卫生院' },
  department: { id: 'dept-clinic', name: '全科门诊' },
} as unknown as ClinicalContext

const mockSites = [
  {
    id: 'site-warehouse',
    name: '中心药库',
    code: 'WH-01',
    active: true,
    siteType: 'WAREHOUSE',
    serviceScope: 'MIXED',
    organizationId: 'org-1',
    departmentId: 'dept-warehouse',
  },
  {
    id: 'site-pharmacy',
    name: '门诊药房',
    code: 'PH-01',
    active: true,
    siteType: 'PHARMACY',
    serviceScope: 'OUTPATIENT',
    organizationId: 'org-1',
    departmentId: 'dept-pharmacy',
  },
  {
    id: 'site-dept-store',
    name: '急诊周转库',
    code: 'DS-01',
    active: true,
    siteType: 'DEPARTMENT_STORE',
    serviceScope: 'EMERGENCY',
    organizationId: 'org-1',
    departmentId: 'dept-er',
  },
] as unknown as StockSite[]

function createMockApi(): RhnApi {
  return {
    pharmacy: {
      sites: vi.fn().mockResolvedValue(mockSites),
      suppliers: vi.fn().mockResolvedValue([]),
      goodsReceipts: vi.fn().mockResolvedValue([]),
      stockBins: vi.fn().mockResolvedValue([
        { id: 'bin-1', siteId: 'site-warehouse', name: 'A区货架1', code: 'A-01', binType: 'RACK', active: true },
      ]),
      stockItems: vi.fn().mockResolvedValue([
        {
          id: 'item-1',
          stockSiteId: 'site-warehouse',
          productName: '阿莫西林胶囊',
          productCode: 'AMX-01',
          packageSpec: '0.25g*24粒/盒',
          packageUnitName: '盒',
          status: 'ACTIVE',
          catalogItemId: 'cat-1',
          medicationId: 'med-1',
          traceRequired: false,
        },
      ]),
      balances: vi.fn().mockResolvedValue([]),
      transactions: vi.fn().mockResolvedValue([]),
      transactionPage: vi.fn().mockResolvedValue({
        content: [], page: 0, size: 50, totalElements: 0, totalPages: 0, first: true, last: true,
      }),
      purchaseOrders: vi.fn().mockResolvedValue([]),
      transferOrders: vi.fn().mockResolvedValue([]),
      requisitionOrders: vi.fn().mockResolvedValue([]),
      stocktakingOrders: vi.fn().mockResolvedValue([]),
      inventoryPeriodStatus: vi.fn().mockResolvedValue({ currentPeriod: '2026-09', closed: false }),
      traceCodes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      verifyInventoryAccuracy: vi.fn().mockResolvedValue({ discrepancies: [] }),
      createStockBin: vi.fn(),
      createStockItems: vi.fn(),
      receive: vi.fn(),
    },
  } as unknown as RhnApi
}

function renderComponent(api: RhnApi, context = clinicalContext) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <WarehouseManagement api={api} clinicalContext={context} onNavigate={vi.fn()} />
    </QueryClientProvider>,
  )
  return { ...rendered, queryClient }
}

describe('WarehouseManagement', () => {
  it('uses the top-level warehouse context without rendering an in-module switcher', async () => {
    const api = createMockApi()
    renderComponent(api, {
      organization: { id: 'org-1', name: '三江中心卫生院' },
      department: { id: 'dept-warehouse', name: '中心药库' },
    } as unknown as ClinicalContext)

    await waitFor(() => expect(api.pharmacy.stockBins).toHaveBeenCalledWith('site-warehouse'))
    expect(screen.queryByTestId('warehouse-header-switcher')).not.toBeInTheDocument()
    expect(screen.queryByText('作业库房：')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新建采购/ })).not.toBeDisabled()
  })

  it('derives the active site from the selected pharmacy department context', async () => {
    const api = createMockApi()
    renderComponent(api, {
      organization: { id: 'org-1', name: '三江中心卫生院' },
      department: { id: 'dept-pharmacy', name: '门诊药房' },
    } as unknown as ClinicalContext)

    await waitFor(() => expect(api.pharmacy.stockBins).toHaveBeenCalledWith('site-pharmacy'))
    expect(api.pharmacy.stockBins).not.toHaveBeenCalledWith('site-warehouse')
  })

  it('does not fall back to another site when the current context has no binding', async () => {
    const api = createMockApi()
    renderComponent(api)

    expect(await screen.findByText('当前工作上下文未配置库存站点')).toBeInTheDocument()
    expect(screen.getByText('请使用顶部栏切换到已配置药库、药房或科室库的工作上下文。')).toBeInTheDocument()
    expect(api.pharmacy.stockBins).not.toHaveBeenCalled()
  })

  it('uses shared paginated tables and loads ledger pages from the server', async () => {
    const api = createMockApi()
    const transactionPage = vi.mocked(api.pharmacy.transactionPage)
    transactionPage.mockImplementation(async (_siteId, options = {}) => options.stockItemId ? {
      content: [{
        id: `transaction-${options.page ?? 0}`,
        inventoryPeriodId: 'period-1',
        transactionNo: `IT-${options.page ?? 0}`,
        requestCode: `REQUEST-${options.page ?? 0}`,
        transactionType: 'RECEIPT',
        sourceType: 'OPENING',
        sourceCode: 'OPENING-STOCK',
        occurredAt: '2026-09-04T22:38:12Z',
        postedAt: '2026-09-04T22:38:12Z',
        postedBy: 'operator-1',
        lines: [{
          id: `line-${options.page ?? 0}`,
          sortOrder: 1,
          stockSiteId: 'site-warehouse',
          stockBinId: 'bin-1',
          stockItemId: 'item-1',
          stockLotId: 'lot-1',
          packageId: 'package-1',
          stockStatus: 'AVAILABLE',
          operationQuantity: 1,
          operationUnitCode: '盒',
          baseQuantityFactor: 14,
          quantityDelta: 14,
          unitCost: 0.6,
          amountDelta: 8.4,
        }],
      }],
      page: options.page ?? 0,
      size: options.size ?? 20,
      totalElements: 21,
      totalPages: 2,
      first: (options.page ?? 0) === 0,
      last: (options.page ?? 0) === 1,
      firstEntryQuantityAfter: (options.page ?? 0) === 0 ? 14 : 0,
    } : {
      content: [], page: 0, size: 1, totalElements: 21, totalPages: 21, first: true, last: false,
    })

    renderComponent(api, {
      organization: { id: 'org-1', name: '三江中心卫生院' },
      department: { id: 'dept-warehouse', name: '中心药库' },
    } as unknown as ClinicalContext)

    fireEvent.click(await screen.findByRole('button', { name: /库存查询/ }))
    expect(await screen.findByRole('table', { name: '库存查询结果' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '库存列表分页' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看流水' }))
    expect(await screen.findByRole('table', { name: '药品库存变动流水' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('OPENING-STOCK')).toBeInTheDocument()
    expect(within(dialog).queryByText('IT-0')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('OPENING')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('operator-1')).not.toBeInTheDocument()
    await waitFor(() => expect(transactionPage).toHaveBeenCalledWith('site-warehouse', {
      stockItemId: 'item-1', allPeriods: true, page: 0, size: 20,
    }))

    const ledgerPagination = screen.getByRole('navigation', { name: '药品流水分页' })
    fireEvent.click(within(ledgerPagination).getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(transactionPage).toHaveBeenCalledWith('site-warehouse', {
      stockItemId: 'item-1', allPeriods: true, page: 1, size: 20,
    }))

    fireEvent.change(within(dialog).getByLabelText('查询库存流水'), { target: { value: 'OPENING-STOCK' } })
    await waitFor(() => expect(transactionPage).toHaveBeenCalledWith('site-warehouse', {
      stockItemId: 'item-1', allPeriods: true, query: 'OPENING-STOCK', page: 0, size: 20,
    }))
  })
})


const warehouseContext = { organization: { id: 'org-1', name: '机构' },
  department: { id: 'dept-warehouse', name: '药库' } } as unknown as ClinicalContext
const balance = (cost?: number) => ({ id: 'balance', stockItemId: 'item-1', stockLotId: 'lot',
  stockBinId: 'bin-1', stockStatus: 'AVAILABLE', quantityOnHand: 10, quantityAvailable: 10,
  quantityReserved: 0, quantityFrozen: 0, averageUnitCost: cost }) as InventoryBalance

it('does not report zero stock when a successful balance query later fails', async () => {
  const api = createMockApi()
  vi.mocked(api.pharmacy.balances).mockResolvedValue([balance(4)])
  const { queryClient } = renderComponent(api, warehouseContext)
  fireEvent.click(await screen.findByRole('button', { name: /库存查询/ }))
  await screen.findByRole('table', { name: '库存查询结果' })
  vi.mocked(api.pharmacy.balances).mockRejectedValueOnce(new Error('库存查询失败'))
  await act(() => queryClient.invalidateQueries({ queryKey: ['warehouse-balances', 'site-warehouse'] }))
  expect(await screen.findByText('库存基础数据读取失败')).toBeInTheDocument()
  expect(screen.queryByRole('table', { name: '库存查询结果' })).not.toBeInTheDocument()
  expect(screen.queryByText('零库存')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新读取库存数据' }))
  await screen.findByRole('table', { name: '库存查询结果' })
})

it.each([null, [{ ...balance(4), quantityOnHand: null }]])('rejects missing inventory data instead of showing zeros %#', async rows => {
  const api = createMockApi()
  vi.mocked(api.pharmacy.balances).mockResolvedValue(rows as unknown as InventoryBalance[])
  renderComponent(api, warehouseContext)
  expect(await screen.findByText('库存基础数据读取失败')).toBeInTheDocument()
  expect(screen.queryByText('零库存')).not.toBeInTheDocument()
})

it('does not equate a failed site lookup with an unconfigured organization', async () => {
  const api = createMockApi()
  vi.mocked(api.pharmacy.sites).mockRejectedValue(new Error('站点不可用'))
  renderComponent(api, warehouseContext)
  expect(await screen.findByText('库存站点读取失败')).toBeInTheDocument()
  expect(screen.queryByText('机构未配置任何库存站点')).not.toBeInTheDocument()
})

it('does not count a batch with missing cost as free in the weighted inventory cost', async () => {
  const api = createMockApi()
  vi.mocked(api.pharmacy.balances).mockResolvedValue([balance(4), { ...balance(), id: 'missing-cost' }])
  renderComponent(api, warehouseContext)
  fireEvent.click(await screen.findByRole('button', { name: /库存查询/ }))
  const table = await screen.findByRole('table', { name: '库存查询结果' })
  expect(within(table).getByText('成本未取得')).toBeInTheDocument()
  expect(within(table).queryByText('¥2.00')).not.toBeInTheDocument()
})

function historyPage(anchor?: number): InventoryTransactionPage {
  return { content: ['first', 'second'].map(id => ({ id, transactionNo: id, sourceCode: id,
    occurredAt: '2026-10-03T00:00:00Z', transactionType: 'RECEIPT',
    lines: [{ id: `line-${id}`, stockItemId: 'item-1', stockLotId: 'lot', stockBinId: 'bin-1',
      stockStatus: 'AVAILABLE', quantityDelta: 2 }] })),
    page: 0, size: 20, totalElements: 2, totalPages: 1, first: true, last: true,
    firstEntryQuantityAfter: anchor } as InventoryTransactionPage
}

it('does not borrow current stock or invent zero amounts for missing ledger values', async () => {
  const api = createMockApi()
  vi.mocked(api.pharmacy.balances).mockResolvedValue([balance(4)])
  vi.mocked(api.pharmacy.transactionPage).mockResolvedValue(historyPage())
  renderComponent(api, warehouseContext)
  fireEvent.click(await screen.findByRole('button', { name: /库存查询/ }))
  fireEvent.click(await screen.findByRole('button', { name: '查看流水' }))
  const table = await screen.findByRole('table', { name: '药品库存变动流水' })
  expect(within(table).getAllByText('结存未取得')).toHaveLength(2)
  expect(within(table).getAllByText('金额未取得')).toHaveLength(2)
  expect(within(table).getAllByText('单价未取得')).toHaveLength(2)
  expect(within(table).queryByText('8 → 10')).not.toBeInTheDocument()
})

it('does not infer consecutive balances across filtered-out transactions', async () => {
  const api = createMockApi()
  vi.mocked(api.pharmacy.transactionPage).mockResolvedValue(historyPage(10))
  renderComponent(api, warehouseContext)
  fireEvent.click(await screen.findByRole('button', { name: /库存查询/ }))
  fireEvent.click(await screen.findByRole('button', { name: '查看流水' }))
  await screen.findByRole('table', { name: '药品库存变动流水' })
  expect(screen.getByText('6 → 8')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('查询库存流水'), { target: { value: 'match' } })
  await waitFor(() => expect(api.pharmacy.transactionPage).toHaveBeenCalledWith('site-warehouse', expect.objectContaining({ query: 'match' })))
  await screen.findByText('结存未取得')
  expect(screen.getByText('8 → 10')).toBeInTheDocument()
  expect(screen.queryByText('6 → 8')).not.toBeInTheDocument()
})

it('treats malformed history as an error rather than an empty ledger', async () => {
  const api = createMockApi()
  vi.mocked(api.pharmacy.transactionPage).mockImplementation(async (_siteId, options) => options?.stockItemId
    ? {} as InventoryTransactionPage : historyPage(10))
  renderComponent(api, warehouseContext)
  fireEvent.click(await screen.findByRole('button', { name: /库存查询/ }))
  fireEvent.click(await screen.findByRole('button', { name: '查看流水' }))
  expect(await screen.findByText('库存流水读取失败')).toBeInTheDocument()
  expect(screen.queryByText('暂无库存流水')).not.toBeInTheDocument()
})
