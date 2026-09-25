import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import type { Organization } from '../../shared/model'
import {
  errorMessage, type CatalogAdoptionCandidate, type OrganizationUnit, type RhnApi,
} from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, EmptyState, LoadingState, PageHeader, Pagination, Panel,
  SearchField, Select, StatusBadge, TableShell, Tabs,
} from '../../shared/ui'
import {
  CatalogLifecycleDialog, OrganizationCatalogImportDialog, type DictionaryMap,
} from './BasicDataManagement'

type CatalogType = 'SERVICE' | 'MED_PRODUCT'

export function OrganizationCatalogManagement({ api, organization, canManage }: {
  api: RhnApi
  organization: Organization
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const [catalogType, setCatalogType] = useState<CatalogType>('SERVICE')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [sourcePending, setSourcePending] = useState(false)

  const handleSearch = () => {
    setQuery(keyword.trim())
    setPage(0)
  }

  const handleReset = () => {
    setKeyword('')
    setQuery('')
    setPage(0)
  }

  const handleCatalogTypeChange = (type: CatalogType) => {
    setCatalogType(type)
    setKeyword('')
    setQuery('')
    setPage(0)
  }

  const candidates = useQuery({
    queryKey: ['organization-catalog', organization.id, catalogType, query, page, pageSize],
    queryFn: () => api.masterData.adoptionCandidates(organization.id, catalogType, query, page, pageSize),
  })
  const dictionaries = useQuery({
    queryKey: ['organization-catalog-dictionaries'],
    queryFn: async () => ({
      BD_PRICE_TYPE: await api.dictionaries.resolve('BD_PRICE_TYPE'),
    }) as DictionaryMap,
    staleTime: 5 * 60 * 1000,
  })
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.organization.list(),
  })
  const catalogSource = useQuery({
    queryKey: ['organization-catalog-source', organization.id],
    queryFn: () => api.organization.catalogSource(organization.id),
  })

  useEffect(() => { setPage(0) }, [catalogType, pageSize, query])

  const refresh = async (message?: string) => {
    setDialog(undefined)
    if (message) setFeedback(message)
    setOperationError('')
    await queryClient.invalidateQueries({ queryKey: ['organization-catalog'] })
  }

  const saveSource = async (sourceOrganizationId: string) => {
    if (!catalogSource.data) return
    setSourcePending(true)
    setFeedback('')
    setOperationError('')
    try {
      const value = await api.organization.changeCatalogSource(
        organization.id, catalogSource.data.organizationRevision, sourceOrganizationId || undefined,
      )
      queryClient.setQueryData(['organization-catalog-source', organization.id], value)
      await queryClient.invalidateQueries({ queryKey: ['organization-catalog'] })
      setFeedback(sourceOrganizationId ? '共享目录来源已更新' : '已切换为本机构独立目录')
    } catch (error) {
      setOperationError(errorMessage(error))
    } finally {
      setSourcePending(false)
    }
  }

  const openLifecycle = (value: CatalogAdoptionCandidate) => {
    if (!dictionaries.data) return
    setDialog(<CatalogLifecycleDialog api={api} catalogItemId={value.id} itemName={value.name}
      organization={organization} packages={value.packages} dictionaries={dictionaries.data}
      defaults={catalogType === 'SERVICE'
        ? { orderable: true, executable: true, chargeable: true, purchasable: false,
          stocked: false, dispensable: false, returnable: false }
        : { orderable: true, executable: false, chargeable: true, purchasable: true,
          stocked: true, dispensable: true, returnable: true }}
      onClose={() => setDialog(undefined)} onChanged={() => refresh()} />)
  }

  const values = candidates.data?.content ?? []
  const sourceOptions = (organizations.data ?? []).filter((value: OrganizationUnit) => value.id !== organization.id)
    .map((value: OrganizationUnit) => ({ value: value.id, label: `${value.name}（${value.code}）` }))
  const totalPages = Math.max(1, candidates.data?.totalPages ?? 1)
  const safePage = Math.min(page, totalPages - 1)

  return <div className="master-data-page organization-catalog-page">
    <PageHeader compact eyebrow="运营配置 · 机构目录" title="机构项目管理"
      description={`${organization.name} · 诊疗项目与药品产品`}
      actions={canManage && <Button disabled={!dictionaries.data} onClick={() => setDialog(
        <OrganizationCatalogImportDialog api={api} organization={organization} initialItemType={catalogType}
          onClose={() => setDialog(undefined)} onCompleted={() => refresh('机构项目调入已完成')} />
      )}>批量调入</Button>} />

    {feedback && <Alert tone="success" className="master-data-feedback">{feedback}</Alert>}
    {(operationError || candidates.error || catalogSource.error) && <Alert className="master-data-feedback">
      {operationError || errorMessage(candidates.error || catalogSource.error)}
    </Alert>}

    <Panel className="organization-catalog-source-panel">
      <div><strong>目录使用方式</strong><span>{catalogSource.data?.sourceOrganizationName
        ? `共享 ${catalogSource.data.sourceOrganizationName}` : '本机构独立目录'}</span></div>
      {canManage && <div className="master-data-catalog-source__control">
        <Select value={catalogSource.data?.sourceOrganizationId ?? ''}
          disabled={!catalogSource.data || sourcePending} placeholder="本机构独立目录"
          options={sourceOptions} onChange={(value) => void saveSource(value)} />
        {catalogSource.data?.sourceOrganizationId && <Button size="sm" variant="text" busy={sourcePending}
          onClick={() => void saveSource('')}>取消共享</Button>}
      </div>}
    </Panel>

    <Panel className="master-data-panel organization-catalog-workspace">
      <Tabs value={catalogType} onChange={handleCatalogTypeChange} label="机构目录类型" variant="workspace"
        items={[{ value: 'SERVICE', label: '诊疗项目', meta: '开立 · 执行 · 收费' },
          { value: 'MED_PRODUCT', label: '药品产品', meta: '采购 · 库存 · 发药' }]} />
      <div className="master-data-toolbar">
        <SearchField className="master-data-toolbar__search" label="搜索中心目录" value={keyword}
          onChange={setKeyword} onSearch={handleSearch} placeholder="项目名称或编码（回车或点击查询）" />
        <Button size="sm" variant="primary" onClick={handleSearch}>查询</Button>
        <Button size="sm" variant="secondary" onClick={handleReset}>重置</Button>
        <span className="master-data-count">{candidates.isFetching ? '正在刷新…'
          : `${candidates.data?.totalElements ?? 0} 条`}</span>
      </div>
      {candidates.isPending ? <LoadingState label="正在读取中心目录…" /> : !values.length
        ? <EmptyState icon="clinical" title="没有匹配项目" copy="请调整搜索条件。" />
        : <TableShell className="organization-catalog-table-shell" scrollClassName="master-data-table-wrap"
          footer={<Pagination page={safePage} totalPages={totalPages}
            total={candidates.data?.totalElements ?? 0} pageSize={pageSize} onPageSizeChange={setPageSize}
            onChange={setPage} label="机构项目列表分页" />}>
          <DataTable className="master-data-table">
            <thead><tr><th>中心项目</th><th>来源</th><th>机构名称 / 编码</th><th>业务能力</th>
              {canManage && <th>操作</th>}</tr></thead>
            <tbody>{values.map((value) => <CatalogRow key={value.id} value={value}
              onManage={canManage ? () => openLifecycle(value) : undefined} />)}</tbody>
          </DataTable>
        </TableShell>}
    </Panel>
    {dialog}
  </div>
}

