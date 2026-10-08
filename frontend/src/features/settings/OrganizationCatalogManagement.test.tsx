import { act, render, screen, waitFor, within } from '@testing-library/react'
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
              itemType: 'SERVICE', centerStatus: 'ACTIVE',
              adoption: { id: 'adopt-1', revision: 0, catalogItemId: 'cat-1', organizationId: 'org-test',
                orderable: true, executable: true, chargeable: true, purchasable: false,
                stocked: false, dispensable: false, returnable: false,
                sdStatus: 'ACTIVE', sdStatusText: '启用', validFrom: '2026-01-01' },
              packages: [],
            },
          ],
          page: 0, size: 20,
          totalPages: 1,
          totalElements: 1,
        }),
      },
      dictionaries: {
        resolve: vi.fn().mockResolvedValue([]),
      },
      organization: {
        list: vi.fn().mockResolvedValue([]),
        catalogSource: vi.fn().mockResolvedValue({ organizationId: 'org-test', organizationName: '测试医院', organizationRevision: 1, sourceOrganizationId: null, sourceOrganizationName: null }),
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
    await screen.findAllByText('血常规检验')
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
    const adoptionBatch = vi.fn().mockImplementation(async input => ({
      id: 'batch-1', revision: 0, batchType: 'ADOPTION', operationType: 'ADOPT', organizationId: input.organizationId,
      requestCode: input.requestCode, businessDate: input.businessDate, status: 'COMPLETED', totalRows: 1,
      succeededRows: 1, failedRows: 0, createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z', createdBy: 'user',
      rows: [{ id: 'row-1', rowNumber: 1, catalogItemId: 'cat-1', status: 'SUCCEEDED', targetResourceType: 'ORGANIZATION_ADOPTION', targetId: 'adopt-1' }],
    }))
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
    expect(await screen.findByText(/全部调入完成：1 项/)).toBeInTheDocument()
    expect(onCompleted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '完成并刷新列表' }))
    expect(onCompleted).toHaveBeenCalled()
  })
})

const independentSource = { organizationId: 'org-test', organizationName: '测试医院', organizationRevision: 1,
  sourceOrganizationId: null, sourceOrganizationName: null }
const sharedSource = { ...independentSource, sourceOrganizationId: 'source', sourceOrganizationName: '来源医院' }
const catalogueRow = { id: 'cat-1', code: 'S001', name: '真实项目', itemType: 'SERVICE', centerStatus: 'ACTIVE',
  adoptionSourceType: 'NONE', adoption: null, packages: [] }
