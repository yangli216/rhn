import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { StockSite } from '../../shared/api'
import type { Session } from '../../shared/model'
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

function createMockApi(): { api: RhnApi; withWorkContextMock: ReturnType<typeof vi.fn> } {
  const pharmacyMock = {
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
  }

  const withWorkContextMock = vi.fn()
  const baseApi = {
    pharmacy: pharmacyMock,
    withWorkContext: withWorkContextMock,
  } as unknown as RhnApi

  withWorkContextMock.mockImplementation((context) => {
    return {
      ...baseApi,
      pharmacy: pharmacyMock,
      workContext: context,
    }
  })

  return { api: baseApi, withWorkContextMock }
}

function renderComponent(props: {
  api: RhnApi
  session?: Session
  context?: ClinicalContext
  onDepartmentChange?: (organizationId: string, departmentId: string) => void
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  const onNavigate = vi.fn()
  const onDepartmentChange = props.onDepartmentChange ?? vi.fn()
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <WarehouseManagement
        api={props.api}
        session={props.session}
        clinicalContext={props.context ?? clinicalContext}
        onNavigate={onNavigate}
        onDepartmentChange={onDepartmentChange}
      />
    </QueryClientProvider>
  )
  return { ...renderResult, onNavigate, onDepartmentChange }
}

