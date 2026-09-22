import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  errorMessage, PARAMETER_SYSTEM_ENUM, systemEnumItems,
  type ConfigurationDependencyBehavior,
  type ParameterCategory, type ParameterConfigType, type ParameterControlType,
  type ParameterDefinition, type ParameterDefinitionInput, type ParameterDefinitionSummary,
  type ParameterDisplayPolicy, type ParameterScope, type ParameterSensitivity,
  type ParameterValue, type ParameterValueInput, type ParameterValueMode,
  type ParameterValueType, type RhnApi, type SystemEnumDefinition, type SystemEnumItem,
} from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, Dialog, DictionarySelect, EmptyState, FormField, Icon, LoadingState,
  PageHeader, Pagination, Panel, PanelHead, SearchField, Select, SplitWorkspace, StatusBadge, TableShell,
  TreePanel, type TreePanelMove,
} from '../../shared/ui'
import { ConfigurationScopeTarget } from './ConfigurationScopeTarget'

type DefinitionDialogMode = 'create' | 'edit' | undefined
type CategoryDialogState = { mode: 'create'; parentId?: string; category?: undefined } | { mode: 'edit'; category: ParameterCategory }
const DIRECTORY_PAGE_SIZE = 8

interface ParameterContext {
  tenantId: string
  organization: { id: string; name: string }
  department: { id: string; name: string }
  userId?: string | null
}

