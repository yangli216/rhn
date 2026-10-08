import { useQuery, useQueryClient } from '@tanstack/react-query'
import '../../styles/features/operational-master-data.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Organization } from '../../shared/model'
import {
  errorMessage, type CatalogAdoptionCandidate, type OrganizationCatalogSource, type RhnApi,
} from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, EmptyState, LoadingState, PageHeader, Pagination, Panel,
  SearchField, Select, StatusBadge, TableShell, Tabs,
} from '../../shared/ui'
import {
  CatalogLifecycleDialog, OrganizationCatalogImportDialog, type DictionaryMap,
} from './BasicDataManagement'

import { requireCatalogCandidates, requireCatalogOrganizations, requireCatalogSource, requireCatalogSourceReceipt } from './organizationCatalogFacts'
import { requireOrganizationDictionary } from './organizationDictionaryFacts'

const apiScopes = new WeakMap<RhnApi, number>()
let nextScope = 0
function scopeFor(api: RhnApi) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextScope)
  return apiScopes.get(api)!
}

type CatalogType = 'SERVICE' | 'MED_PRODUCT'

export function OrganizationCatalogManagement({ api, organization, canManage }: {
  api: RhnApi
  organization: Organization
  canManage: boolean
}) {
  const scope = `${scopeFor(api)}:${organization.id}`
  return <OrganizationCatalogWorkspace key={scope} api={api} organization={organization} canManage={canManage} scope={scope} />
}