const cataloguePage = { content: [catalogueRow], totalElements: 1, totalPages: 1, page: 0, size: 20 }
function catalogApi() {
  return {
    organization: { list: vi.fn().mockResolvedValue([{ id: 'source', name: '来源医院', code: 'SOURCE', sdOrgKind: 'LEGAL_ORGANIZATION' }]),
      catalogSource: vi.fn().mockResolvedValue(independentSource), changeCatalogSource: vi.fn() },
    masterData: { adoptionCandidates: vi.fn().mockResolvedValue(cataloguePage) },
    dictionaries: { resolve: vi.fn().mockResolvedValue([{ code: 'SALE', name: '零售价', sortOrder: 1 }]) },
  }
}
function renderCatalog(api = catalogApi()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const organization = { id: 'org-test', code: 'ORG', name: '测试医院' } as Organization
  const content = (value: ReturnType<typeof catalogApi>) => <QueryClientProvider client={client}>
    <OrganizationCatalogManagement api={value as unknown as RhnApi} organization={organization} canManage />
  </QueryClientProvider>
  const view = render(content(api))
  return { api, client, ...view, switchApi: (value: ReturnType<typeof catalogApi>) => view.rerender(content(value)) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}

describe('organization catalog confirmed facts', () => {
  it('does not render independent mode, zero count or empty catalogue while source is pending', async () => {
    const api = catalogApi(), pending = deferred<unknown>()
    api.organization.catalogSource.mockReturnValue(pending.promise)
    renderCatalog(api)
    expect(await screen.findByText('正在读取目录来源…')).toBeInTheDocument()
    expect(screen.queryByText('本机构独立目录')).not.toBeInTheDocument()
    expect(screen.queryByText('0 条')).not.toBeInTheDocument()
    expect(screen.queryByText('没有匹配项目')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量调入' })).toBeDisabled()
    expect(api.masterData.adoptionCandidates).not.toHaveBeenCalled()
    await act(async () => pending.resolve(independentSource))
    expect(await screen.findByText('真实项目')).toBeInTheDocument()
  })
  it.each(['network', 'missing', 'wrong-organization'])('source %s is an error with a real retry', async kind => {
    const api = catalogApi()
    if (kind === 'network') api.organization.catalogSource.mockRejectedValueOnce(new Error('offline'))
    else api.organization.catalogSource.mockResolvedValueOnce(kind === 'missing' ? {} : { ...independentSource, organizationId: 'other' })
    renderCatalog(api)
    expect(await screen.findByText('目录来源加载失败')).toBeInTheDocument()
    expect(screen.queryByText('本机构独立目录')).not.toBeInTheDocument()
    expect(api.masterData.adoptionCandidates).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '重新加载目录来源' }))
    expect(await screen.findByText('真实项目')).toBeInTheDocument()
  })
  it.each(['network', 'missing-count', 'unknown-source', 'wrong-adoption'])('candidate %s does not turn into empty results', async kind => {
    const api = catalogApi()
    if (kind === 'network') api.masterData.adoptionCandidates.mockRejectedValueOnce(new Error('offline'))
    else api.masterData.adoptionCandidates.mockResolvedValueOnce(kind === 'missing-count' ? { content: [] }
      : { ...cataloguePage, content: [{ ...catalogueRow, adoptionSourceType: kind === 'unknown-source' ? 'INVALID' : 'SHARED' }] })
    renderCatalog(api)
    expect(await screen.findByText(/机构项目加载失败/)).toBeInTheDocument()
    expect(screen.queryByText('0 条')).not.toBeInTheDocument()
    expect(screen.queryByText('没有匹配项目')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重新加载机构项目' }))
    expect(await screen.findByText('真实项目')).toBeInTheDocument()
  })
  it('only shows empty results after a complete zero-row response', async () => {
    const api = catalogApi()
    api.masterData.adoptionCandidates.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 })
    renderCatalog(api)
    expect(await screen.findByText('没有匹配项目')).toBeInTheDocument()
    expect(screen.getByText('0 条')).toBeInTheDocument()
  })
  it('hides previously loaded rows and counts when a refresh fails', async () => {
    const { api, client } = renderCatalog()
    expect(await screen.findByText('真实项目')).toBeInTheDocument()
    api.masterData.adoptionCandidates.mockRejectedValue(new Error('offline'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['organization-catalog'] }) })
    expect(await screen.findByText(/机构项目加载失败/)).toBeInTheDocument()
    expect(screen.queryByText('真实项目')).not.toBeInTheDocument()
    expect(screen.queryByText('1 条')).not.toBeInTheDocument()
  })
  it('does not retain cached independent mode or rows after the source refresh fails', async () => {
    const { api, client } = renderCatalog()
    await screen.findByText('真实项目')
    api.organization.catalogSource.mockRejectedValue(new Error('offline'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['organization-catalog-source'] }) })
    expect(await screen.findByText('目录来源加载失败')).toBeInTheDocument()
    expect(screen.queryByText('本机构独立目录')).not.toBeInTheDocument()
    expect(screen.queryByText('真实项目')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量调入' })).toBeDisabled()
  })
  it.each(['organizations', 'dictionary'])('exposes %s failure and permits retry without fake options', async kind => {
    const api = catalogApi()
    if (kind === 'organizations') api.organization.list.mockRejectedValueOnce(new Error('offline'))
    else api.dictionaries.resolve.mockRejectedValueOnce(new Error('offline'))
    renderCatalog(api)
    expect(await screen.findByText('真实项目')).toBeInTheDocument()
    if (kind === 'organizations') {
      expect(screen.getByRole('combobox', { name: '共享目录来源' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: '重新加载来源机构' }))
      await waitFor(() => expect(screen.getByRole('combobox', { name: '共享目录来源' })).toBeEnabled())
    } else {
      expect(screen.getByRole('button', { name: '调入并配置' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: '重新加载价格类型' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '调入并配置' })).toBeEnabled())
    }
  })
})