export function ParameterManagement({ api, context, fixedConfigType }: {
  api: RhnApi
  context: ParameterContext
  fixedConfigType?: 'BUSINESS' | 'SYSTEM'
}) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [configTypeFilter, setConfigTypeFilter] = useState(fixedConfigType ?? '')
  const effectiveConfigType = fixedConfigType ?? configTypeFilter
  const [statusFilter, setStatusFilter] = useState('')
  const [catalogPage, setCatalogPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string>()
  const [definitionDialog, setDefinitionDialog] = useState<DefinitionDialogMode>()
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>()
  const [editingValue, setEditingValue] = useState<ParameterValue | null | undefined>(undefined)
  const [showChanges, setShowChanges] = useState(false)
  const [confirmDefinitionStatus, setConfirmDefinitionStatus] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])

  const systemEnums = useQuery({
    queryKey: ['dictionary-system-enums'], queryFn: api.dictionaries.systemEnums, staleTime: Infinity,
  })
  const categories = useQuery({ queryKey: ['parameter-categories'], queryFn: api.configuration.categories })
  const allDefinitions = useQuery({
    queryKey: ['parameter-definitions-all'],
    queryFn: () => api.configuration.definitions(),
  })
  const definitions = useQuery({
    queryKey: ['parameter-definitions', query, categoryFilter, effectiveConfigType, statusFilter],
    queryFn: () => api.configuration.definitions(query, categoryFilter, effectiveConfigType, statusFilter),
  })
  const detail = useQuery({
    queryKey: ['parameter-definition', selectedId], queryFn: () => api.configuration.get(selectedId!),
    enabled: Boolean(selectedId),
  })
  const changes = useQuery({
    queryKey: ['parameter-changes', selectedId], queryFn: () => api.configuration.changes(selectedId!),
    enabled: Boolean(selectedId && showChanges),
  })

  useEffect(() => {
    const list = definitions.data ?? []
    const selectedIndex = list.findIndex((item) => item.id === selectedId)
    if (list.length && selectedIndex < 0) setSelectedId(list[0].id)
    if (selectedIndex >= 0) setCatalogPage(Math.floor(selectedIndex / DIRECTORY_PAGE_SIZE))
    if (!list.length) setSelectedId(undefined)
  }, [definitions.data, selectedId])

  useEffect(() => { setCatalogPage(0) }, [query, categoryFilter, configTypeFilter, statusFilter])

  async function acceptChange(next: ParameterDefinition, message: string) {
    queryClient.setQueryData(['parameter-definition', next.id], next)
    setSelectedId(next.id)
    setFeedback(message)
    setOperationError('')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['parameter-definitions'] }),
      queryClient.invalidateQueries({ queryKey: ['parameter-definitions-all'] }),
      queryClient.invalidateQueries({ queryKey: ['parameter-changes', next.id] }),
    ])
  }

  function refreshAfterError(error: unknown) {
    setOperationError(errorMessage(error))
    if (selectedId) void queryClient.invalidateQueries({ queryKey: ['parameter-definition', selectedId] })
  }

  const createDefinition = useMutation({
    mutationFn: api.configuration.create,
    onSuccess: (next) => acceptChange(next, `已创建参数“${next.name}”`),
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const updateDefinition = useMutation({
    mutationFn: (input: ParameterDefinitionInput) => api.configuration.update(detail.data!.id, detail.data!.revision, input),
    onSuccess: (next) => acceptChange(next, `已更新参数“${next.name}”`), onError: refreshAfterError,
  })
  const definitionStatus = useMutation({
    mutationFn: (enabled: boolean) => api.configuration.changeStatus(detail.data!.id, detail.data!.revision, enabled),
    onSuccess: (next) => acceptChange(next, `参数状态已更新为“${next.sdParamStatusText}”`), onError: refreshAfterError,
  })
  const saveValue = useMutation({
    mutationFn: (input: ParameterValueInput) => api.configuration.saveValue(detail.data!.id, input),
    onSuccess: (next) => acceptChange(next, '参数当前值已保存').then(() => setEditingValue(undefined)),
    onError: refreshAfterError,
  })
  const valueStatus = useMutation({
    mutationFn: (value: ParameterValue) => api.configuration.changeValueStatus(
      detail.data!.id, value, value.sdParamStatus !== 'ACTIVE',
    ),
    onSuccess: (next) => acceptChange(next, '参数当前值状态已更新'), onError: refreshAfterError,
  })
  const rollback = useMutation({
    mutationFn: ({ changeId, revision }: { changeId: string; revision: number }) =>
      api.configuration.rollback(detail.data!.id, changeId, revision, '人工恢复历史快照'),
    onSuccess: (next) => acceptChange(next, '已将历史快照恢复为新的当前值'), onError: refreshAfterError,
  })
  const createCategory = useMutation({
    mutationFn: api.configuration.createCategory,
    onSuccess: async () => {
      setFeedback('参数分类已创建'); setOperationError('')
      await queryClient.invalidateQueries({ queryKey: ['parameter-categories'] })
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const updateCategory = useMutation({
    mutationFn: ({ category, input }: { category: ParameterCategory; input: Parameters<RhnApi['configuration']['updateCategory']>[1] }) =>
      api.configuration.updateCategory(category.id, input),
    onSuccess: async () => {
      setFeedback('参数分类已更新'); setOperationError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['parameter-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['parameter-definitions'] }),
        queryClient.invalidateQueries({ queryKey: ['parameter-definition'] }),
      ])
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const reorderCategories = useMutation({
    mutationFn: ({ orders }: ReturnType<typeof planCategoryMove>) => api.configuration.reorderCategories(orders),
    onMutate: async ({ next }: ReturnType<typeof planCategoryMove>) => {
      await queryClient.cancelQueries({ queryKey: ['parameter-categories'] })
      const previous = queryClient.getQueryData<ParameterCategory[]>(['parameter-categories'])
      queryClient.setQueryData(['parameter-categories'], next)
      return { previous }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(['parameter-categories'], next)
      setFeedback('参数分类顺序已保存'); setOperationError('')
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['parameter-categories'], context.previous)
      setOperationError(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['parameter-categories'] }),
  })

  const categoryOptions = useMemo(() => flattenCategories(categories.data ?? []), [categories.data])
  const categoryCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of allDefinitions.data ?? []) {
      if (item.categoryId && (!fixedConfigType || item.sdParamConfigType === fixedConfigType)) {
        map[item.categoryId] = (map[item.categoryId] ?? 0) + 1
      }
    }
    return map
  }, [allDefinitions.data, fixedConfigType])

  const currentCategoryName = useMemo(() => {
    if (!categoryFilter) return '全部参数'
    const match = categories.data?.find((c) => c.id === categoryFilter)
    return match ? match.name : '全部参数'
  }, [categories.data, categoryFilter])

  const configTypeOptions = enumOptions(systemEnums.data, PARAMETER_SYSTEM_ENUM.configType)
  const statusOptions = enumOptions(systemEnums.data, PARAMETER_SYSTEM_ENUM.status)
  const selected = detail.data
  const definitionList = definitions.data ?? []
  const catalogPageCount = Math.max(1, Math.ceil(definitionList.length / DIRECTORY_PAGE_SIZE))
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount - 1)
  const pageDefinitions = definitionList.slice(safeCatalogPage * DIRECTORY_PAGE_SIZE,
    (safeCatalogPage + 1) * DIRECTORY_PAGE_SIZE)
  const parameterRovingId = pageDefinitions.some((item) => item.id === selectedId)
    ? selectedId : pageDefinitions[0]?.id
  const queryError = systemEnums.error || categories.error || definitions.error || detail.error
  const busy = createDefinition.isPending || updateDefinition.isPending || definitionStatus.isPending
    || saveValue.isPending || valueStatus.isPending || rollback.isPending

  function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const list = pageDefinitions
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !list.length) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1
      : event.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.min(list.length - 1, index + 1)
    cardRefs.current[nextIndex]?.focus()
    setSelectedId(list[nextIndex].id)
    setFeedback('')
    setOperationError('')
  }

  const pageTitle = fixedConfigType === 'BUSINESS' ? '业务参数配置'
    : fixedConfigType === 'SYSTEM' ? '系统运行参数'
    : '参数管理'
  const pageEyebrow = fixedConfigType === 'BUSINESS' ? '业务运营 · 业务规则'
    : fixedConfigType === 'SYSTEM' ? '平台运维 · 系统底座'
    : '平台管理 · 基础设置'
  const pageDescription = fixedConfigType === 'BUSINESS'
    ? '按医院、科室维护门诊、挂号、处方、收费等业务流程控制策略与预警阈值。'
    : fixedConfigType === 'SYSTEM'
    ? '维护中间件、缓存、并发控制、会话与安全网关等系统底层运行参数（不对客户开放）。'
    : '统一维护系统与业务参数定义，按平台、租户、组织、科室、用户及附加上下文解析当前值。'

  return <>
    <PageHeader compact eyebrow={pageEyebrow} title={pageTitle}
      description={pageDescription}
      actions={<><Button className="parameter-page-action" variant="secondary" onClick={() => setCategoryDialog({ mode: 'create' })}>
        管理分类</Button><Button className="parameter-page-action" disabled={!categories.data?.some((item) => item.sdParamStatus === 'ACTIVE') || !systemEnums.data}
          onClick={() => setDefinitionDialog('create')}><Icon name="add" />新建参数</Button></>} />

    {feedback && <Alert tone="success" className="parameter-feedback">{feedback}</Alert>}
    {(operationError || queryError) && <Alert className="parameter-feedback">
      {operationError || errorMessage(queryError)}</Alert>}

    <SplitWorkspace className="parameter-workspace">
      <Panel className="parameter-category-nav">
        <TreePanel title="参数分类" headingLevel={2} rootLabel="全部参数"
          rootMeta={`${allDefinitions.data?.length ?? 0} 项参数`} searchLabel="搜索分类"
          searchPlaceholder="搜索分类名称或编码" selectedId={categoryFilter || undefined}
          nodes={categoryOptions.map(({ category }) => ({
            id: category.id, parentId: category.parentId || undefined, label: category.name,
            keywords: [category.code], inactive: category.sdParamStatus !== 'ACTIVE',
            secondaryText: `${categoryCountMap[category.id] ?? 0} 项${category.sdParamStatus !== 'ACTIVE' ? ' · 已停用' : ''}`,
          }))}
          onSelect={id => {
            setCategoryFilter(id ?? '')
            setFeedback('')
            setOperationError('')
          }} />
      </Panel>

      <Panel className="parameter-catalog">
        <PanelHead title={currentCategoryName} meta={`${definitions.data?.length ?? 0} 项`} />
        <div className="parameter-filters">
          <SearchField className="parameter-filters__search" label="搜索参数" value={query}
            onChange={setQuery} placeholder="搜索名称或参数键" />
          {!fixedConfigType && (
            <Select aria-label="配置属性" value={configTypeFilter} placeholder="全部属性" showValue
              onChange={setConfigTypeFilter} options={configTypeOptions.map(selectOption)} />
          )}
          <Select aria-label="参数状态" value={statusFilter} placeholder="全部状态" showValue
            onChange={setStatusFilter} options={statusOptions.map(selectOption)} />
        </div>
        <div className="parameter-catalog__list" role="listbox" aria-label="参数目录">
          {definitions.isPending && <LoadingState label="正在加载参数…" />}
          {pageDefinitions.map((definition, index) => <ParameterCard key={definition.id} definition={definition}
            tabIndex={definition.id === parameterRovingId ? 0 : -1}
            buttonRef={(node) => { cardRefs.current[index] = node }}
            onKeyDown={(event) => handleCardKeyDown(event, index)}
            selected={definition.id === selectedId} onSelect={() => {
              setSelectedId(definition.id); setFeedback(''); setOperationError('')
            }} />)}
          {!definitions.isPending && definitions.data?.length === 0 && <EmptyState icon="search"
            title="未找到匹配参数" copy={categories.data?.length ? '请调整筛选条件，或新建一个参数。' : '请先创建参数分类。'} />}
        </div>
        <Pagination page={safeCatalogPage} totalPages={catalogPageCount} label="参数目录分页"
          onChange={(nextPage) => {
            setCatalogPage(nextPage)
            const first = definitionList[nextPage * DIRECTORY_PAGE_SIZE]
            if (first) setSelectedId(first.id)
          }} />
      </Panel>

      <Panel className="parameter-detail">
        {detail.isPending && selectedId && <LoadingState label="正在加载参数详情…" />}
        {!selected && !detail.isPending && <EmptyState icon="settings" title="暂无参数"
          copy="创建参数分类和参数定义后，即可按作用域维护当前值。" />}
        {selected && <>
          <header className="parameter-detail__head">
            <div><div className="parameter-title-row"><h2>{selected.name}</h2>
              <StatusBadge tone={selected.sdParamStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                {selected.sdParamStatusText}</StatusBadge></div>
              <code>{selected.key}</code><p>{selected.description || '暂无用途说明'}</p></div>
            <div className="parameter-detail__actions">
              <Button variant="secondary" onClick={() => setShowChanges(true)}>变更记录</Button>
              <Button variant="secondary" onClick={() => setDefinitionDialog('edit')}>编辑定义</Button>
              <Button variant={selected.sdParamStatus === 'ACTIVE' ? 'danger' : 'secondary'}
                busy={definitionStatus.isPending}
                onClick={() => setConfirmDefinitionStatus(true)}>
                {selected.sdParamStatus === 'ACTIVE' ? '停用参数' : '启用参数'}</Button>
            </div>
          </header>
          <dl className="parameter-facts">
            <div><dt>分类</dt><dd>{selected.categoryName}</dd></div>
            <div><dt>值类型 / 控件</dt><dd>{selected.sdParamValueTypeText} · {selected.sdParamControlTypeText}</dd></div>
            <div><dt>配置属性</dt><dd>{selected.sdParamConfigTypeText}</dd></div>
            <div><dt>安全策略</dt><dd>{selected.sdParamSensitivityText} · {selected.sdParamDisplayPolicyText}</dd></div>
            <div><dt>前置依赖</dt><dd>{selected.dependsOnKey ? `${selected.dependsOnName || selected.dependsOnKey}（期望: ${selected.dependsOnValue || '非空'}）` : '无（独立生效）'}</dd></div>
          </dl>
          {selected.dependsOnKey && (
            <div className={`parameter-dependency-banner ${selected.dependencySatisfied ? 'is-satisfied' : 'is-unsatisfied'}`} role="status">
              <div className="parameter-dependency-banner__icon">
                <Icon name={selected.dependencySatisfied ? 'check' : 'warning'} />
              </div>
              <div className="parameter-dependency-banner__content">
                <div className="parameter-dependency-banner__title">
                  <strong>前置依赖联动：{selected.dependencySatisfied ? '条件已满足（正常生效）' : '条件未满足（运行时已抑制）'}</strong>
                  <StatusBadge tone={selected.dependencySatisfied ? 'success' : 'warning'}>
                    {selected.dependencySatisfied ? '正常生效' : '运行时抑制'}
                  </StatusBadge>
                </div>
                <p>
                  本参数依赖于 <code>{selected.dependsOnName || selected.dependsOnKey}</code>
                  {selected.dependsOnValue ? <>，期望匹配值：<code>{selected.dependsOnValue}</code>。</> : '，期望具有任意非空有效值。'}
                  {selected.dependencySatisfied
                    ? ' 当前前置参数值已达成，业务端在读取该参数时将正常生效。'
                    : ' 当前前置条件未满足，业务调用时将安全抑制并返回空值；您在此维护的值将在前置条件满足后自动激活。'}
                </p>
              </div>
              <div className="parameter-dependency-banner__action">
                <Button size="sm" variant="secondary" onClick={() => {
                  const target = definitions.data?.find((d) => d.key === selected.dependsOnKey)
                  if (target) {
                    setSelectedId(target.id)
                    setFeedback(`已定位至前置参数“${target.name}”`)
                    setOperationError('')
                  }
                }}>
                  <Icon name="roadmap" />查看/配置前置参数
                </Button>
              </div>
            </div>
          )}
          <section className="parameter-policy" aria-label="参数策略">
            <div className="parameter-policy__copy"><strong>参数级别</strong><span>{selected.allowedScopes.map((scope) =>
              enumName(systemEnums.data, PARAMETER_SYSTEM_ENUM.scopeType, scope)).join('、')}</span></div>
            <div className="parameter-policy__badges">
              <StatusBadge tone={selected.inheritanceEnabled ? 'success' : 'neutral'}>
                {selected.inheritanceEnabled ? '允许继承' : '禁止继承'}</StatusBadge>
              <StatusBadge tone={selected.cacheEnabled ? 'success' : 'neutral'}>
                {selected.cacheEnabled ? '启用缓存' : '不缓存'}</StatusBadge>
              <StatusBadge>{selected.nullableValue ? '允许显式空值' : '不允许空值'}</StatusBadge>
            </div>
          </section>
          <div className="parameter-values__toolbar"><div><h3>当前值</h3>
            <span>每个作用域只保留一条当前记录；继承与重置默认均作为明确的值模式保存。</span></div>
            <Button onClick={() => setEditingValue(null)}><Icon name="add" />维护当前值</Button></div>
          <TableShell scrollClassName="parameter-table-wrap" footerClassName="parameter-table__footer"
            footer={`${selected.values.length} 条当前值 · 定义修订 ${selected.revision}`}>
            <DataTable className="parameter-table" aria-label="参数当前值">
            <thead><tr><th>作用域</th><th>值模式</th><th>当前内容</th><th>状态</th><th>更新时间</th><th aria-label="操作">操作</th></tr></thead>
            <tbody>{selected.values.map((value) => <tr key={value.id}>
              <td><strong>{value.sdParamScopeTypeText}</strong><code>{scopeDisplay(value)}</code></td>
              <td>{value.sdParamValueModeText}</td><td className="parameter-value-cell">{displayValue(value)}</td>
              <td><StatusBadge tone={value.sdParamStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                {value.sdParamStatusText}</StatusBadge></td><td>{formatDate(value.updatedAt)}</td>
              <td><div className="parameter-row-actions"><Button size="sm" variant="text"
                onClick={() => setEditingValue(value)}>编辑</Button><Button size="sm" variant="text"
                busy={valueStatus.isPending} onClick={() => valueStatus.mutate(value)}>
                {value.sdParamStatus === 'ACTIVE' ? '停用' : '启用'}</Button></div></td>
            </tr>)}</tbody>
          </DataTable>{selected.values.length === 0 && <EmptyState icon="settings" title="尚未维护当前值"
            copy={selected.hasDefaultValue ? '解析时会使用参数默认值；也可维护各作用域的覆盖值。' : '请维护至少一个可解析作用域的当前值。'} />}
          </TableShell>
        </>}
      </Panel>
    </SplitWorkspace>

    {definitionDialog && <ParameterDefinitionDialog
      key={`${definitionDialog}-${definitionDialog === 'edit' ? selected?.id ?? 'missing' : 'new'}`}
      mode={definitionDialog} definition={definitionDialog === 'edit' ? selected : undefined}
      fixedConfigType={fixedConfigType}
      initialCategoryId={categoryFilter || undefined}
      categories={categoryOptions.filter((item) => item.category.sdParamStatus === 'ACTIVE')}
      allDefinitions={allDefinitions.data ?? []}
      systemEnums={systemEnums.data} busy={busy} onClose={() => setDefinitionDialog(undefined)}
      onSave={async (input) => {
        if (definitionDialog === 'create') await createDefinition.mutateAsync(input)
        else await updateDefinition.mutateAsync(input)
        setDefinitionDialog(undefined)
      }} />}
    {confirmDefinitionStatus && selected && <Dialog eyebrow="参数状态"
      title={`确认${selected.sdParamStatus === 'ACTIVE' ? '停用' : '启用'}“${selected.name}”`}
      description={selected.sdParamStatus === 'ACTIVE'
        ? '停用后该参数不能继续维护当前值，已有定义、当前值和变更记录仍会保留。'
        : '启用后该参数可重新维护和解析当前值。'}
      onClose={() => setConfirmDefinitionStatus(false)} closeOnBackdrop={false}
      footer={<><Button variant="secondary" onClick={() => setConfirmDefinitionStatus(false)}>取消</Button>
        <Button variant={selected.sdParamStatus === 'ACTIVE' ? 'danger' : 'primary'} busy={definitionStatus.isPending}
          onClick={() => { definitionStatus.mutate(selected.sdParamStatus !== 'ACTIVE'); setConfirmDefinitionStatus(false) }}>
          确认{selected.sdParamStatus === 'ACTIVE' ? '停用' : '启用'}</Button></>}>
      <p className="master-confirm-note">请确认当前业务状态后再继续。</p>
    </Dialog>}
    {categoryDialog && <ParameterCategoryDialog
      state={categoryDialog} categories={categories.data ?? []}
      busy={createCategory.isPending || updateCategory.isPending || reorderCategories.isPending}
      onClose={() => setCategoryDialog(undefined)} onMove={async (move) => {
        const plan = planCategoryMove(categories.data ?? [], move)
        if (plan.orders.length) await reorderCategories.mutateAsync(plan)
      }} onSave={async (mode, category, input) => {
        if (mode === 'create') return createCategory.mutateAsync({
          parentId: input.parentId, code: input.code, name: input.name,
          description: input.description, sortOrder: input.sortOrder,
        })
        return updateCategory.mutateAsync({ category: category!, input: {
          expectedRevision: category!.revision, parentId: input.parentId, name: input.name,
          description: input.description, sortOrder: input.sortOrder, active: input.active,
        } })
      }} />}
    {editingValue !== undefined && selected && <ParameterValueDialog definition={selected} value={editingValue}
      context={context} systemEnums={systemEnums.data} api={api} busy={saveValue.isPending}
      onClose={() => setEditingValue(undefined)} onSave={(input) => saveValue.mutateAsync(input)} />}
    {showChanges && selected && <ParameterChangesDialog definition={selected} changes={changes.data ?? []}
      loading={changes.isPending} error={changes.error ? errorMessage(changes.error) : ''} busy={rollback.isPending}
      onClose={() => setShowChanges(false)} onRollback={(changeId, valueId) => {
        const value = selected.values.find((item) => item.id === valueId)
        if (!value) { setOperationError('该历史记录对应的当前值不可见，无法恢复'); return }
        rollback.mutate({ changeId, revision: value.revision })
      }} />}
  </>
}

function ParameterCard({ definition, selected, tabIndex, buttonRef, onKeyDown, onSelect }: {
  definition: ParameterDefinitionSummary; selected: boolean; tabIndex: number
  buttonRef: (node: HTMLButtonElement | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void; onSelect: () => void
}) {
  return <button type="button" role="option" aria-selected={selected} tabIndex={tabIndex}
    ref={buttonRef} onKeyDown={onKeyDown}
    className={`parameter-card ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
    <span className="parameter-card__icon"><Icon name="settings" /></span><span className="parameter-card__content">
      <span className="parameter-card__title"><strong>{definition.name}</strong>
        <StatusBadge tone={definition.sdParamStatus === 'ACTIVE' ? 'success' : 'neutral'}>
          {definition.sdParamStatusText}</StatusBadge></span><code>{definition.key}</code>
      <small>{definition.categoryName} · {definition.sdParamConfigTypeText} · {definition.valueCount} 条当前值</small>
      {definition.dependsOnKey && (
        <span className={`parameter-card__dependency ${definition.dependencySatisfied ? 'is-satisfied' : 'is-unsatisfied'}`}>
          <Icon name="roadmap" />
          <span>依赖: {definition.dependsOnName || definition.dependsOnKey}</span>
          {!definition.dependencySatisfied && <span className="dependency-tag">抑制中</span>}
        </span>
      )}
    </span><Icon name="chevron-right" />
  </button>
}

function ParameterDefinitionDialog({ mode, definition, initialCategoryId, categories, allDefinitions, systemEnums, busy, onClose, onSave, fixedConfigType }: {
  mode: 'create' | 'edit'; definition?: ParameterDefinition; initialCategoryId?: string
  categories: CategoryOption[]; allDefinitions?: ParameterDefinitionSummary[]; systemEnums?: SystemEnumDefinition[]; busy: boolean; onClose: () => void
  onSave: (input: ParameterDefinitionInput) => Promise<void>
  fixedConfigType?: 'BUSINESS' | 'SYSTEM'
}) {
  const [categoryId, setCategoryId] = useState(
    definition?.categoryId ?? initialCategoryId ?? categories[0]?.category.id ?? '',
  )
  const [key, setKey] = useState(definition?.key ?? '')
  const [name, setName] = useState(definition?.name ?? '')
  const [description, setDescription] = useState(definition?.description ?? '')
  const [valueType, setValueType] = useState<ParameterValueType>(definition?.sdParamValueType ?? 'STRING')
  const [controlType, setControlType] = useState<ParameterControlType>(definition?.sdParamControlType ?? 'TEXT')
  const [validation, setValidation] = useState(() => readValidationRules(
    definition?.jsonSchema, definition?.sdParamValueType ?? 'STRING',
  ))
  const [nullDefault, setNullDefault] = useState(definition?.defaultValueJson?.trim() === 'null')
  const [defaultValue, setDefaultValue] = useState(definition?.defaultValueJson?.trim() === 'null'
    ? '' : readRawValue(definition?.defaultValueJson))
  const [dictionaryCode, setDictionaryCode] = useState(definition?.dictionaryCode ?? '')
  const [scopeLevel, setScopeLevel] = useState<ParameterScope>(definition?.allowedScopes[0] ?? 'TENANT')
  const [configType, setConfigType] = useState<ParameterConfigType>(definition?.sdParamConfigType ?? fixedConfigType ?? 'BUSINESS')
  const [inheritanceEnabled, setInheritanceEnabled] = useState(definition?.inheritanceEnabled ?? true)
  const [cacheEnabled, setCacheEnabled] = useState(definition?.cacheEnabled ?? true)
  const [nullableValue, setNullableValue] = useState(definition?.nullableValue ?? false)
  const [sensitivity, setSensitivity] = useState<ParameterSensitivity>(definition?.sdParamSensitivity ?? 'NORMAL')
  const [displayPolicy, setDisplayPolicy] = useState<ParameterDisplayPolicy>(definition?.sdParamDisplayPolicy ?? 'PLAIN')
  const [dependsOnKey, setDependsOnKey] = useState(definition?.dependsOnKey ?? '')
  const [dependsOnValue, setDependsOnValue] = useState(definition?.dependsOnValue ?? '')
  const [dependencyBehavior, setDependencyBehavior] = useState<ConfigurationDependencyBehavior>(
    definition?.dependencyBehavior ?? 'DISABLE_AND_SUPPRESS',
  )
  const [validationExpanded, setValidationExpanded] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const compatibleControls = controlsFor(valueType)
  const availableDependencies = useMemo(() => {
    return (allDefinitions ?? []).filter((d) => d.key !== (definition?.key ?? key.trim().toLowerCase()))
  }, [allDefinitions, definition?.key, key])
  const keyError = !key.trim() ? '请输入参数键'
    : !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){1,15}$/.test(key.trim().toLowerCase())
      ? '请使用小写分段命名，例如 outpatient.queue.max-size' : ''
  const jsonSchema = writeValidationSchema(valueType, validation)
  const validationError = validationRulesError(valueType, validation)
  const defaultValueAllowed = sensitivity !== 'SECRET' && controlType !== 'SECRET_REFERENCE'
  const hasNullDefault = defaultValueAllowed && nullableValue && nullDefault
  const hasDefaultValue = defaultValueAllowed
    && (valueType === 'STRING' ? defaultValue.length > 0 : Boolean(defaultValue.trim()))
  const defaultValueError = hasDefaultValue && !hasNullDefault
    ? valueType === 'JSON' ? jsonFieldError(defaultValue, '默认值') : parameterValueError(valueType, defaultValue)
    : ''

  useEffect(() => {
    if (!compatibleControls.includes(controlType)) {
      const fallback = compatibleControls[0]
      setControlType(fallback)
      if (fallback !== 'SECRET_REFERENCE' && sensitivity === 'SECRET') {
        setSensitivity('NORMAL')
      }
    }
  }, [compatibleControls, controlType, sensitivity])


  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (validationError) setValidationExpanded(true)
    if (!categoryId || keyError || !name.trim() || validationError || defaultValueError) return
    try {
      await onSave({ categoryId, key: key.trim().toLowerCase(), name: name.trim(),
        description: optional(description), valueType, controlType, jsonSchema: optional(jsonSchema),
        defaultValueJson: hasNullDefault ? 'null' : hasDefaultValue ? writeJsonValue(valueType, defaultValue) : undefined,
        dictionaryCode: controlType === 'SELECT' ? optional(dictionaryCode)?.toUpperCase() : undefined,
        allowedScopes: [scopeLevel], category: configType, inheritanceEnabled, cacheEnabled, nullableValue,
        sensitivity, displayPolicy,
        dependsOnKey: optional(dependsOnKey),
        dependsOnValue: dependsOnKey ? optional(dependsOnValue) : undefined,
        dependencyBehavior: dependsOnKey ? dependencyBehavior : undefined })
    } catch { /* The page-level mutation error keeps this dialog open for correction. */ }
  }

  return <Dialog title={mode === 'create' ? '新建参数' : '编辑参数定义'} eyebrow="参数定义"
    description="参数键创建后不可修改；已有当前值时不能修改值类型。系统会根据值类型自动保存和校验默认值。"
    onClose={onClose} closeOnBackdrop={false} size="xwide" footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="parameter-definition-form" busy={busy}>{mode === 'create' ? '创建参数' : '保存定义'}</Button></>}>
    <form id="parameter-definition-form" className="parameter-form" onSubmit={submit} noValidate>
      <section className="parameter-form__group" aria-labelledby="parameter-basic-title">
        <header className="parameter-form__group-head"><div><h3 id="parameter-basic-title">基础信息</h3>
          <p>定义参数身份、用途和使用方式。</p></div></header>
        <div className="parameter-form__grid parameter-form__grid--basic">
          <FormField className="parameter-grid__span-4" label="参数名称" required
            error={submitted && !name.trim() ? '请输入参数名称' : undefined}>
            <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></FormField>
          <FormField className="parameter-grid__span-3" label="参数分类" required
            error={submitted && !categoryId ? '请选择参数分类' : undefined}>
            <Select value={categoryId} showValue clearable={false} onChange={setCategoryId}
              options={categories.map((item) => ({ value: item.category.id, label: item.label,
                secondaryText: item.category.code }))} /></FormField>
          <FormField className="parameter-grid__span-5" label="参数键" required
            error={submitted ? keyError || undefined : undefined}
            hint="小写分段命名，例如 outpatient.registration.timeout">
            <input value={key} maxLength={160} readOnly={mode === 'edit'} onChange={(event) => setKey(event.target.value)} /></FormField>
          <FormField className="parameter-grid__span-3" label="值类型" required><Select value={valueType}
            disabled={Boolean(definition?.values.length) || sensitivity === 'SECRET'} showValue clearable={false}
            onChange={(value) => {
              const nextType = value as ParameterValueType
              setValueType(nextType); setDefaultValue(''); setValidation(readValidationRules(undefined, nextType))
            }} options={enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.valueType).map(selectOption)} /></FormField>
          <FormField className="parameter-grid__span-3" label="界面控件" required><Select value={controlType}
            showValue clearable={false}
            onChange={(value) => {
              const nextControl = value as ParameterControlType
              setControlType(nextControl)
              if (nextControl === 'SECRET_REFERENCE') {
                setSensitivity('SECRET'); setDisplayPolicy('HIDDEN'); setDefaultValue('')
              } else if (sensitivity === 'SECRET') {
                setSensitivity('NORMAL'); setDisplayPolicy('PLAIN')
              }
            }}
            options={enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.controlType)
              .filter((item) => compatibleControls.includes(item.code as ParameterControlType)).map(selectOption)} />
          </FormField>
          <FormField className="parameter-grid__span-3" label="配置属性" required><Select value={configType}
            disabled={Boolean(fixedConfigType)}
            showValue clearable={false} onChange={(value) => setConfigType(value as ParameterConfigType)}
            options={enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.configType).map(selectOption)} /></FormField>
          {controlType === 'SECRET_REFERENCE' ? <FormField className="parameter-grid__span-3" label="默认值"
            hint="密钥参数不保存默认明文，只维护安全引用">
            <input value="不适用于密钥引用" readOnly /></FormField>
          : sensitivity !== 'SECRET' && <div
            className={valueType === 'JSON' ? 'parameter-grid__span-12' : 'parameter-grid__span-3'}><FormField label="默认值"
            error={submitted ? defaultValueError || undefined : undefined}
            hint={hasNullDefault ? '未配置当前值时返回空值，不是文本 null' : defaultValueHint(valueType)}>
            {hasNullDefault ? <input value="空值" readOnly /> : defaultValueControl(valueType, defaultValue, setDefaultValue)}
          </FormField>{nullableValue && <Toggle checked={nullDefault} onChange={setNullDefault}
            title="默认值为空" copy="使用空值作为默认值" />}</div>}
          {controlType === 'SELECT' && <FormField className="parameter-grid__span-6" label="绑定字典编码"
            hint="可绑定系统枚举或当前租户的普通枚举字典">
            <input value={dictionaryCode} maxLength={64} onChange={(event) => setDictionaryCode(event.target.value)} /></FormField>}
          <FormField className="parameter-grid__span-12" label="用途说明">
            <input value={description} maxLength={1000} placeholder="请输入参数用途与使用说明"
              onChange={(event) => setDescription(event.target.value)} /></FormField>
        </div>
      </section>

      <section className="parameter-form__group" aria-labelledby="parameter-validation-title">
        <header className="parameter-form__group-head"><div><h3 id="parameter-validation-title">校验规则</h3>
          <p>按值类型配置可理解、可直接校验的业务约束，无需编写 JSON Schema。</p></div>
          <Button size="sm" variant="text" aria-expanded={validationExpanded}
            aria-controls="parameter-validation-content"
            onClick={() => setValidationExpanded((current) => !current)}>
            {validationExpanded ? '收起配置' : '展开配置'}
          </Button></header>
        <div id="parameter-validation-content">
          {!validationExpanded && <div className="parameter-validation-summary">
            <div><strong>{validationTypeLabel(valueType, validation.schemaType)}</strong>
              <span>{validationSummary(valueType, validation)}</span></div>
            <small>展开后可调整规则</small>
          </div>}
          {validationExpanded && <ParameterValidationEditor valueType={valueType} value={validation}
            onChange={setValidation} error={submitted ? validationError || undefined : undefined} />}
        </div>
      </section>

      <section className="parameter-form__group" aria-labelledby="parameter-policy-title">
        <header className="parameter-form__group-head"><div><h3 id="parameter-policy-title">生效策略</h3>
          <p>控制可维护范围、展示方式和解析行为。</p></div></header>
        <div className="parameter-form__grid parameter-form__grid--policy">
          <div className="parameter-policy-fields parameter-policy-fields--three parameter-grid__span-12">
            <FormField label="参数级别" required><Select value={scopeLevel}
              showValue clearable={false} onChange={(value) => setScopeLevel(value as ParameterScope)}
              options={enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.scopeType).map(selectOption)} /></FormField>
            <FormField label="敏感级别" required><Select value={sensitivity}
              showValue clearable={false} onChange={(value) => {
                const nextSensitivity = value as ParameterSensitivity
                setSensitivity(nextSensitivity)
                if (nextSensitivity === 'SECRET') {
                  setControlType('SECRET_REFERENCE'); setDisplayPolicy('HIDDEN'); setDefaultValue('')
                } else if (controlType === 'SECRET_REFERENCE') {
                  setControlType('TEXT')
                  setDisplayPolicy(nextSensitivity === 'SENSITIVE' ? 'MASKED' : 'PLAIN')
                } else if (nextSensitivity === 'SENSITIVE' && displayPolicy === 'PLAIN') {
                  setDisplayPolicy('MASKED')
                }
              }}
              options={enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.sensitivity)
                .filter((item) => valueType === 'STRING' || item.code !== 'SECRET').map(selectOption)} /></FormField>
            <FormField label="展示策略" required><Select value={displayPolicy}
              disabled={sensitivity === 'SECRET'} showValue clearable={false}
              onChange={(value) => setDisplayPolicy(value as ParameterDisplayPolicy)}
              options={enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.displayPolicy)
                .filter((item) => sensitivity === 'NORMAL' || item.code !== 'PLAIN').map(selectOption)} />
            </FormField>
          </div>
          <div className="parameter-toggle-grid parameter-grid__span-12">
            <Toggle checked={inheritanceEnabled} onChange={setInheritanceEnabled} title="允许逐级继承" copy="未维护时继续查找父级与更宽作用域" />
            <Toggle checked={cacheEnabled} onChange={setCacheEnabled} title="启用解析缓存" copy="修改后统一失效，减少高频读取成本" />
            <Toggle checked={nullableValue} onChange={setNullableValue} title="允许显式空值" copy="用 EXPLICIT_NULL 截断继承并返回空值" />
          </div>
        </div>
      </section>

      <section className="parameter-form__group" aria-labelledby="parameter-dependency-title">
        <header className="parameter-form__group-head"><div><h3 id="parameter-dependency-title">前置依赖与联动策略</h3>
          <p>配置本参数生效的前置条件（例如仅当 AI 主开关启用为 MODEL 时模型相关参数才生效）。未满足前置条件时系统将抑制该参数。</p></div></header>
        <div className="parameter-form__grid parameter-form__grid--dependency">
          <FormField className="parameter-grid__span-6" label="前置依赖参数"
            hint="选择本参数依赖的上游参数；留空表示独立生效无依赖">
            <Select aria-label="前置依赖参数" value={dependsOnKey} placeholder="无前置依赖（独立生效）"
              showValue clearable
              onChange={setDependsOnKey} options={[
                { value: '', label: '无前置依赖（独立生效）' },
                ...availableDependencies.map((item) => ({
                  value: item.key,
                  label: `${item.name} (${item.key})`,
                  secondaryText: item.categoryName,
                })),
              ]} />
          </FormField>
          {dependsOnKey && (
            <>
              <FormField className="parameter-grid__span-6" label="期望匹配值"
                hint="满足依赖时的期望值（例如 MODEL 或 true）；留空表示前置参数有任意非空值即可">
                <input value={dependsOnValue} maxLength={500}
                  placeholder="例如: MODEL 或 true"
                  onChange={(event) => setDependsOnValue(event.target.value)} />
              </FormField>
              <FormField className="parameter-grid__span-12" label="未满足时策略"
                hint="当依赖的前置参数未达期望值时的运行时行为">
                <Select aria-label="未满足时策略" value={dependencyBehavior}
                  showValue clearable={false}
                  onChange={(value) => setDependencyBehavior(value as ConfigurationDependencyBehavior)}
                  options={[
                    { value: 'DISABLE_AND_SUPPRESS', label: '禁用并抑制运行时解析（推荐：运行时返回空值）' },
                    { value: 'HIDE', label: '抑制并在业务端隐藏' },
                  ]} />
              </FormField>
            </>
          )}
        </div>
      </section>
    </form>
  </Dialog>
}


type ValidationSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'

interface ParameterValidationRules {
  schemaType: ValidationSchemaType
  minimum: string
  maximum: string
  minLength: string
  maxLength: string
  pattern: string
  enumValues: string
  requiredFields: string
  extraSchema: Record<string, unknown>
}

function ParameterValidationEditor({ valueType, value, onChange, error }: {
  valueType: ParameterValueType
  value: ParameterValidationRules
  onChange: (value: ParameterValidationRules) => void
  error?: string
}) {
  const update = (key: keyof ParameterValidationRules, next: string) => onChange({ ...value, [key]: next })
  const advancedCount = Object.keys(value.extraSchema).length

  return <div className="parameter-validation-editor">
    <div className="parameter-validation-summary">
      <div><strong>{validationTypeLabel(valueType, value.schemaType)}</strong>
        <span>{validationSummary(valueType, value)}</span></div>
      {advancedCount > 0 && <small>已保留 {advancedCount} 项原有高级规则</small>}
    </div>
    {error && <Alert className="parameter-validation-error">{error}</Alert>}
    <div className="parameter-validation-grid">
      {valueType === 'STRING' && <>
        <FormField label="最小长度" hint="留空表示不限制">
          <input type="number" min="0" step="1" inputMode="numeric" value={value.minLength}
            placeholder="不限" onChange={(event) => update('minLength', event.target.value)} /></FormField>
        <FormField label="最大长度" hint="留空表示不限制">
          <input type="number" min="0" step="1" inputMode="numeric" value={value.maxLength}
            placeholder="不限" onChange={(event) => update('maxLength', event.target.value)} /></FormField>
        <FormField className="parameter-validation-grid__span-2" label="格式规则（正则表达式）"
          hint="填写后，参数值必须完整匹配该规则">
          <input value={value.pattern} placeholder="例如 ^[A-Z][A-Z0-9_]*$"
            onChange={(event) => update('pattern', event.target.value)} /></FormField>
        <FormField className="parameter-validation-grid__span-2" label="限定可选值"
          hint="可选；多个值使用逗号分隔">
          <input value={value.enumValues} placeholder="例如 启用, 停用"
            onChange={(event) => update('enumValues', event.target.value)} /></FormField>
      </>}
      {valueType === 'NUMBER' && <>
        <FormField label="数值形式" required><Select value={value.schemaType} clearable={false} showValue
          onChange={(next) => update('schemaType', next)} options={[
            { value: 'number', label: '小数或整数' }, { value: 'integer', label: '仅整数' },
          ]} /></FormField>
        <FormField label="最小值" hint="留空表示不限制">
          <input type="number" step="any" value={value.minimum} placeholder="不限"
            onChange={(event) => update('minimum', event.target.value)} /></FormField>
        <FormField label="最大值" hint="留空表示不限制">
          <input type="number" step="any" value={value.maximum} placeholder="不限"
            onChange={(event) => update('maximum', event.target.value)} /></FormField>
        <FormField label="限定可选值" hint="可选；多个数值使用逗号分隔">
          <input value={value.enumValues} placeholder="例如 5, 10, 15"
            onChange={(event) => update('enumValues', event.target.value)} /></FormField>
      </>}
      {valueType === 'BOOLEAN' && <div className="parameter-validation-empty">
        <strong>布尔值仅允许“是”或“否”</strong><span>系统已自动完成类型校验，无需配置额外规则。</span>
      </div>}
      {valueType === 'JSON' && <>
        <FormField label="数据结构" required><Select value={value.schemaType} clearable={false} showValue
          onChange={(next) => update('schemaType', next)} options={[
            { value: 'object', label: '对象' }, { value: 'array', label: '数组' },
          ]} /></FormField>
        {value.schemaType === 'object' && <FormField className="parameter-validation-grid__span-3" label="必填属性"
          hint="可选；多个属性名使用逗号分隔">
          <input value={value.requiredFields} placeholder="例如 enabled, mode"
            onChange={(event) => update('requiredFields', event.target.value)} /></FormField>}
        {value.schemaType === 'array' && <div className="parameter-validation-empty parameter-validation-grid__span-3">
          <strong>数组结构已限定</strong><span>数组元素的详细结构由业务接口负责校验。</span>
        </div>}
      </>}
    </div>
  </div>
}

function ParameterValueDialog({ definition, value, context, systemEnums, api, busy, onClose, onSave }: {
  definition: ParameterDefinition; value: ParameterValue | null; context: ParameterContext
  systemEnums?: SystemEnumDefinition[]; api: RhnApi; busy: boolean; onClose: () => void
  onSave: (input: ParameterValueInput) => Promise<unknown>
}) {
  const [scopeType, setScopeType] = useState<ParameterScope>(value?.sdParamScopeType ?? definition.allowedScopes[0])
  const [scopeId, setScopeId] = useState(value?.scopeId ?? suggestedScopeId(
    value?.sdParamScopeType ?? definition.allowedScopes[0], context,
  ))
  const [organizationId, setOrganizationId] = useState(context.organization.id)
  const [scopeReference, setScopeReference] = useState(value?.scopeReference ?? '')
  const [valueMode, setValueMode] = useState<ParameterValueMode>(value?.sdParamValueMode ?? 'OVERRIDE')
  const [rawValue, setRawValue] = useState(readRawValue(value?.valueJson))
  const [secretRef, setSecretRef] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const existingDepartment = useQuery({
    queryKey: ['parameter-value-department', value?.scopeId],
    queryFn: () => api.organization.department(value!.scopeId!),
    enabled: Boolean(value?.sdParamScopeType === 'DEPARTMENT' && value.scopeId),
  })
  useEffect(() => {
    const parentId = existingDepartment.data?.department.organizationId
    if (parentId) setOrganizationId(parentId)
  }, [existingDepartment.data])
  const scopeOptions = enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.scopeType)
    .filter((item) => definition.allowedScopes.includes(item.code as ParameterScope))
  const modeOptions = enumOptions(systemEnums, PARAMETER_SYSTEM_ENUM.valueMode).filter((item) => {
    if (item.code === 'INHERIT') return definition.inheritanceEnabled
    if (item.code === 'RESET_DEFAULT') return definition.hasDefaultValue
    if (item.code === 'EXPLICIT_NULL') return definition.nullableValue
    return true
  })
  const target = scopeTarget(scopeType, value, scopeId)
  const missingTarget = target.requiresReference && !scopeReference.trim()
    || target.requiresId && !scopeId.trim()
    || scopeType === 'DEPARTMENT' && !organizationId.trim()
  const referenceError = target.requiresReference && scopeReference.trim()
    && !/^[A-Z0-9][A-Z0-9_.-]{0,127}$/.test(scopeReference.trim().toUpperCase())
      ? '只能使用大写字母、数字、下划线、点和连字符' : ''
  const currentValueError = valueMode === 'OVERRIDE'
    ? definition.sdParamSensitivity === 'SECRET'
      ? !secretRef.trim() ? '请输入密钥引用' : ''
      : definition.key === 'outpatient.direct-visit.catalog-item-id' && !rawValue.trim() ? ''
        : parameterValueError(definition.sdParamValueType, rawValue)
    : ''

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (missingTarget || referenceError || currentValueError) return
    const effectiveValueMode = definition.key === 'outpatient.direct-visit.catalog-item-id'
      && valueMode === 'OVERRIDE' && !rawValue.trim() ? 'EXPLICIT_NULL' : valueMode
    try {
      await onSave({ expectedRevision: value?.revision, scopeType, scopeId: target.scopeId,
        organizationId: scopeType === 'DEPARTMENT' ? organizationId.trim() : undefined,
        scopeReference: target.requiresReference ? scopeReference.trim() : undefined,
        valueMode: effectiveValueMode,
        valueJson: effectiveValueMode === 'OVERRIDE' && definition.sdParamSensitivity !== 'SECRET'
          ? writeJsonValue(definition.sdParamValueType, rawValue) : undefined,
        secretRef: effectiveValueMode === 'OVERRIDE' && definition.sdParamSensitivity === 'SECRET' ? secretRef.trim() : undefined,
        reason: optional(reason) })
    } catch { /* The page-level mutation error keeps this dialog open for correction. */ }
  }

  return <Dialog title={value ? '编辑当前值' : '维护当前值'} eyebrow={definition.name}
    description="作用域由系统根据上下文生成规范编码，不能手工输入。覆盖值会按参数定义的数据类型和校验规则验证。"
    onClose={onClose} closeOnBackdrop={false} size="wide" footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="parameter-value-form" busy={busy}>保存当前值</Button></>}>
    <form id="parameter-value-form" className="parameter-value-form" onSubmit={submit} noValidate>
      <FormField label="作用域" required><Select value={scopeType} disabled={Boolean(value)} showValue clearable={false}
        onChange={(selectedValue) => {
          const next = selectedValue as ParameterScope
          setScopeType(next); setScopeId(suggestedScopeId(next, context)); setOrganizationId(context.organization.id)
          setScopeReference('')
        }} options={scopeOptions.map(selectOption)} /></FormField>
      <FormField label="值模式" required><Select value={valueMode} showValue clearable={false}
        onChange={(selectedValue) => setValueMode(selectedValue as ParameterValueMode)}
        options={modeOptions.map(selectOption)} /></FormField>
      <Alert tone="info" className="parameter-form__span-2">当前目标：{scopeTargetLabel(scopeType, context, value, scopeId)}</Alert>
      {(['PLATFORM', 'TENANT', 'ORGANIZATION', 'DEPARTMENT'] as ParameterScope[]).includes(scopeType)
        && <ConfigurationScopeTarget api={api} scopeType={scopeType as 'PLATFORM' | 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'}
          tenantId={context.tenantId}
          organizationId={scopeType === 'ORGANIZATION' ? scopeId : organizationId}
          departmentId={scopeType === 'DEPARTMENT' ? scopeId : ''}
          onOrganizationChange={(next) => scopeType === 'ORGANIZATION' ? setScopeId(next) : setOrganizationId(next)}
          onDepartmentChange={(next) => { if (scopeType === 'DEPARTMENT') setScopeId(next) }}
          disabled={Boolean(value)} className="parameter-form__span-2" />}
      {scopeType === 'USER' && target.requiresId && <FormField className="parameter-form__span-2" required label={`${enumName(systemEnums, PARAMETER_SYSTEM_ENUM.scopeType, scopeType)}标识`}
        error={submitted && !scopeId.trim() ? '请输入作用域标识' : undefined}
        hint="可填写当前租户内用户的 1 至 19 位标识">
        <input value={scopeId} readOnly={Boolean(value)} inputMode="numeric" pattern="[1-9][0-9]{0,18}"
          onChange={(event) => setScopeId(event.target.value)} /></FormField>}
      {target.requiresReference && <FormField className="parameter-form__span-2" required label={`${enumName(systemEnums, PARAMETER_SYSTEM_ENUM.scopeType, scopeType)}编码`}
        error={submitted ? (!scopeReference.trim() ? '请输入作用域编码' : referenceError || undefined) : undefined}>
        <input value={scopeReference} readOnly={Boolean(value)} maxLength={128}
          onChange={(event) => setScopeReference(event.target.value)} /></FormField>}
      {valueMode === 'OVERRIDE' && definition.sdParamSensitivity === 'SECRET' && <FormField required label="密钥引用"
        error={submitted ? currentValueError || undefined : undefined}
        hint="只保存密钥管理系统中的引用标识，不保存密钥明文">
        <input value={secretRef} maxLength={500} onChange={(event) => setSecretRef(event.target.value)} /></FormField>}
      {valueMode === 'OVERRIDE' && definition.sdParamSensitivity !== 'SECRET' && <ValueControl definition={definition}
        rawValue={rawValue} onChange={setRawValue} systemEnums={systemEnums} api={api}
        organizationId={organizationId}
        required error={submitted ? currentValueError || undefined : undefined} />}
      <FormField className="parameter-form__span-2" label="变更原因"><textarea rows={3} value={reason} maxLength={1000}
        onChange={(event) => setReason(event.target.value)} /></FormField>
    </form>
  </Dialog>
}

function ValueControl({ definition, rawValue, onChange, systemEnums, api, error, required = false, organizationId }: {
  definition: ParameterDefinition; rawValue: string; onChange: (value: string) => void
  systemEnums?: SystemEnumDefinition[]; api: RhnApi; error?: string; required?: boolean; organizationId?: string
}) {
  if (definition.key === 'outpatient.direct-visit.catalog-item-id') {
    return <DirectVisitServiceValue api={api} organizationId={organizationId} value={rawValue} onChange={onChange} error={error} />
  }
  if (definition.sdParamControlType === 'SELECT' && definition.dictionaryCode) {
    const systemOptions = enumOptions(systemEnums, definition.dictionaryCode)
    return <FormField label="参数值" required={required} error={error}>{systemOptions.length
      ? <Select value={rawValue} placeholder="请选择" showValue onChange={onChange}
        options={systemOptions.map(selectOption)} />
      : <DictionarySelect api={api.dictionaries} dictionaryCode={definition.dictionaryCode}
        value={rawValue} placeholder="请选择" onChange={onChange} />}</FormField>
  }
  if (definition.sdParamControlType === 'SWITCH' || definition.sdParamValueType === 'BOOLEAN') {
    return <FormField label="参数值" required={required} error={error}><Select value={rawValue} placeholder="请选择" showValue
      onChange={onChange} options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} /></FormField>
  }
  if (definition.sdParamControlType === 'TEXTAREA' || definition.sdParamControlType === 'JSON_EDITOR') {
    return <FormField label="参数值" required={required} error={error} hint={definition.sdParamValueType === 'JSON' ? '请输入合法 JSON' : undefined}>
      <textarea className={definition.sdParamValueType === 'JSON' ? 'parameter-code-input' : ''} value={rawValue}
        maxLength={20000} onChange={(event) => onChange(event.target.value)} /></FormField>
  }
  return <FormField label="参数值" required={required} error={error}><input type={definition.sdParamValueType === 'NUMBER' ? 'number' : 'text'}
    value={rawValue} onChange={(event) => onChange(event.target.value)} /></FormField>
}

function DirectVisitServiceValue({ api, organizationId, value, onChange, error }: {
  api: RhnApi; organizationId?: string; value: string; onChange: (value: string) => void; error?: string
}) {
  const services = useQuery({ queryKey: ['direct-visit-service-options', organizationId],
    queryFn: () => api.masterData.services('', '', 'ACTIVE', organizationId), enabled: Boolean(organizationId) })
  return <FormField label="直接接诊门诊服务（选填）" error={error || (services.error ? errorMessage(services.error) : undefined)}
    hint="留空不收门诊服务费；配置后按机构有效价格记入本次就诊费用，结算时一起收取。">
    <Select value={value} onChange={onChange} loading={services.isPending && Boolean(organizationId)}
      placeholder="不配置门诊服务费" showValue options={(services.data ?? []).filter(item =>
        item.orderable && item.sdUsageType === 'OUTPATIENT' && item.serviceSubtype === 'OUTPATIENT_VISIT'
        && item.accountingCategory === 'REGISTRATION' && item.organizationAdoption?.sdStatus === 'ACTIVE')
        .map(item => ({ value: item.id, label: item.name, secondaryText: item.code }))} />
  </FormField>
}

function defaultValueControl(valueType: ParameterValueType, value: string, onChange: (value: string) => void) {
  if (valueType === 'BOOLEAN') {
    return <Select value={value} placeholder="不设置默认值" showValue onChange={onChange}
      options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} />
  }
  if (valueType === 'JSON') {
    return <textarea className="parameter-code-input" value={value} maxLength={10000}
      placeholder={'例如 {"enabled": true}'} onChange={(event) => onChange(event.target.value)} />
  }
  return <input type={valueType === 'NUMBER' ? 'number' : 'text'} step={valueType === 'NUMBER' ? 'any' : undefined}
    value={value} placeholder={valueType === 'NUMBER' ? '例如 30 或 0.5' : '请输入默认内容'}
    onChange={(event) => onChange(event.target.value)} />
}

function defaultValueHint(valueType: ParameterValueType) {
  if (valueType === 'NUMBER') return '直接填写数字，无需额外格式'
  if (valueType === 'BOOLEAN') return '选择“是”或“否”'
  if (valueType === 'JSON') return '仅 JSON 类型需要填写合法的 JSON 内容'
  return '直接填写文本，系统会按字符串保存'
}

function ParameterCategoryDialog({ state, categories, busy, onClose, onMove, onSave }: {
  state: CategoryDialogState; categories: ParameterCategory[]; busy: boolean; onClose: () => void
  onMove: (move: TreePanelMove) => Promise<void>
  onSave: (mode: 'create' | 'edit', category: ParameterCategory | undefined,
    input: CategoryEditorInput) => Promise<ParameterCategory>
}) {
  const [selectedId, setSelectedId] = useState(state.category?.id)
  const [editor, setEditor] = useState<CategoryEditorState>(state.mode === 'edit'
    ? { mode: 'edit', categoryId: state.category.id }
    : { mode: 'create', parentId: state.parentId })
  const [savedMessage, setSavedMessage] = useState('')
  const selectedCategory = categories.find((item) => item.id === selectedId)
  const editingCategory = editor.mode === 'edit' ? categories.find((item) => item.id === editor.categoryId) : undefined
  const treeNodes = categories.map((category) => ({
    id: category.id,
    parentId: category.parentId,
    label: category.name,
    secondaryText: category.code,
    keywords: [category.code, category.description ?? ''],
    inactive: category.sdParamStatus === 'INACTIVE',
  }))
  const editorKey = editor.mode === 'edit'
    ? `edit-${editingCategory?.id ?? 'missing'}-${editingCategory?.revision ?? 0}`
    : `create-${editor.parentId ?? 'root'}`

  return <Dialog title="参数分类管理" eyebrow="分类树"
    description="通过树面板维护分类层级；分类编码创建后不可修改，拖拽排序会一次性保存并自动阻止循环。"
    onClose={onClose} closeOnBackdrop={false} size="xwide" footer={<><Button variant="secondary" onClick={onClose}>完成</Button>
      <Button type="submit" form="parameter-category-form" busy={busy}>
        {editor.mode === 'create' ? '创建分类' : '保存分类'}</Button></>}>
    {savedMessage && <Alert tone="success" className="parameter-category-feedback">{savedMessage}</Alert>}
    <div className="parameter-category-workspace">
      <TreePanel title="参数目录" rootLabel="全部分类" nodes={treeNodes} selectedId={selectedId}
        searchPlaceholder="搜索分类名称或编码" busy={busy} onSelect={(id) => { setSelectedId(id); setSavedMessage('') }}
        onAdd={(parentId) => { setEditor({ mode: 'create', parentId }); setSelectedId(parentId); setSavedMessage('') }}
        onEdit={(id) => { setSelectedId(id); setEditor({ mode: 'edit', categoryId: id }); setSavedMessage('') }}
        onMove={async (move) => { await onMove(move); setSavedMessage('分类层级与顺序已保存') }} />
      <section className="parameter-category-editor" aria-label={editor.mode === 'create' ? '新建分类' : '编辑分类'}>
        <header className="parameter-category-editor__head">
          <div><span>{editor.mode === 'create' ? '新建分类' : '编辑分类'}</span>
            <h3>{editor.mode === 'create' ? '补充分类信息' : editingCategory?.name ?? '分类不存在'}</h3></div>
          {selectedCategory && editor.mode === 'create' && <small>将建在“{selectedCategory.name}”下</small>}
        </header>
        {editor.mode === 'edit' && !editingCategory
          ? <EmptyState icon="settings" title="分类不存在" copy="该分类可能已被其他操作更新，请重新选择。" />
          : <ParameterCategoryEditor key={editorKey} mode={editor.mode} category={editingCategory}
            categories={categories} defaultParentId={editor.mode === 'create' ? editor.parentId : undefined}
            busy={busy} onSave={async (input) => {
              const saved = await onSave(editor.mode, editingCategory, input)
              setSelectedId(saved.id); setEditor({ mode: 'edit', categoryId: saved.id })
              setSavedMessage(editor.mode === 'create' ? `已创建分类“${saved.name}”` : `已保存分类“${saved.name}”`)
            }} />}
      </section>
    </div>
  </Dialog>
}

type CategoryEditorState = { mode: 'create'; parentId?: string } | { mode: 'edit'; categoryId: string }
interface CategoryEditorInput {
  parentId?: string
  code: string
  name: string
  description?: string
  sortOrder: number
  active: boolean
}

function ParameterCategoryEditor({ mode, category, categories, defaultParentId, busy, onSave }: {
  mode: 'create' | 'edit'; category?: ParameterCategory; categories: ParameterCategory[]
  defaultParentId?: string; busy: boolean; onSave: (input: CategoryEditorInput) => Promise<void>
}) {
  const [code, setCode] = useState(category?.code ?? '')
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [parentId, setParentId] = useState(category?.parentId ?? defaultParentId ?? '')
  const [active, setActive] = useState(category?.sdParamStatus !== 'INACTIVE')
  const [submitted, setSubmitted] = useState(false)
  const descendants = category ? descendantCategoryIds(categories, category.id) : new Set<string>()
  const options = flattenCategories(categories).filter((item) => item.category.sdParamStatus === 'ACTIVE'
    && item.category.id !== category?.id && !descendants.has(item.category.id))
  const siblingOrders = categories.filter((item) => (item.parentId ?? '') === parentId).map((item) => item.sortOrder)
  const sortOrder = category?.sortOrder ?? (Math.max(0, ...siblingOrders) + 10)
  const codeError = !code.trim() ? '请输入分类编码'
    : !/^[A-Z][A-Z0-9_]{0,63}$/.test(code.trim().toUpperCase())
      ? '必须以字母开头，只能使用大写字母、数字和下划线' : ''

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (busy || codeError || !name.trim()) return
    try {
      await onSave({ parentId: parentId || undefined, code: code.trim().toUpperCase(), name: name.trim(),
        description: optional(description), sortOrder, active })
    } catch { /* Keep open for correction. */ }
  }

  return <form id="parameter-category-form" className="parameter-category-form" onSubmit={submit} noValidate>
    <FormField label="分类名称" required error={submitted && !name.trim() ? '请输入分类名称' : undefined}>
      <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></FormField>
    <FormField label="分类编码" required hint="创建后不可修改，建议使用大写字母和下划线"
      error={submitted ? codeError || undefined : undefined}>
      <input value={code} readOnly={mode === 'edit'} maxLength={64} onChange={(event) => setCode(event.target.value)} /></FormField>
    <FormField className="parameter-form__span-2" label="上级分类" hint="也可直接在左侧拖动分类调整层级">
      <Select value={parentId} placeholder="根分类" showValue onChange={setParentId}
        options={options.map((item) => ({ value: item.category.id, label: item.label, secondaryText: item.category.code }))} /></FormField>
    <FormField className="parameter-form__span-2" label="分类说明"><textarea rows={4} value={description} maxLength={1000}
      onChange={(event) => setDescription(event.target.value)} /></FormField>
    {mode === 'edit' && <div className="parameter-form__span-2"><Toggle checked={active} onChange={setActive}
      title="启用分类" copy="停用后不能用于新建或调整参数定义，已有参数不受影响。" /></div>}
  </form>
}

function ParameterChangesDialog({ definition, changes, loading, error, busy, onClose, onRollback }: {
  definition: ParameterDefinition; changes: Awaited<ReturnType<RhnApi['configuration']['changes']>>
  loading: boolean; error: string; busy: boolean; onClose: () => void
  onRollback: (changeId: string, valueId: string) => void
}) {
  return <Dialog title="参数变更记录" eyebrow={definition.name} onClose={onClose}
    description="变更日志只追加不覆盖。恢复历史值会形成一次新的 ROLLBACK 变更，不会删除后续记录。"
    footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    {loading && <LoadingState label="正在加载变更记录…" />}{error && <Alert>{error}</Alert>}
    {!loading && !error && changes.length === 0 && <EmptyState icon="tasks" title="暂无变更记录" copy="该参数尚未产生变更。" />}
    <ol className="parameter-change-list">{changes.map((change) => <li key={change.id}>
      <div><div><strong>{change.sdParamChangeTypeText}</strong><StatusBadge>{change.sdParamChangeTargetTypeText}</StatusBadge></div>
        {change.sdParamChangeTargetType === 'VALUE' && change.valueId && <Button size="sm" variant="text" busy={busy}
          onClick={() => onRollback(change.id, change.valueId!)}>恢复此快照</Button>}</div>
      <p>{change.reason || '未填写变更原因'}</p>
      <small>{formatDate(change.changedAt)} · 操作用户 {change.changedBy} · 请求 {change.requestCode}</small>
      <details><summary>查看前后快照</summary><pre>{JSON.stringify({ before: change.before ?? null, after: change.after ?? null }, null, 2)}</pre></details>
    </li>)}</ol>
  </Dialog>
}

function Toggle({ checked, onChange, title, copy }: { checked: boolean; onChange: (value: boolean) => void; title: string; copy: string }) {
  return <label className="parameter-toggle"><input type="checkbox" checked={checked}
    onChange={(event) => onChange(event.target.checked)} /><span><strong>{title}</strong><small>{copy}</small></span></label>
}

interface CategoryOption { category: ParameterCategory; label: string; depth: number }

function flattenCategories(categories: ParameterCategory[]): CategoryOption[] {
  const byParent = new Map<string, ParameterCategory[]>()
  for (const category of categories) {
    const key = category.parentId ?? ''
    byParent.set(key, [...(byParent.get(key) ?? []), category])
  }
  const result: CategoryOption[] = []
  const visit = (parentId: string, depth: number) => {
    for (const category of (byParent.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      result.push({
        category,
        label: `${'　'.repeat(depth)}${depth ? '└ ' : ''}${category.name}`,
        depth,
      })
      visit(category.id, depth + 1)
    }
  }
  visit('', 0)
  return result
}

function descendantCategoryIds(categories: ParameterCategory[], categoryId: string) {
  const children = new Map<string, string[]>()
  for (const category of categories) {
    if (!category.parentId) continue
    children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id])
  }
  const result = new Set<string>()
  const visit = (id: string) => {
    for (const childId of children.get(id) ?? []) { result.add(childId); visit(childId) }
  }
  visit(categoryId)
  return result
}

function planCategoryMove(categories: ParameterCategory[], move: TreePanelMove) {
  const moved = categories.find((item) => item.id === move.nodeId)
  if (!moved || move.parentId === moved.id || descendantCategoryIds(categories, moved.id).has(move.parentId ?? '')) {
    return { next: categories, orders: [] }
  }
  const byParent = new Map<string, ParameterCategory[]>()
  for (const category of categories) {
    const key = category.parentId ?? ''
    byParent.set(key, [...(byParent.get(key) ?? []), category].sort(categorySort))
  }
  const oldParentKey = moved.parentId ?? ''
  const newParentKey = move.parentId ?? ''
  const oldSiblings = (byParent.get(oldParentKey) ?? []).filter((item) => item.id !== moved.id)
  const newSiblings = oldParentKey === newParentKey
    ? oldSiblings
    : (byParent.get(newParentKey) ?? []).filter((item) => item.id !== moved.id)
  const originalIndex = (byParent.get(oldParentKey) ?? []).findIndex((item) => item.id === moved.id)
  const adjustedIndex = oldParentKey === newParentKey && originalIndex >= 0 && originalIndex < move.index
    ? move.index - 1 : move.index
  newSiblings.splice(Math.max(0, Math.min(adjustedIndex, newSiblings.length)), 0, { ...moved, parentId: move.parentId })
  byParent.set(newParentKey, newSiblings)
  if (oldParentKey !== newParentKey) byParent.set(oldParentKey, oldSiblings)

  const affectedIds = new Set([...(byParent.get(oldParentKey) ?? []), ...(byParent.get(newParentKey) ?? [])]
    .map((item) => item.id))
  const updated = new Map<string, ParameterCategory>()
  for (const parentKey of new Set([oldParentKey, newParentKey])) {
    ;(byParent.get(parentKey) ?? []).forEach((item, index) => updated.set(item.id, {
      ...item,
      parentId: parentKey || undefined,
      sortOrder: (index + 1) * 10,
    }))
  }
  const next = categories.map((item) => updated.get(item.id) ?? item)
  const orders = next.filter((item) => affectedIds.has(item.id)).flatMap((item) => {
    const original = categories.find((value) => value.id === item.id)!
    if ((original.parentId ?? '') === (item.parentId ?? '') && original.sortOrder === item.sortOrder) return []
    return [{ id: item.id, expectedRevision: original.revision, parentId: item.parentId, sortOrder: item.sortOrder }]
  })
  return { next, orders }
}

function categorySort(a: ParameterCategory, b: ParameterCategory) {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
}

function enumOptions(definitions: SystemEnumDefinition[] | undefined, code: string): SystemEnumItem[] {
  return systemEnumItems(definitions, code)
}

function enumName(definitions: SystemEnumDefinition[] | undefined, code: string, value: string) {
  return enumOptions(definitions, code).find((item) => item.code === value)?.name ?? value
}

function selectOption(item: SystemEnumItem) { return { value: item.code, label: item.name } }

function readValidationRules(schemaJson: string | undefined, valueType: ParameterValueType): ParameterValidationRules {
  const fallback: ParameterValidationRules = {
    schemaType: defaultSchemaType(valueType), minimum: '', maximum: '', minLength: '', maxLength: '',
    pattern: '', enumValues: '', requiredFields: '', extraSchema: {},
  }
  if (!schemaJson?.trim()) return fallback
  try {
    const parsed = JSON.parse(schemaJson) as Record<string, unknown>
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return fallback
    const schemaType = typeof parsed.type === 'string' && schemaTypeMatchesValueType(parsed.type, valueType)
      ? parsed.type as ValidationSchemaType : fallback.schemaType
    const enumValues = Array.isArray(parsed.enum) && parsed.enum.every((item) => {
      if (valueType === 'STRING') return typeof item === 'string'
      if (valueType === 'NUMBER') return typeof item === 'number'
      return false
    }) ? parsed.enum.map(String).join('\n') : ''
    const requiredFields = Array.isArray(parsed.required) && parsed.required.every((item) => typeof item === 'string')
      ? parsed.required.join('\n') : ''
    const managed = new Set(['type', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'required'])
    if (enumValues) managed.add('enum')
    const extraSchema = Object.fromEntries(Object.entries(parsed).filter(([key]) => !managed.has(key)))
    return {
      schemaType,
      minimum: typeof parsed.minimum === 'number' ? String(parsed.minimum) : '',
      maximum: typeof parsed.maximum === 'number' ? String(parsed.maximum) : '',
      minLength: typeof parsed.minLength === 'number' ? String(parsed.minLength) : '',
      maxLength: typeof parsed.maxLength === 'number' ? String(parsed.maxLength) : '',
      pattern: typeof parsed.pattern === 'string' ? parsed.pattern : '',
      enumValues,
      requiredFields,
      extraSchema,
    }
  } catch { return fallback }
}

function writeValidationSchema(valueType: ParameterValueType, rules: ParameterValidationRules) {
  const schema: Record<string, unknown> = { ...rules.extraSchema, type: rules.schemaType }
  if (valueType === 'STRING') {
    assignNumberRule(schema, 'minLength', rules.minLength)
    assignNumberRule(schema, 'maxLength', rules.maxLength)
    if (rules.pattern.trim()) schema.pattern = rules.pattern.trim()
    const options = splitRuleValues(rules.enumValues)
    if (options.length) schema.enum = options
  }
  if (valueType === 'NUMBER') {
    assignNumberRule(schema, 'minimum', rules.minimum)
    assignNumberRule(schema, 'maximum', rules.maximum)
    const options = splitRuleValues(rules.enumValues)
    if (options.length && options.every((item) => Number.isFinite(Number(item)))) schema.enum = options.map(Number)
  }
  if (valueType === 'JSON' && rules.schemaType === 'object') {
    const required = splitRuleValues(rules.requiredFields)
    if (required.length) schema.required = required
  }
  return JSON.stringify(schema)
}

function validationRulesError(valueType: ParameterValueType, rules: ParameterValidationRules) {
  if (valueType === 'NUMBER') {
    const minimum = rules.minimum.trim() ? Number(rules.minimum) : undefined
    const maximum = rules.maximum.trim() ? Number(rules.maximum) : undefined
    if (minimum !== undefined && !Number.isFinite(minimum)) return '最小值必须是有效数值'
    if (maximum !== undefined && !Number.isFinite(maximum)) return '最大值必须是有效数值'
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) return '最小值不能大于最大值'
    if (splitRuleValues(rules.enumValues).some((item) => !Number.isFinite(Number(item)))) return '限定可选值必须全部为有效数值'
  }
  if (valueType === 'STRING') {
    const minimum = nonNegativeInteger(rules.minLength)
    const maximum = nonNegativeInteger(rules.maxLength)
    if (rules.minLength.trim() && minimum === undefined) return '最小长度必须是非负整数'
    if (rules.maxLength.trim() && maximum === undefined) return '最大长度必须是非负整数'
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) return '最小长度不能大于最大长度'
    if (rules.pattern.trim()) {
      try { new RegExp(rules.pattern) } catch { return '格式规则不是有效的正则表达式' }
    }
  }
  return ''
}

function validationSummary(valueType: ParameterValueType, rules: ParameterValidationRules) {
  if (valueType === 'BOOLEAN') return '类型约束由系统自动完成'
  const parts: string[] = []
  if (valueType === 'STRING') {
    if (rules.minLength || rules.maxLength) parts.push(`长度 ${rules.minLength || '0'}～${rules.maxLength || '不限'}`)
    if (rules.pattern.trim()) parts.push('已配置格式规则')
  }
  if (valueType === 'NUMBER') {
    if (rules.minimum || rules.maximum) parts.push(`范围 ${rules.minimum || '不限'}～${rules.maximum || '不限'}`)
  }
  if (valueType === 'JSON' && rules.schemaType === 'object' && rules.requiredFields.trim()) parts.push('已配置必填属性')
  if (rules.enumValues.trim()) parts.push(`${splitRuleValues(rules.enumValues).length} 个可选值`)
  return parts.length ? parts.join(' · ') : '当前仅校验值类型，可按需补充业务约束'
}

function validationTypeLabel(valueType: ParameterValueType, schemaType: ValidationSchemaType) {
  if (valueType === 'STRING') return '字符串规则'
  if (valueType === 'NUMBER') return schemaType === 'integer' ? '整数规则' : '数值规则'
  if (valueType === 'BOOLEAN') return '布尔值规则'
  return schemaType === 'array' ? 'JSON 数组规则' : 'JSON 对象规则'
}

function defaultSchemaType(valueType: ParameterValueType): ValidationSchemaType {
  if (valueType === 'STRING') return 'string'
  if (valueType === 'NUMBER') return 'number'
  if (valueType === 'BOOLEAN') return 'boolean'
  return 'object'
}

function schemaTypeMatchesValueType(schemaType: string, valueType: ParameterValueType) {
  if (valueType === 'STRING') return schemaType === 'string'
  if (valueType === 'NUMBER') return ['number', 'integer'].includes(schemaType)
  if (valueType === 'BOOLEAN') return schemaType === 'boolean'
  return ['object', 'array'].includes(schemaType)
}

function splitRuleValues(value: string) {
  return value.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean)
}

function assignNumberRule(schema: Record<string, unknown>, key: string, value: string) {
  if (value.trim() && Number.isFinite(Number(value))) schema[key] = Number(value)
}

function nonNegativeInteger(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function controlsFor(valueType: ParameterValueType): ParameterControlType[] {
  if (valueType === 'STRING') return ['TEXT', 'TEXTAREA', 'SELECT', 'SECRET_REFERENCE']
  if (valueType === 'NUMBER') return ['NUMBER', 'SELECT']
  if (valueType === 'BOOLEAN') return ['SWITCH', 'SELECT']
  return ['JSON_EDITOR']
}

function scopeTarget(scope: ParameterScope, value: ParameterValue | null, scopeId: string) {
  const requiresReference = ['PRODUCT', 'MODULE', 'ENVIRONMENT'].includes(scope)
  const requiresId = ['ORGANIZATION', 'DEPARTMENT', 'USER'].includes(scope)
  return { scopeId: requiresId ? (value?.scopeId ?? scopeId) : undefined, requiresReference, requiresId }
}

function suggestedScopeId(scope: ParameterScope, context: ParameterContext) {
  if (scope === 'ORGANIZATION') return context.organization.id
  if (scope === 'DEPARTMENT') return context.department.id
  if (scope === 'USER') return context.userId ?? ''
  return ''
}

function scopeTargetLabel(scope: ParameterScope, context: ParameterContext, value: ParameterValue | null, scopeId: string) {
  if (value) return scopeDisplay(value)
  if (scope === 'PLATFORM') return '全平台'
  if (scope === 'TENANT') return `当前租户（${context.tenantId}）`
  if (scope === 'ORGANIZATION') return scopeId === context.organization.id ? `${context.organization.name}（${scopeId}）` : `机构 ${scopeId || '待填写'}`
  if (scope === 'DEPARTMENT') return scopeId === context.department.id ? `${context.department.name}（${scopeId}）` : `科室 ${scopeId || '待填写'}`
  if (scope === 'USER') return scopeId === context.userId ? `当前用户（${scopeId}）` : `用户 ${scopeId || '待填写'}`
  return '保存时将根据下方业务编码生成规范作用域'
}

function scopeDisplay(value: ParameterValue) { return value.scopeReference ?? value.scopeId ?? value.scopeCode }

function displayValue(value: ParameterValue) {
  if (value.sdParamValueMode !== 'OVERRIDE') return '—'
  if (value.secretReference) return '密钥引用（已隐藏）'
  if (!value.hasValue) return '已隐藏'
  return value.displayValue ?? value.valueJson ?? '—'
}

function readRawValue(valueJson?: string) {
  if (!valueJson) return ''
  try { const value = JSON.parse(valueJson); return typeof value === 'string' ? value : JSON.stringify(value, null, 2) } catch { return valueJson }
}

function writeJsonValue(type: ParameterValueType, rawValue: string) {
  if (type === 'STRING') return JSON.stringify(rawValue)
  if (type === 'NUMBER') return JSON.stringify(Number(rawValue))
  if (type === 'BOOLEAN') return rawValue
  return JSON.stringify(JSON.parse(rawValue))
}

function jsonFieldError(value: string, label: string) {
  if (!value.trim()) return ''
  try { JSON.parse(value); return '' } catch { return `${label}必须是合法 JSON` }
}

function parameterValueError(type: ParameterValueType, value: string) {
  if (!value.trim()) return '请输入参数值'
  if (type === 'NUMBER' && !Number.isFinite(Number(value))) return '请输入有效数值'
  if (type === 'BOOLEAN' && !['true', 'false'].includes(value)) return '请选择是或否'
  if (type === 'JSON') return jsonFieldError(value, '参数值')
  return ''
}

function optional(value: string) { return value.trim() || undefined }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
