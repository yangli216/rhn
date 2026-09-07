import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { DispenseRoute, RhnApi } from '../../shared/rhnApi'
import { DispenseRouteSettings } from './DispenseRouteSettings'

type PharmacySite = Awaited<ReturnType<RhnApi['pharmacy']['sites']>>[number]

const mockPharmacySites: PharmacySite[] = [
  {
    id: 'site-1',
    revision: 1,
    organizationId: 'org-1',
    code: 'SITE-OPD',
    name: '门诊药房',
    siteType: 'PHARMACY',
    serviceScope: 'OUTPATIENT',
    active: true,
    validFrom: '2026-01-01',
  },
  {
    id: 'site-2',
    revision: 1,
    organizationId: 'org-1',
    code: 'SITE-INP',
    name: '住院药房',
    siteType: 'PHARMACY',
    serviceScope: 'INPATIENT',
    active: true,
    validFrom: '2026-01-01',
  },
  {
    id: 'site-3',
    revision: 1,
    organizationId: 'org-1',
    code: 'SITE-HERBAL',
    name: '中药房',
    siteType: 'PHARMACY',
    serviceScope: 'MIXED',
    active: true,
    validFrom: '2026-01-01',
  },
]

const mockDepartments = [
  {
    id: 'dept-1',
    organizationId: 'org-1',
    code: 'WARD01',
    name: '综合病区',
    sdOrgStatus: 'ACTIVE',
    sdDepartmentType: 'CLINICAL_INPATIENT',
  },
  {
    id: 'dept-2',
    organizationId: 'org-1',
    code: 'OPD01',
    name: '中医门诊',
    sdOrgStatus: 'ACTIVE',
    sdDepartmentType: 'CLINICAL_OUTPATIENT',
  },
]

const mockMedicationTypes = [
  { code: 'HERBAL', name: '中药饮片', sortOrder: 1 },
  { code: 'WESTERN', name: '西药', sortOrder: 2 },
]

