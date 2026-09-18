import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
})