function OrganizationCatalogWorkspace({ api, organization, canManage, scope }: {
  api: RhnApi; organization: Organization; canManage: boolean; scope: string
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
  const [sourceUnconfirmed, setSourceUnconfirmed] = useState(false)
  const active = useRef(true)
  const sourceLock = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])

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

  const dictionaries = useQuery({
    queryKey: ['organization-catalog-dictionaries', scope],
    queryFn: async () => ({
      BD_PRICE_TYPE: requireOrganizationDictionary(await api.dictionaries.resolve('BD_PRICE_TYPE')),
    }) as DictionaryMap,
    staleTime: 5 * 60 * 1000,
  })
  const organizations = useQuery({
    queryKey: ['organization-catalog-organizations', scope],
    queryFn: async () => requireCatalogOrganizations(await api.organization.list()),
  })
  const sourceKey = ['organization-catalog-source', scope]
  const catalogSource = useQuery({
    queryKey: sourceKey,
    queryFn: async () => requireCatalogSource(await api.organization.catalogSource(organization.id), organization.id),
  })
  const sourceReady = catalogSource.isSuccess && !catalogSource.isFetching && !sourceUnconfirmed && !sourcePending
  const organizationsReady = organizations.isSuccess && !organizations.isFetching
  const dictionariesReady = dictionaries.isSuccess && !dictionaries.isFetching
  const candidates = useQuery({
    queryKey: ['organization-catalog', scope, catalogSource.data?.organizationRevision, catalogType, query, page, pageSize],
    queryFn: async () => requireCatalogCandidates(
      await api.masterData.adoptionCandidates(organization.id, catalogType, query, page, pageSize),
      { organizationId: organization.id, sourceOrganizationId: catalogSource.data?.sourceOrganizationId,
        itemType: catalogType, page, size: pageSize }),
    enabled: sourceReady,
  })
  const candidatesReady = sourceReady && candidates.isSuccess && !candidates.isFetching
  const reloadSource = async () => {
    if (sourceLock.current) return
    const results = await Promise.allSettled([catalogSource.refetch({ throwOnError: true }), organizations.refetch({ throwOnError: true })])
    if (active.current && results[0].status === 'fulfilled') {
      setSourceUnconfirmed(false)
      setOperationError('')
    }
  }

  useEffect(() => { setPage(0) }, [catalogType, pageSize, query])

  const refresh = async (message?: string) => {
    if (!active.current) return
    setDialog(undefined)
    if (message) setFeedback(message)
    setOperationError('')
    await queryClient.invalidateQueries({ queryKey: ['organization-catalog'] })
  }

  const saveSource = async (sourceOrganizationId: string) => {
    if (!canManage || !sourceReady || !organizationsReady || !catalogSource.data || sourceLock.current) return
    if ((catalogSource.data.sourceOrganizationId ?? '') === sourceOrganizationId) return
    if (sourceOrganizationId && !organizations.data.some(value => value.id === sourceOrganizationId && value.id !== organization.id)) {
      setOperationError('来源机构尚未确认，请重新加载并选择')
      return
    }
    const before = catalogSource.data
    sourceLock.current = true
    setSourcePending(true)
    setFeedback('')
    setOperationError('')
    try {
      const value = requireCatalogSourceReceipt(await api.organization.changeCatalogSource(
        organization.id, before.organizationRevision, sourceOrganizationId || undefined,
      ), before, sourceOrganizationId)
      if (!active.current) return
      await queryClient.cancelQueries({ queryKey: sourceKey, exact: true })
      if (!active.current) return
      const latest = queryClient.getQueryData<OrganizationCatalogSource>(sourceKey)
      if (latest && latest.organizationRevision > value.organizationRevision) {
        throw new Error('目录来源已有更新版本，请重新核实当前来源')
      }
      queryClient.setQueryData(sourceKey, value)
      await queryClient.invalidateQueries({ queryKey: ['organization-catalog', scope] })
      if (active.current) setFeedback(sourceOrganizationId ? '共享目录来源已更新' : '已切换为本机构独立目录')
    } catch (error) {
      if (!active.current) return
      setSourceUnconfirmed(true)
      setOperationError(`目录来源变更结果未确认：${errorMessage(error)}`)
    } finally {
      sourceLock.current = false
      if (active.current) setSourcePending(false)
    }
  }

  const openLifecycle = (value: CatalogAdoptionCandidate) => {
    if (!canManage || !sourceReady || !candidatesReady || !dictionariesReady) return
    setDialog(<CatalogLifecycleDialog api={api} catalogItemId={value.id} itemName={value.name}
      organization={organization} packages={value.packages} dictionaries={dictionaries.data}
      defaults={catalogType === 'SERVICE'
        ? { orderable: true, executable: true, chargeable: true, purchasable: false,
          stocked: false, dispensable: false, returnable: false }
        : { orderable: true, executable: false, chargeable: true, purchasable: true,
          stocked: true, dispensable: true, returnable: true }}
      onClose={() => setDialog(undefined)} onChanged={() => refresh()} />)
  }

  const values = candidatesReady ? candidates.data.content : []
  const sourceOptions = organizationsReady ? organizations.data.filter(value => value.id !== organization.id)
    .map(value => ({ value: value.id, label: `${value.name}（${value.code}）` })) : []
  const totalPages = candidatesReady ? Math.max(1, candidates.data.totalPages) : 1

  return <div className="master-data-page organization-catalog-page">
    <PageHeader compact eyebrow="运营配置 · 机构目录" title="机构项目管理"
      description={`${organization.name} · 诊疗项目与药品产品`}
      actions={canManage && <Button disabled={!sourceReady || !dictionariesReady} onClick={() => setDialog(
        <OrganizationCatalogImportDialog api={api} organization={organization} initialItemType={catalogType}
          onClose={() => setDialog(undefined)} onCompleted={() => refresh('机构项目调入已完成')} />
      )}>批量调入</Button>} />

    {feedback && <Alert tone="success" className="master-data-feedback">{feedback}</Alert>}
    {operationError && <div role="alert" className="master-data-feedback">
      {operationError}<Button size="sm" variant="text" disabled={sourcePending} onClick={() => void reloadSource()}>重新核实目录来源</Button>
    </div>}
    {(dictionaries.isError || (dictionaries.isSuccess && !dictionaries.data.BD_PRICE_TYPE.length)) && <div role="alert">
      {dictionaries.isError ? '价格类型字典加载失败' : '价格类型字典为空，不能维护价格'}
      <Button size="sm" variant="text" onClick={() => void dictionaries.refetch()}>重新加载价格类型</Button>
    </div>}

    <Panel className="organization-catalog-source-panel">
      <div><strong>目录使用方式</strong><span>{sourcePending ? '正在保存目录来源…' : sourceReady
        ? catalogSource.data.sourceOrganizationId ? `共享 ${catalogSource.data.sourceOrganizationName}` : '本机构独立目录'
        : catalogSource.isError || sourceUnconfirmed ? '目录来源待核实' : '正在读取目录来源…'}</span></div>
      {catalogSource.isError && <div role="alert">目录来源加载失败
        <Button size="sm" variant="text" onClick={() => void reloadSource()}>重新加载目录来源</Button>
      </div>}
      {canManage && <div className="master-data-catalog-source__control">
        <Select aria-label="共享目录来源" value={sourceReady ? catalogSource.data.sourceOrganizationId ?? '' : ''}
          disabled={!sourceReady || !organizationsReady} placeholder={sourceReady ? '选择共享来源机构' : '目录来源待确认'}
          options={sourceOptions} onChange={(value) => void saveSource(value)} />
        {sourceReady && catalogSource.data.sourceOrganizationId && <Button size="sm" variant="text"
          disabled={!organizationsReady} onClick={() => void saveSource('')}>取消共享</Button>}
      </div>}
      {canManage && organizations.isError && <div role="alert">来源机构目录加载失败
        <Button size="sm" variant="text" onClick={() => void organizations.refetch()}>重新加载来源机构</Button>
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
        <span className="master-data-count">{candidatesReady ? `${candidates.data.totalElements} 条` : '数量待确认'}</span>
      </div>
      {!sourceReady ? <EmptyState icon="clinical" title="请先确认目录来源" copy="目录来源确认后读取机构项目。" />
        : candidates.isFetching ? <LoadingState label="正在读取中心目录…" />
        : candidates.isError ? <div role="alert">机构项目加载失败：{errorMessage(candidates.error)}
          <Button size="sm" variant="text" onClick={() => void candidates.refetch()}>重新加载机构项目</Button>
        </div> : !candidatesReady ? <LoadingState label="正在读取中心目录…" /> : !values.length
        ? candidates.data!.totalElements > 0 ? <div>当前页已无项目
          <Button size="sm" variant="text" onClick={() => setPage(0)}>返回第一页</Button></div>
          : <EmptyState icon="clinical" title="没有匹配项目" copy="请调整搜索条件。" />
        : <TableShell className="organization-catalog-table-shell" scrollClassName="master-data-table-wrap"
          footer={<Pagination page={page} totalPages={totalPages}
            total={candidates.data!.totalElements} pageSize={pageSize} onPageSizeChange={setPageSize}
            onChange={setPage} label="机构项目列表分页" />}>
          <DataTable className="master-data-table">
            <thead><tr><th>中心项目</th><th>来源</th><th>机构名称 / 编码</th><th>业务能力</th>
              {canManage && <th>操作</th>}</tr></thead>
            <tbody>{values.map((value) => <CatalogRow key={value.id} value={value}
              manageDisabled={!dictionariesReady || !dictionaries.data.BD_PRICE_TYPE.length}
              onManage={canManage ? () => openLifecycle(value) : undefined} />)}</tbody>
          </DataTable>
        </TableShell>}
    </Panel>
    {dialog}
  </div>
}

function CatalogRow({ value, onManage, manageDisabled }: {
  value: CatalogAdoptionCandidate; onManage?: () => void; manageDisabled: boolean
}) {
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
      disabled={manageDisabled} onClick={onManage}>{value.adoptionSourceType === 'NONE' ? '调入并配置' : '维护'}</Button></td>}
  </tr>
}