describe('organization catalog source writes', () => {
  it('does not overwrite a newer source observed while the write was pending', async () => {
    const api = catalogApi(), pending = deferred<unknown>()
    api.organization.catalogSource.mockResolvedValue(sharedSource)
    api.organization.changeCatalogSource.mockReturnValue(pending.promise)
    const { client } = renderCatalog(api)
    await userEvent.click(await screen.findByRole('button', { name: '取消共享' }))
    api.organization.catalogSource.mockResolvedValue({ ...sharedSource, organizationRevision: 3 })
    await act(async () => { await client.invalidateQueries({ queryKey: ['organization-catalog-source'] }) })
    await act(async () => pending.resolve({ ...independentSource, organizationRevision: 2 }))
    expect(await screen.findByText(/目录来源已有更新版本/)).toBeInTheDocument()
    expect(screen.queryByText('已切换为本机构独立目录')).not.toBeInTheDocument()
    const cached = client.getQueriesData({ queryKey: ['organization-catalog-source'] })
    expect(cached[0][1]).toMatchObject({ organizationRevision: 3, sourceOrganizationId: 'source' })
    await userEvent.click(screen.getByRole('button', { name: '重新核实目录来源' }))
    expect(await screen.findByText('共享 来源医院')).toBeInTheDocument()
  })
  it('checks the selected source and stores the advanced revision before reporting success', async () => {
    const api = catalogApi()
    api.organization.changeCatalogSource.mockResolvedValue({ ...sharedSource, organizationRevision: 2 })
    renderCatalog(api)
    await screen.findByText('真实项目')
    await userEvent.click(screen.getByRole('combobox', { name: '共享目录来源' }))
    await userEvent.click(screen.getByRole('option', { name: '来源医院（SOURCE）' }))
    expect(await screen.findByText('共享目录来源已更新')).toBeInTheDocument()
    expect(api.organization.changeCatalogSource).toHaveBeenCalledWith('org-test', 1, 'source')
    expect(screen.getByText('共享 来源医院')).toBeInTheDocument()
    api.organization.changeCatalogSource.mockResolvedValue({ ...independentSource, organizationRevision: 3 })
    await userEvent.click(screen.getByRole('button', { name: '取消共享' }))
    expect(await screen.findByText('已切换为本机构独立目录')).toBeInTheDocument()
    expect(api.organization.changeCatalogSource).toHaveBeenLastCalledWith('org-test', 2, undefined)
  })
  it.each(['network', 'missing', 'same-revision', 'wrong-source', 'wrong-organization'])('does not confirm cancellation on %s receipt', async kind => {
    const api = catalogApi()
    api.organization.catalogSource.mockResolvedValue(sharedSource)
    if (kind === 'network') api.organization.changeCatalogSource.mockRejectedValue(new Error('lost response'))
    else api.organization.changeCatalogSource.mockResolvedValue(kind === 'missing' ? {} : kind === 'same-revision' ? independentSource
      : kind === 'wrong-source' ? { ...sharedSource, organizationRevision: 2 }
      : { ...independentSource, organizationRevision: 2, organizationId: 'other' })
    renderCatalog(api)
    await userEvent.click(await screen.findByRole('button', { name: '取消共享' }))
    expect(await screen.findByText(/目录来源变更结果未确认/)).toBeInTheDocument()
    expect(screen.queryByText('已切换为本机构独立目录')).not.toBeInTheDocument()
    expect(screen.queryByText('本机构独立目录')).not.toBeInTheDocument()
    expect(screen.queryByText('真实项目')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '共享目录来源' })).toBeDisabled()
    api.organization.catalogSource.mockResolvedValue({ ...independentSource, organizationRevision: 2 })
    await userEvent.click(screen.getByRole('button', { name: '重新核实目录来源' }))
    expect(await screen.findByText('本机构独立目录')).toBeInTheDocument()
    expect(screen.queryByText('已切换为本机构独立目录')).not.toBeInTheDocument()
    expect(api.organization.changeCatalogSource).toHaveBeenCalledTimes(1)
  })
  it.each(['resolve', 'reject'])('blocks repeat writes and ignores late %s after API context changes', async result => {
    const api = catalogApi(), pending = deferred<unknown>()
    api.organization.catalogSource.mockResolvedValue(sharedSource)
    api.organization.changeCatalogSource.mockReturnValue(pending.promise)
    const view = renderCatalog(api)
    await userEvent.dblClick(await screen.findByRole('button', { name: '取消共享' }))
    expect(api.organization.changeCatalogSource).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('combobox', { name: '共享目录来源' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '批量调入' })).toBeDisabled()
    const newApi = catalogApi()
    view.switchApi(newApi)
    expect(await screen.findByText('本机构独立目录')).toBeInTheDocument()
    await act(async () => {
      if (result === 'resolve') pending.resolve({ ...independentSource, organizationRevision: 2 })
      else pending.reject(new Error('old request'))
    })
    expect(screen.queryByText('已切换为本机构独立目录')).not.toBeInTheDocument()
    expect(screen.queryByText(/目录来源变更结果未确认/)).not.toBeInTheDocument()
    expect(newApi.organization.catalogSource).toHaveBeenCalledOnce()
  })
})
