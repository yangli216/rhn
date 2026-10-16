import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Organization } from '../../shared/model'
import type { RhnApi, Supplier } from '../../shared/rhnApi'
import { BusinessPartnerManagement } from './BusinessPartnerManagement'

const organization: Organization = { id: '362387869790211', code: 'ORG01', name: '青禾镇中心卫生院', tenantId: '362387869790209' }

const demoSupplier: Supplier = {
  id: '362387869980101',
  revision: 0,
  tenantId: '362387869790209',
  organizationId: '362387869790211',
  code: 'SUP001',
  name: '国药控股分销中心有限公司',
  unifiedCreditCode: '91310000744222384U',
  licenseNo: '沪AA0210001',
  licenseValidTo: '2028-12-31',
  contactName: '李建国',
  contactPhone: '13812345678',
  status: 'ACTIVE',
  statusText: '已启用',
  validFrom: '2026-01-01',
  validTo: '2030-12-31',
}

function renderComponent(apiOverrides: Partial<RhnApi> = {}, initialEntry = '/settings/partners?tab=suppliers') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const defaultApi = {
    dictionaries: { resolve: vi.fn().mockResolvedValue([]) },
    masterData: { manufacturers: vi.fn().mockResolvedValue([]) },
    pharmacy: {
      suppliers: vi.fn().mockResolvedValue([demoSupplier]),
      supplierStatus: vi.fn().mockResolvedValue({}),
      createSupplier: vi.fn().mockResolvedValue({}),
      updateSupplier: vi.fn().mockResolvedValue({}),
    },
    ...apiOverrides,
  } as unknown as RhnApi

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <BusinessPartnerManagement api={defaultApi} organization={organization} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
    api: defaultApi,
  }
}

describe('BusinessPartnerManagement', () => {
  it('renders query and reset buttons with default standard size without ui-button--sm', async () => {
    renderComponent()

    const queryBtn = screen.getByRole('button', { name: '查询' })
    const resetBtn = screen.getByRole('button', { name: '重置' })

    expect(queryBtn).toBeInTheDocument()
    expect(resetBtn).toBeInTheDocument()

    // Ensure buttons adhere to standard height specification and do not have the compact row-only 'ui-button--sm' class
    expect(queryBtn.className).not.toContain('ui-button--sm')
    expect(resetBtn.className).not.toContain('ui-button--sm')
    expect(queryBtn.className).toContain('ui-button--md')
    expect(resetBtn.className).toContain('ui-button--md')
  })

  it('displays supplier data in the table', async () => {
    renderComponent()

    expect(await screen.findByText('国药控股分销中心有限公司')).toBeInTheDocument()
    expect(screen.getByTitle('供应商编码：SUP001')).toBeInTheDocument()
    expect(screen.getByText('91310000744222384U')).toBeInTheDocument()
    expect(screen.getByText('李建国')).toBeInTheDocument()
  })

  it('handles keyword input and reset correctly', async () => {
    renderComponent()

    await screen.findByText('国药控股分销中心有限公司')

    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: '国药' } })
    expect(searchInput).toHaveValue('国药')

    const queryBtn = screen.getByRole('button', { name: '查询' })
    fireEvent.click(queryBtn)

    const resetBtn = screen.getByRole('button', { name: '重置' })
    fireEvent.click(resetBtn)
    expect(searchInput).toHaveValue('')
  })
})
