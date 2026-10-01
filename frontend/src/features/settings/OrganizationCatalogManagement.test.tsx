import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrganizationCatalogManagement } from './OrganizationCatalogManagement'
import { OrganizationCatalogImportDialog } from './BasicDataManagement'
import type { Organization } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'

describe('OrganizationCatalogManagement active search trigger', () => {
  const organization: Organization = {
    id: 'org-test',
    code: 'ORG01',
    name: '测试医院',
  } as unknown as Organization

  let api: any
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    api = {
      masterData: {
        adoptionCandidates: vi.fn().mockResolvedValue({
          content: [
            {
              id: 'cat-1',
              code: 'SRV-001',
              name: '血常规检验',
              adoptionSourceType: 'LOCAL',
              adoption: { orderable: true, executable: true, chargeable: true },
              packages: [],
            },
          ],
          totalPages: 1,
          totalElements: 1,
        }),
      },
      dictionaries: {
        resolve: vi.fn().mockResolvedValue([]),
      },
      organization: {
        list: vi.fn().mockResolvedValue([]),
        catalogSource: vi.fn().mockResolvedValue({ organizationRevision: 1 }),
      },
    } as unknown as RhnApi
  })

  it('renders search input and buttons, and only triggers remote search on Enter or search button', async () => {
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <OrganizationCatalogManagement api={api} organization={organization} canManage={true} />
      </QueryClientProvider>
    )

    const searchInput = await screen.findByRole('searchbox', { name: '搜索中心目录' })
    expect(searchInput).toBeInTheDocument()
    expect(searchInput).toHaveAttribute('placeholder', '项目名称或编码（回车或点击查询）')

    const queryBtn = screen.getByRole('button', { name: '查询' })
    const resetBtn = screen.getByRole('button', { name: '重置' })
    expect(queryBtn).toBeInTheDocument()
    expect(resetBtn).toBeInTheDocument()

    // 初始调用一次
    expect(api.masterData.adoptionCandidates).toHaveBeenCalledWith('org-test', 'SERVICE', '', 0, 20)
    const initialCalls = api.masterData.adoptionCandidates.mock.calls.length

    // 输入字符期间不应发起新的查询
    await user.type(searchInput, '血常规')
    expect(searchInput).toHaveValue('血常规')
    expect(api.masterData.adoptionCandidates.mock.calls.length).toBe(initialCalls)

    // 点击“查询”按钮后触发
    await user.click(queryBtn)
    expect(api.masterData.adoptionCandidates).toHaveBeenLastCalledWith('org-test', 'SERVICE', '血常规', 0, 20)

    // 修改输入，输入“生化”，不按回车也不点查询
    await user.clear(searchInput)
    await user.type(searchInput, '生化')
    expect(searchInput).toHaveValue('生化')
    expect(api.masterData.adoptionCandidates).not.toHaveBeenLastCalledWith('org-test', 'SERVICE', '生化', 0, 20)

    // 按回车键触发
    await user.type(searchInput, '{enter}')
    expect(api.masterData.adoptionCandidates).toHaveBeenLastCalledWith('org-test', 'SERVICE', '生化', 0, 20)

    // 点击“重置”按钮清空并触发空查询
    await user.click(resetBtn)
    expect(searchInput).toHaveValue('')
    expect(api.masterData.adoptionCandidates).toHaveBeenLastCalledWith('org-test', 'SERVICE', '', 0, 20)
  })
})

describe('OrganizationCatalogImportDialog', () => {
  const organization = { id: 'org-test', code: 'ORG01', name: '测试医院' } as unknown as Organization

  it('loads only unadopted items, keeps a cross-search batch, and submits service capabilities', async () => {
    const user = userEvent.setup()
    const adoptionCandidates = vi.fn().mockResolvedValue({
      content: [
        { id: 'cat-1', code: 'SRV-001', name: '血常规检验', itemType: 'SERVICE', centerStatus: 'ACTIVE',
          adoptionSourceType: 'NONE', packages: [] },
        { id: 'cat-2', code: 'SRV-002', name: '肝功能检查', itemType: 'SERVICE', centerStatus: 'ACTIVE',
          adoptionSourceType: 'NONE', packages: [] },
      ],
      page: 0,
      size: 20,
      totalPages: 1,
      totalElements: 2,
    })
    const adoptionBatch = vi.fn().mockResolvedValue({})
    const onCompleted = vi.fn().mockResolvedValue(undefined)
    const api = { masterData: { adoptionCandidates, adoptionBatch } } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <OrganizationCatalogImportDialog api={api} organization={organization} initialItemType="SERVICE"
        onClose={vi.fn()} onCompleted={onCompleted} />
    </QueryClientProvider>)

    expect(await screen.findByRole('dialog', { name: '机构项目调入' })).toBeInTheDocument()
    expect(adoptionCandidates).toHaveBeenCalledWith(
      'org-test', 'SERVICE', '', 0, 20, expect.any(String), true,
    )
    expect(screen.queryByText('本机构')).not.toBeInTheDocument()
    expect(screen.queryByText('共享')).not.toBeInTheDocument()

    await user.click(await screen.findByRole('checkbox', { name: '选择 血常规检验' }))
    const batch = screen.getByRole('complementary', { name: '本批调入配置' })
    expect(within(batch).getByText('血常规检验')).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: '搜索待调入目录' })
    await user.type(search, '肝功')
    await user.click(screen.getByRole('button', { name: '查询' }))
    expect(within(batch).getByText('血常规检验')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认调入 1 项' }))
    expect(adoptionBatch).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-test',
      catalogItemIds: ['cat-1'],
      template: expect.objectContaining({
        orderable: true, executable: true, chargeable: true,
        purchasable: false, stocked: false, dispensable: false, returnable: false,
      }),
    }))
    expect(onCompleted).toHaveBeenCalled()
  })
})