function CatalogRow({ value, onManage }: { value: CatalogAdoptionCandidate; onManage?: () => void }) {
  const adoption = value.adoption
  const source = value.adoptionSourceType === 'LOCAL' ? '本机构'
    : value.adoptionSourceType === 'SHARED' ? '共享目录' : '未调入'
  const tone = value.adoptionSourceType === 'LOCAL' ? 'success'
    : value.adoptionSourceType === 'SHARED' ? 'warning' : 'neutral'
  const capabilities = adoption ? [
    adoption.orderable && '开立', adoption.executable && '执行', adoption.chargeable && '收费',
    adoption.purchasable && '采购', adoption.stocked && '库存', adoption.dispensable && '发放',
    adoption.returnable && '退回',
  ].filter(Boolean).join(' · ') : '未开放'
  return <tr>
    <td><strong>{value.name}</strong><code>{value.code}</code></td>
    <td><StatusBadge tone={tone}>{source}</StatusBadge>{adoption && <small>{adoption.sdStatusText}</small>}</td>
    <td>{adoption ? <><strong>{adoption.localName || value.name}</strong>
      <code>{adoption.localCode || '沿用中心编码'}</code></> : '—'}</td>
    <td>{capabilities}</td>
    {onManage && <td><Button size="sm" variant={value.adoptionSourceType === 'NONE' ? 'secondary' : 'text'}
      onClick={onManage}>{value.adoptionSourceType === 'NONE' ? '调入并配置' : '维护'}</Button></td>}
  </tr>
}
