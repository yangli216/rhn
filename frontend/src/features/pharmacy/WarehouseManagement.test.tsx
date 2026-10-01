import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { StockSite } from '../../shared/api'
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
  return render(
    <QueryClientProvider client={queryClient}>
      <WarehouseManagement api={api} clinicalContext={context} onNavigate={vi.fn()} />
    </QueryClientProvider>,
  )
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