const mockRoutes: DispenseRoute[] = [
  {
    id: 'route-1',
    revision: 1,
    organizationId: 'org-1',
    code: 'INPATIENT-GENERAL-WARD',
    name: '住院病区默认发药药房',
    careSetting: 'INPATIENT',
    sourceDepartmentId: 'dept-1',
    targetStockSiteId: 'site-2',
    active: true,
    validFrom: '2026-01-01',
    description: '综合病区住院医嘱统一流向住院药房',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'route-2',
    revision: 1,
    organizationId: 'org-1',
    code: 'OUTPATIENT-DEFAULT',
    name: '门诊药品默认发药药房',
    careSetting: 'OUTPATIENT',
    targetStockSiteId: 'site-1',
    active: true,
    validFrom: '2026-01-01',
    description: '未命中专项规则的门诊药品统一流向门诊药房',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'route-3',
    revision: 1,
    organizationId: 'org-1',
    code: 'OUTPATIENT-HERBAL',
    name: '中药饮片发往中药房',
    careSetting: 'OUTPATIENT',
    medicationType: 'HERBAL',
    targetStockSiteId: 'site-3',
    active: true,
    validFrom: '2026-01-01',
    description: '机构内中药饮片及配方颗粒统一由中药房调剂发药',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'route-4',
    revision: 1,
    organizationId: 'org-1',
    code: 'OUTPATIENT-VIP-HERBAL',
    name: '中医门诊特制膏方路由',
    careSetting: 'OUTPATIENT',
    sourceDepartmentId: 'dept-2',
    medicationType: 'HERBAL',
    targetStockSiteId: 'site-3',
    active: false,
    validFrom: '2026-01-01',
    description: '中医门诊开立膏方专属分流',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

const mockClinicalContext = {
  organization: {
    id: 'org-1',
    code: 'ORG01',
    name: '示范医院',
    sdOrgType: 'GENERAL_HOSPITAL',
  },
  department: {
    id: 'dept-1',
    code: 'WARD01',
    name: '综合病区',
    sdDepartmentType: 'CLINICAL_INPATIENT',
  },
  practitioner: {
    id: 'prac-1',
    name: '李医生',
    title: '主治医师',
  },
} as unknown as ClinicalContext

describe('DispenseRouteSettings', () => {
  let queryClient: QueryClient
  let mockApi: Partial<RhnApi>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    mockApi = {
      pharmacy: {
        dispenseRoutes: vi.fn().mockResolvedValue(mockRoutes),
        sites: vi.fn().mockResolvedValue(mockPharmacySites),
        createDispenseRoute: vi.fn().mockResolvedValue(mockRoutes[0]),
        updateDispenseRoute: vi.fn().mockResolvedValue(mockRoutes[0]),
      } as unknown as RhnApi['pharmacy'],
      organization: {
        departments: vi.fn().mockResolvedValue(mockDepartments),
      } as unknown as RhnApi['organization'],
      dictionaries: {
        resolve: vi.fn().mockResolvedValue(mockMedicationTypes),
      } as unknown as RhnApi['dictionaries'],
    }
  })

  function renderComponent() {
    return render(
      <QueryClientProvider client={queryClient}>
        <DispenseRouteSettings api={mockApi as RhnApi} clinicalContext={mockClinicalContext} />
      </QueryClientProvider>
    )
  }

  it('renders 4-card KPI metric summary with outpatient and inpatient default pharmacies', async () => {
    renderComponent()

    // 1. 全院生效路由 (3 条生效，1 条停用，共 4 条)
    expect(await screen.findByText(/共 4 条配置/)).toBeInTheDocument()
    expect(screen.getByText('全院生效路由')).toBeInTheDocument()
    expect(screen.getByText('条生效').parentElement).toHaveTextContent('3 条生效')

    // 2. 门诊默认药房
    expect(screen.getByText('门诊默认药房')).toBeInTheDocument()
    expect(screen.getByTitle('门诊药房')).toBeInTheDocument()

    // 3. 住院默认药房
    expect(screen.getByText('住院默认药房')).toBeInTheDocument()
    expect(screen.getByTitle('住院药房')).toBeInTheDocument()

    // 4. 专项精准分流
    expect(screen.getByText('专项精准分流')).toBeInTheDocument()
    expect(screen.getByText(/1 类药品 \/ 1 科室/)).toBeInTheDocument()
  })

  it('renders table with 4-level priority badges and clear department / medication info', async () => {
    renderComponent()

    // Table rows
    expect(await screen.findByText('住院病区默认发药药房')).toBeInTheDocument()
    expect(screen.getByText('门诊药品默认发药药房')).toBeInTheDocument()
    expect(screen.getByText('中药饮片发往中药房')).toBeInTheDocument()
    expect(screen.getByText('中医门诊特制膏方路由')).toBeInTheDocument()

    // Priority badges
    expect(screen.getByText('P1 · 复合专项')).toBeInTheDocument()
    expect(screen.getByText('P2 · 药品专项')).toBeInTheDocument()
    expect(screen.getByText('P3 · 科室专项')).toBeInTheDocument()
    expect(screen.getByText('P4 · 默认兜底')).toBeInTheDocument()

    // Highlights for dedicated departments and medications
    expect(screen.getByText('综合病区')).toBeInTheDocument()
    expect(screen.getAllByText('中药饮片').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('全部开方科室').length).toBeGreaterThan(0)
    expect(screen.getAllByText('全部药品类型').length).toBeGreaterThan(0)
  })

  it('filters rules dynamically by search keyword and care setting', async () => {
    const user = userEvent.setup()
    renderComponent()

    expect(await screen.findByText('住院病区默认发药药房')).toBeInTheDocument()

    // Search by keyword "中药"
    const searchInput = screen.getByPlaceholderText('搜索规则名称、编码、科室、药品或药房…')
    await user.type(searchInput, '中药')

    // Should match route-3 (中药饮片发往中药房) and route-4 (中医门诊特制膏方路由)
    expect(screen.getByText('中药饮片发往中药房')).toBeInTheDocument()
    expect(screen.getByText('中医门诊特制膏方路由')).toBeInTheDocument()
    expect(screen.queryByText('住院病区默认发药药房')).not.toBeInTheDocument()

    // Reset search
    await user.clear(searchInput)
    expect(screen.getByText('住院病区默认发药药房')).toBeInTheDocument()
  })

  it('evaluates and simulates route resolution accurately in interactive sandbox', async () => {
    const user = userEvent.setup()
    renderComponent()

    // Click to open simulator
    const toggleBtn = await screen.findByRole('button', { name: '路由测算沙盒' })
    await user.click(toggleBtn)

    expect(screen.getByText('医嘱发药路由测算沙盒')).toBeInTheDocument()

    // Default simulation: OUTPATIENT, no dept, no med -> should match OUTPATIENT-DEFAULT (site-1 门诊药房)
    await waitFor(() => {
      expect(screen.getByText(/命中规则：门诊药品默认发药药房/)).toBeInTheDocument()
      expect(screen.getByText(/未命中任何专项规则，按场景通用默认规则兜底流向/)).toBeInTheDocument()
    })

    // Selected row in table is highlighted with simulated match pill
    expect(screen.getByText('🎯 测算命中')).toBeInTheDocument()
  })

  it('supports quick toggling active status directly from table row', async () => {
    const user = userEvent.setup()
    renderComponent()

    expect(await screen.findByText('住院病区默认发药药房')).toBeInTheDocument()

    // Find the "停用" button
    const deactivateButtons = screen.getAllByRole('button', { name: '停用' })
    expect(deactivateButtons.length).toBeGreaterThan(0)

    await user.click(deactivateButtons[0])

    // First active rule in sorted order is route-3 (P2 OUTPATIENT-HERBAL)
    expect(mockApi.pharmacy?.updateDispenseRoute).toHaveBeenCalledWith(
      'route-3',
      1,
      expect.objectContaining({
        active: false,
        code: 'OUTPATIENT-HERBAL',
      })
    )
  })

  it('opens create modal with live priority preview guidance', async () => {
    const user = userEvent.setup()
    renderComponent()

    const addBtn = await screen.findByRole('button', { name: '新增规则' })
    await user.click(addBtn)

    const dialog = screen.getByRole('dialog', { name: /新增发药路由/ })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/预计匹配层级：/)).toBeInTheDocument()
    expect(screen.getAllByText(/P4 · 默认兜底/).length).toBeGreaterThan(0)
  })
})