describe('WarehouseManagement', () => {
  it('renders top-right warehouse switcher with all hospital sites for administrators', async () => {
    const { api } = createMockApi()
    const adminSession = {
      username: 'admin',
      tenantId: 'tenant-1',
      authorities: ['ROLE_ADMIN'],
      workContexts: [{ organizationId: 'org-1', departmentId: 'dept-clinic' }],
      refreshLoginEnabled: false,
    } as unknown as Session

    renderComponent({ api, session: adminSession })

    // Wait for sites to load
    await waitFor(() => {
      expect(screen.getByTestId('warehouse-header-switcher')).toBeInTheDocument()
    })

    // Current site should fall back to first site '中心药库'
    expect(screen.getByTestId('current-site-code')).toHaveTextContent('WH-01')
    expect(screen.getByText('🛡️ 全局管理')).toBeInTheDocument()

    // No left sidebar anymore
    expect(screen.queryByText('库存站点')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('搜索库房名称或编码…')).not.toBeInTheDocument()
  })

  it('switches site via top-right dropdown, invokes onDepartmentChange, and creates scopedApi with matching departmentId', async () => {
    const user = userEvent.setup()
    const { api, withWorkContextMock } = createMockApi()
    const adminSession = {
      username: 'admin',
      tenantId: 'tenant-1',
      authorities: ['ROLE_ADMIN'],
      workContexts: [{ organizationId: 'org-1', departmentId: 'dept-clinic' }],
      refreshLoginEnabled: false,
    } as unknown as Session

    const onDepartmentChange = vi.fn()
    renderComponent({ api, session: adminSession, onDepartmentChange })

    await waitFor(() => {
      expect(screen.getByTestId('warehouse-header-switcher')).toBeInTheDocument()
    })

    // Open dropdown trigger in top-right switcher
    const switcher = screen.getByTestId('warehouse-header-switcher')
    const trigger = switcher.querySelector('.ui-select__trigger')
    expect(trigger).toBeTruthy()
    await user.click(trigger!)

    // Select '门诊药房' option
    const pharmacyOption = await screen.findByRole('option', { name: /门诊药房/ })
    await user.click(pharmacyOption)

    // Verify current site updated to PH-01
    await waitFor(() => {
      expect(screen.getByTestId('current-site-code')).toHaveTextContent('PH-01')
    })

    // onDepartmentChange should be called to synchronize AppShell global context
    expect(onDepartmentChange).toHaveBeenCalledWith('org-1', 'dept-pharmacy')

    // withWorkContext should have been called with dept-pharmacy to prevent backend mismatch
    expect(withWorkContextMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      departmentId: 'dept-pharmacy',
    }))
  })

  it('strictly filters sites: frontline staff only sees assigned sites, unauthorized sites are completely hidden', async () => {
    const { api } = createMockApi()

    // Frontline operator assigned only to dept-pharmacy
    const frontlineSession = {
      username: 'pharmacist_zhang',
      tenantId: 'tenant-1',
      authorities: ['ROLE_PHARMACY_STAFF'],
      workContexts: [{ organizationId: 'org-1', departmentId: 'dept-pharmacy' }],
      refreshLoginEnabled: false,
    } as unknown as Session

    renderComponent({
      api,
      session: frontlineSession,
      context: {
        organization: { id: 'org-1', name: '三江中心卫生院' },
        department: { id: 'dept-pharmacy', name: '门诊药房' },
      } as unknown as ClinicalContext,
    })

    await waitFor(() => {
      expect(screen.getByTestId('warehouse-header-switcher')).toBeInTheDocument()
    })

    // Frontline operator only has 1 assigned site (门诊药房)
    expect(screen.getByText('门诊药房')).toBeInTheDocument()
    expect(screen.getByTestId('current-site-code')).toHaveTextContent('PH-01')

    // Unauthorized sites (中心药库, 急诊周转库) must NOT appear anywhere in the interface
    expect(screen.queryByText('中心药库')).not.toBeInTheDocument()
    expect(screen.queryByText('WH-01')).not.toBeInTheDocument()
    expect(screen.queryByText('急诊周转库')).not.toBeInTheDocument()
    expect(screen.queryByText('DS-01')).not.toBeInTheDocument()

    // Operations (like 新建采购单) are fully enabled because the user is operating their authorized site
    const newPurchaseOrderBtn = screen.getByRole('button', { name: /新建采购单/ })
    expect(newPurchaseOrderBtn).not.toBeDisabled()
  })

  it('displays empty state when frontline user has no warehouse department authorization', async () => {
    const { api } = createMockApi()

    // General practitioner with no warehouse affiliation
    const doctorSession = {
      username: 'doctor_li',
      tenantId: 'tenant-1',
      authorities: ['ROLE_DOCTOR'],
      workContexts: [{ organizationId: 'org-1', departmentId: 'dept-clinic' }],
      refreshLoginEnabled: false,
    } as unknown as Session

    renderComponent({
      api,
      session: doctorSession,
      context: {
        organization: { id: 'org-1', name: '三江中心卫生院' },
        department: { id: 'dept-clinic', name: '全科门诊' },
      } as unknown as ClinicalContext,
    })

    await waitFor(() => {
      expect(screen.getByText('暂无有权限管辖的库存站点')).toBeInTheDocument()
    })
  })

  it('renders diversified badges and icons for consumables, reagents, equipment, and CSSD sites', async () => {
    const diversifiedSites = [
      {
        id: 'site-consumable',
        name: '医用耗材总库',
        code: 'WH-CONSUMABLE',
        active: true,
        siteType: 'WAREHOUSE',
        serviceScope: 'MIXED',
        organizationId: 'org-1',
        departmentId: 'dept-consumable',
      },
      {
        id: 'site-reagent',
        name: '检验试剂库',
        code: 'WH-REAGENT',
        active: true,
        siteType: 'WAREHOUSE',
        serviceScope: 'MIXED',
        organizationId: 'org-1',
        departmentId: 'dept-reagent',
      },
      {
        id: 'site-equipment',
        name: '设备共享调配中心',
        code: 'WH-EQUIPMENT',
        active: true,
        siteType: 'WAREHOUSE',
        serviceScope: 'MIXED',
        organizationId: 'org-1',
        departmentId: 'dept-equipment',
      },
      {
        id: 'site-cssd',
        name: '消毒供应中心',
        code: 'MED-CSSD',
        active: true,
        siteType: 'DEPARTMENT_STORE',
        serviceScope: 'MIXED',
        organizationId: 'org-1',
        departmentId: 'dept-cssd',
      },
    ] as unknown as StockSite[]

    const pharmacyMock = {
      sites: vi.fn().mockResolvedValue(diversifiedSites),
      stockBins: vi.fn().mockResolvedValue([]),
      stockItems: vi.fn().mockResolvedValue([]),
      balances: vi.fn().mockResolvedValue([]),
      transactions: vi.fn().mockResolvedValue([]),
      purchaseOrders: vi.fn().mockResolvedValue([]),
      transferOrders: vi.fn().mockResolvedValue([]),
      requisitionOrders: vi.fn().mockResolvedValue([]),
      stocktakingOrders: vi.fn().mockResolvedValue([]),
      inventoryPeriodStatus: vi.fn().mockResolvedValue({ currentPeriod: '2026-09', closed: false }),
      traceCodes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      verifyInventoryAccuracy: vi.fn().mockResolvedValue({ discrepancies: [] }),
    }
    const baseApi = {
      pharmacy: pharmacyMock,
      withWorkContext: vi.fn().mockReturnValue({ pharmacy: pharmacyMock }),
    } as unknown as RhnApi

    const adminSession = {
      username: 'admin',
      tenantId: 'tenant-1',
      authorities: ['ROLE_ADMIN'],
      workContexts: [{ organizationId: 'org-1', departmentId: 'dept-consumable' }],
      refreshLoginEnabled: false,
    } as unknown as Session

    renderComponent({ api: baseApi, session: adminSession })

    await waitFor(() => {
      expect(screen.getByTestId('warehouse-header-switcher')).toBeInTheDocument()
    })

    // Current site is first one: 医用耗材总库 with 📦 icon
    expect(screen.getByText('📦 医用耗材总库')).toBeInTheDocument()
    expect(screen.getByTestId('current-site-code')).toHaveTextContent('WH-CONSUMABLE')
  })
})

