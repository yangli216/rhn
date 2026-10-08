import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import '../../styles/features/operational-master-data.css'
import '../../styles/features/treatment-skintest.css'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  errorMessage, PARAMETER_SYSTEM_ENUM, systemEnumItems,
  type ConfigurationDependencyBehavior,
  type ParameterCategory, type ParameterChange, type ParameterConfigType, type ParameterControlType,
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
import type { ServiceCatalogItem } from '../../shared/api/masterDataApi'
import { ParameterJsonNumber, compareParameterNumbers, isParameterJsonNumber, isParameterNumberText, parseParameterJson, stringifyParameterJson } from './parameterJson'
import { requireSavedParameterValue } from './parameterValueReceipt'
import { parameterControlsFor as controlsFor, requireParameterDefinition } from './parameterDefinitionFacts'
import { requireSavedParameterDefinition, type ParameterDefinitionCommand } from './parameterDefinitionReceipt'
import { parameterRollbackIssue, prepareParameterRollback, requireParameterChanges, requireParameterValueActionResult, type ParameterValueAction } from './parameterValueAction'
import { mergeConfirmedCategories, requireCreatedCategory, requireParameterCategories, requireReorderedCategories, requireUpdatedCategory } from './parameterCategoryFacts'
import { ConfigurationScopeTarget, useConfigurationScopeTarget } from './ConfigurationScopeTarget'

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
  const categorySession = useRef(0)
  const categoryContext = JSON.stringify([context.tenantId, context.organization.id, context.department.id, context.userId])
  const currentCategoryContext = useRef(categoryContext)
  currentCategoryContext.current = categoryContext
  const [editingValue, setEditingValue] = useState<ParameterValue | null | undefined>(undefined)
  const [showChanges, setShowChanges] = useState(false)
  const [confirmDefinitionStatus, setConfirmDefinitionStatus] = useState<ParameterDefinition>()
  const definitionDraftSource = useRef<ParameterDefinition | undefined>(undefined)
  const definitionSession = useRef(0)
  const definitionRequestCodes = useRef(new Map<string, string>())
  const definitionContextKey = JSON.stringify([context.tenantId, context.organization.id, context.department.id, context.userId, selectedId])
  const currentDefinitionContext = useRef(definitionContextKey)
  currentDefinitionContext.current = definitionContextKey
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])

  const systemEnums = useQuery({
    queryKey: ['dictionary-system-enums'], queryFn: api.dictionaries.systemEnums, staleTime: Infinity,
  })
  const categories = useQuery({ queryKey: ['parameter-categories'], queryFn: async () => requireParameterCategories(await api.configuration.categories()) })
  const allDefinitions = useQuery({
    queryKey: ['parameter-definitions-all'],
    queryFn: async () => requireParameterList(await api.configuration.definitions(), '参数总览'),
  })
  const definitions = useQuery({
    queryKey: ['parameter-definitions', query, categoryFilter, effectiveConfigType, statusFilter],
    queryFn: async () => requireParameterList(await api.configuration.definitions(query, categoryFilter, effectiveConfigType, statusFilter), '参数目录'),
  })
  const detail = useQuery({
    queryKey: ['parameter-definition', selectedId, context.tenantId, context.organization.id, context.department.id, context.userId], queryFn: async () => {
      return requireParameterDefinition(await api.configuration.get(selectedId!), selectedId!, context.tenantId)
    },
    enabled: Boolean(selectedId),
  })
  const changes = useQuery({
    queryKey: ['parameter-changes', selectedId, context.tenantId, context.organization.id, context.department.id, context.userId],
    queryFn: async () => requireParameterChanges(await api.configuration.changes(selectedId!), selectedId!),
    enabled: Boolean(selectedId && showChanges),
  })

  const categoriesReady = categories.isSuccess && !categories.isFetching
  const totalsReady = allDefinitions.isSuccess && !allDefinitions.isFetching
  const catalogReady = definitions.isSuccess && !definitions.isFetching
  const detailReady = catalogReady && definitions.data.some((item) => item.id === selectedId)
    && detail.isSuccess && !detail.isFetching && Boolean(detail.data)
  const enumsReady = systemEnums.isSuccess && !systemEnums.isFetching && Boolean(systemEnums.data)
  const definitionFormReady = categoriesReady && totalsReady && enumsReady
    && (definitionDialog !== 'edit' || detailReady)

  async function refreshParameterFacts() {
    await Promise.all([categories.refetch(), allDefinitions.refetch(), definitions.refetch(), systemEnums.refetch(),
      ...(selectedId ? [detail.refetch()] : []), ...(selectedId && showChanges ? [changes.refetch()] : [])])
  }

  function requireCurrentDetail() {
    if (!detailReady) throw new Error('参数当前状态尚未确认，请刷新后再操作')
    return requireParameterDefinition(detail.data, selectedId!, context.tenantId)
  }

  useEffect(() => {
    if (!catalogReady) return
    const list = definitions.data ?? []
    const selectedIndex = list.findIndex((item) => item.id === selectedId)
    if (list.length && selectedIndex < 0) setSelectedId(list[0].id)
    if (selectedIndex >= 0) setCatalogPage(Math.floor(selectedIndex / DIRECTORY_PAGE_SIZE))
    if (!list.length) setSelectedId(undefined)
  }, [catalogReady, definitions.data, selectedId])

  useEffect(() => { setCatalogPage(0) }, [query, categoryFilter, configTypeFilter, statusFilter])

  useEffect(() => {
    definitionSession.current += 1
    categorySession.current += 1
    setCategoryDialog(undefined)
    setDefinitionDialog(undefined)
    setEditingValue(undefined)
    setConfirmDefinitionStatus(undefined)
    setShowChanges(false)
  }, [context.tenantId, context.organization.id, context.department.id, context.userId])


  async function acceptChange(next: ParameterDefinition, message: string, expectedId = selectedId!) {
    requireParameterDefinition(next, expectedId, context.tenantId)
    queryClient.setQueryData(['parameter-definition', next.id, context.tenantId, context.organization.id, context.department.id, context.userId], next)
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

  const definitionWrite = useMutation({
    mutationFn: async (command: ParameterDefinitionCommand) => {
      if (command.kind !== 'create' && requireCurrentDetail().id !== command.before.id) throw new Error('参数目标已变化，请重新打开后核对')
      const commandKey = JSON.stringify([definitionContextKey, command])
      let requestCode = definitionRequestCodes.current.get(commandKey)
      if (!requestCode) {
        requestCode = crypto.randomUUID()
        definitionRequestCodes.current.set(commandKey, requestCode)
      }
      const result = command.kind === 'create' ? await api.configuration.create(command.input, requestCode)
        : command.kind === 'update' ? await api.configuration.update(command.before.id, command.before.revision, command.input, requestCode)
          : await api.configuration.changeStatus(command.before.id, command.before.revision, command.enabled, requestCode)
      const next = requireSavedParameterDefinition(command, result, context.tenantId)
      definitionRequestCodes.current.delete(commandKey)
      return next
    },
    onMutate: () => { setFeedback(''); setOperationError(''); return { key: definitionContextKey, session: definitionSession.current } },
    onSuccess: (next, command, submitted) => {
      if (submitted.key !== currentDefinitionContext.current || submitted.session !== definitionSession.current) return
      setDefinitionDialog(undefined)
      setConfirmDefinitionStatus(undefined)
      return acceptChange(next, command.kind === 'create' ? `已创建参数“${next.name}”`
        : command.kind === 'update' ? `已更新参数“${next.name}”` : `参数状态已更新为“${next.sdParamStatusText}”`, next.id)
    },
    onError: (error, _command, submitted) => {
      if (submitted?.key === currentDefinitionContext.current && submitted.session === definitionSession.current) refreshAfterError(error)
    },
  })

  function openDefinitionDialog(mode: 'create' | 'edit') {
    definitionSession.current += 1
    definitionDraftSource.current = mode === 'edit' ? requireCurrentDetail() : undefined
    definitionWrite.reset()
    setDefinitionDialog(mode)
  }

  const definitionSaveError = definitionWrite.context?.key === definitionContextKey
    && definitionWrite.context.session === definitionSession.current && definitionWrite.error
    ? errorMessage(definitionWrite.error) : undefined
  const valueRequestCodes = useRef(new Map<string, string>())
  const valueContextKey = JSON.stringify([context.tenantId, context.organization.id, context.department.id, context.userId, selectedId])
  const currentValueContext = useRef(valueContextKey)
  currentValueContext.current = valueContextKey
  const valueActionSession = useRef(0)
  const valueActionRequests = useRef(new Map<string, string>())
  useEffect(() => { valueActionSession.current += 1 }, [valueContextKey])
  const saveValue = useMutation({
    mutationFn: async (input: ParameterValueInput) => {
      const current = requireCurrentDetail()
      const commandKey = JSON.stringify([valueContextKey, current.id, input])
      let requestCode = valueRequestCodes.current.get(commandKey)
      if (!requestCode) {
        requestCode = crypto.randomUUID()
        valueRequestCodes.current.set(commandKey, requestCode)
      }
      const result = await api.configuration.saveValue(current.id, input, requestCode)
      const next = requireParameterDefinition(requireSavedParameterValue(current, result, input, context.tenantId), current.id, context.tenantId)
      valueRequestCodes.current.delete(commandKey)
      return next
    },
    onMutate: () => { setFeedback(''); setOperationError(''); return valueContextKey },
    onSuccess: (next, _input, submittedContext) => {
      if (submittedContext === currentValueContext.current) {
        return acceptChange(next, '参数当前值已保存').then(() => {
          if (submittedContext === currentValueContext.current) setEditingValue(undefined)
        })
      }
    },
    onError: (error, _input, submittedContext) => {
      if (submittedContext === currentValueContext.current) refreshAfterError(error)
    },
  })
  const valueAction = useMutation({
    mutationFn: async (command: ParameterValueAction) => {
      const current = requireCurrentDetail()
      if (current.id !== command.before.id || !current.values.some(value => value.id === command.value.id)) throw new Error('当前值目标已变化，请重新选择')
      if (command.kind === 'rollback') {
        if (!changes.isSuccess || changes.isFetching) throw new Error('历史记录尚未确认，请重新加载')
        const history = changes.data.find(change => change.id === command.change.id)
        if (!history || history.requestCode !== command.change.requestCode || JSON.stringify(history.after) !== JSON.stringify(command.change.after)) {
          throw new Error('历史记录已变化，请重新选择快照')
        }
        prepareParameterRollback(command.before, command.change)
      }
      const key = JSON.stringify([valueContextKey, command])
      let requestCode = valueActionRequests.current.get(key)
      if (!requestCode) { requestCode = crypto.randomUUID(); valueActionRequests.current.set(key, requestCode) }
      const result = command.kind === 'status'
        ? await api.configuration.changeValueStatus(command.before.id, command.value, command.enabled, requestCode)
        : await api.configuration.rollback(command.before.id, command.change.id, command.value.revision, '人工恢复历史快照', requestCode)
      const next = requireParameterValueActionResult(command, result, context.tenantId)
      valueActionRequests.current.delete(key)
      return next
    },
    onMutate: () => { setFeedback(''); setOperationError(''); return { key: valueContextKey, session: valueActionSession.current } },
    onSuccess: (next, command, submitted) => {
      if (submitted.key === currentValueContext.current && submitted.session === valueActionSession.current) {
        return acceptChange(next, command.kind === 'status' ? '参数当前值状态已更新' : '已将历史快照恢复为新的当前值', command.before.id)
      }
    },
    onError: (error, command, submitted) => {
      if (submitted?.key === currentValueContext.current && submitted.session === valueActionSession.current) {
        refreshAfterError(error)
        if (command.kind === 'rollback') void queryClient.invalidateQueries({ queryKey: ['parameter-changes', command.before.id] })
      }
    },
  })
  const valueActionError = valueAction.context?.key === valueContextKey && valueAction.context.session === valueActionSession.current
    && valueAction.error ? errorMessage(valueAction.error) : undefined
  const categorySubmission = () => {
    categorySession.current += 1
    setFeedback(''); setOperationError('')
    return { key: categoryContext, session: categorySession.current }
  }
  const isCurrentCategorySubmission = (submitted?: { key: string; session: number }) => submitted?.key === currentCategoryContext.current && submitted.session === categorySession.current
  const categoryError = (error: unknown, _input: unknown, submitted?: { key: string; session: number }) => {
    if (!isCurrentCategorySubmission(submitted)) return
    setOperationError(errorMessage(error))
    void queryClient.invalidateQueries({ queryKey: ['parameter-categories'] })
  }
  const createCategory = useMutation({
    mutationFn: async (input: Parameters<RhnApi['configuration']['createCategory']>[0]) => {
      const before = requireParameterCategories(categories.data)
      return requireCreatedCategory(await api.configuration.createCategory(input), input, before)
    },
    onMutate: categorySubmission,
    onSuccess: async (next, _input, submitted) => {
      if (!isCurrentCategorySubmission(submitted)) return
      queryClient.setQueryData(['parameter-categories'], (current: unknown) => mergeConfirmedCategories(current, [next]))
      setFeedback('参数分类已创建'); setOperationError('')
      await queryClient.invalidateQueries({ queryKey: ['parameter-categories'] })
    },
    onError: categoryError,
  })
  const updateCategory = useMutation({
    mutationFn: async ({ category, input }: { category: ParameterCategory; input: Parameters<RhnApi['configuration']['updateCategory']>[1] }) => {
      const before = requireParameterCategories(categories.data)
      if (!before.some(item => item.id === category.id)) throw new Error('参数分类未确认：原分类已不在目录中，请重新加载并核实')
      const next = requireUpdatedCategory(await api.configuration.updateCategory(category.id, input), category, input)
      requireParameterCategories(before.map(item => item.id === category.id ? next : item))
      return next
    },
    onMutate: categorySubmission,
    onSuccess: async (next, _input, submitted) => {
      if (!isCurrentCategorySubmission(submitted)) return
      queryClient.setQueryData(['parameter-categories'], (current: unknown) => mergeConfirmedCategories(current, [next]))
      setFeedback('参数分类已更新'); setOperationError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['parameter-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['parameter-definitions'] }),
        queryClient.invalidateQueries({ queryKey: ['parameter-definition'] }),
      ])
    },
    onError: categoryError,
  })
  const reorderCategories = useMutation({
    mutationFn: async ({ orders }: ReturnType<typeof planCategoryMove>) => {
      const before = requireParameterCategories(categories.data)
      return requireReorderedCategories(await api.configuration.reorderCategories(orders), before, orders)
    },
    onMutate: categorySubmission,
    onSuccess: (next, _input, submitted) => {
      if (!isCurrentCategorySubmission(submitted)) return
      queryClient.setQueryData(['parameter-categories'], (current: unknown) => mergeConfirmedCategories(current, next))
      setFeedback('参数分类顺序已保存'); setOperationError('')
    },
    onError: categoryError,
    onSettled: (_result, _error, _input, submitted) => isCurrentCategorySubmission(submitted)
      ? queryClient.invalidateQueries({ queryKey: ['parameter-categories'] }) : undefined,
  })
  const categorySaveError = [createCategory, updateCategory, reorderCategories].find(mutation => mutation.error && isCurrentCategorySubmission(mutation.context))?.error

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
    return match ? match.name : '分类待确认'
  }, [categories.data, categoryFilter])

  const configTypeOptions = enumOptions(systemEnums.data, PARAMETER_SYSTEM_ENUM.configType)
  const statusOptions = enumOptions(systemEnums.data, PARAMETER_SYSTEM_ENUM.status)
  const selected = detail.data
  const dependency = parameterDependencyPresentation(selected?.dependencySatisfied)
  const definitionList = catalogReady ? definitions.data : []
  const catalogPageCount = Math.max(1, Math.ceil(definitionList.length / DIRECTORY_PAGE_SIZE))
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount - 1)
  const pageDefinitions = definitionList.slice(safeCatalogPage * DIRECTORY_PAGE_SIZE,
    (safeCatalogPage + 1) * DIRECTORY_PAGE_SIZE)
  const parameterRovingId = pageDefinitions.some((item) => item.id === selectedId)
    ? selectedId : pageDefinitions[0]?.id
  const queryError = systemEnums.error || categories.error || allDefinitions.error || definitions.error || detail.error
  const busy = definitionWrite.isPending
    || saveValue.isPending || valueAction.isPending

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
      actions={<>{queryError && <Button variant="secondary" onClick={() => void refreshParameterFacts()}>重新加载参数</Button>}
        <Button className="parameter-page-action" variant="secondary" disabled={!categoriesReady} onClick={() => {
          categorySession.current += 1; createCategory.reset(); updateCategory.reset(); reorderCategories.reset(); setCategoryDialog({ mode: 'create' })
        }}>
        管理分类</Button><Button className="parameter-page-action" disabled={!definitionFormReady || !categories.data?.some((item) => item.sdParamStatus === 'ACTIVE')}
          onClick={() => openDefinitionDialog('create')}><Icon name="add" />新建参数</Button></>} />

    {feedback && <Alert tone="success" className="parameter-feedback">{feedback}</Alert>}
    {(operationError || queryError) && <Alert className="parameter-feedback">
      {operationError || errorMessage(queryError)}</Alert>}

    <SplitWorkspace className="parameter-workspace">
      <Panel className="parameter-category-nav">
        {categories.isFetching && <LoadingState label="正在加载参数分类…" />}
        {categories.isError && <EmptyState icon="error" title="参数分类加载失败" copy="请重新加载后再操作分类。" />}
        {categoriesReady && <TreePanel title="参数分类" headingLevel={2} rootLabel="全部参数"
          rootMeta={totalsReady ? `${allDefinitions.data.filter((item) => !fixedConfigType || item.sdParamConfigType === fixedConfigType).length} 项参数` : '数量待确认'} searchLabel="搜索分类"
          searchPlaceholder="搜索分类名称或编码" selectedId={categoryFilter || undefined}
          nodes={categoryOptions.map(({ category }) => ({
            id: category.id, parentId: category.parentId || undefined, label: category.name,
            keywords: [category.code], inactive: category.sdParamStatus !== 'ACTIVE',
            secondaryText: `${totalsReady ? `${categoryCountMap[category.id] ?? 0} 项` : '数量待确认'}${category.sdParamStatus !== 'ACTIVE' ? ' · 已停用' : ''}`,
          }))}
          onSelect={id => {
            setCategoryFilter(id ?? '')
            setFeedback('')
            setOperationError('')
          }} />}
      </Panel>

      <Panel className="parameter-catalog">
        <PanelHead title={currentCategoryName} meta={catalogReady ? `${definitionList.length} 项` : '数量待确认'} />
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
          {definitions.isFetching && <LoadingState label="正在加载参数…" />}
          {definitions.isError && <EmptyState icon="error" title="参数目录加载失败" copy="请重新加载后再选择参数。" />}
          {pageDefinitions.map((definition, index) => <ParameterCard key={definition.id} definition={definition}
            tabIndex={definition.id === parameterRovingId ? 0 : -1}
            buttonRef={(node) => { cardRefs.current[index] = node }}
            onKeyDown={(event) => handleCardKeyDown(event, index)}
            selected={definition.id === selectedId} onSelect={() => {
              setSelectedId(definition.id); setFeedback(''); setOperationError('')
            }} />)}
          {catalogReady && definitionList.length === 0 && <EmptyState icon="search"
            title="未找到匹配参数" copy={categories.data?.length ? '请调整筛选条件，或新建一个参数。' : '请先创建参数分类。'} />}
        </div>
        {catalogReady && <Pagination page={safeCatalogPage} totalPages={catalogPageCount} label="参数目录分页"
          onChange={(nextPage) => {
            setCatalogPage(nextPage)
            const first = definitionList[nextPage * DIRECTORY_PAGE_SIZE]
            if (first) setSelectedId(first.id)
          }} />}
      </Panel>

      <Panel className="parameter-detail">
        {detail.isFetching && selectedId && <LoadingState label="正在加载参数详情…" />}
        {detail.isError && <EmptyState icon="error" title="参数详情加载失败" copy="当前值及状态尚未确认，请重新加载。" />}
        {catalogReady && definitionList.length === 0 && <EmptyState icon="settings" title="暂无参数"
          copy="创建参数分类和参数定义后，即可按作用域维护当前值。" />}
        {detailReady && selected && <>
          <header className="parameter-detail__head">
            <div><div className="parameter-title-row"><h2>{selected.name}</h2>
              <StatusBadge tone={selected.sdParamStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                {selected.sdParamStatusText}</StatusBadge></div>
              <code>{selected.key}</code><p>{selected.description || '暂无用途说明'}</p></div>
            <div className="parameter-detail__actions">
              <Button variant="secondary" onClick={() => setShowChanges(true)}>变更记录</Button>
              <Button variant="secondary" disabled={!categoriesReady || !totalsReady || !enumsReady} onClick={() => openDefinitionDialog('edit')}>编辑定义</Button>
              <Button variant={selected.sdParamStatus === 'ACTIVE' ? 'danger' : 'secondary'}
                busy={definitionWrite.isPending}
                onClick={() => { definitionSession.current += 1; definitionWrite.reset(); setConfirmDefinitionStatus(requireCurrentDetail()) }}>
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
            <div className={`parameter-dependency-banner ${selected.dependencySatisfied === true ? 'is-satisfied' : 'is-unsatisfied'}`} role="status">
              <div className="parameter-dependency-banner__icon">
                <Icon name={selected.dependencySatisfied === true ? 'check' : 'warning'} />
              </div>
              <div className="parameter-dependency-banner__content">
                <div className="parameter-dependency-banner__title">
                  <strong>前置依赖预览：{dependency.label}</strong>
                  <StatusBadge tone={dependency.tone}>
                    {dependency.label}
                  </StatusBadge>
                </div>
                <p>
                  本参数依赖于 <code>{selected.dependsOnName || selected.dependsOnKey}</code>
                  {selected.dependsOnValue ? <>，期望匹配值：<code>{selected.dependsOnValue}</code>。</> : '，期望具有任意非空有效值。'}
                  {dependency.copy} 当前结果按本次请求的租户、用户、机构及科室预览；业务使用时按实际上下文判断。
                </p>
              </div>
              <div className="parameter-dependency-banner__action">
                {typeof selected.dependencySatisfied !== 'boolean' && <Button size="sm" variant="secondary"
                  onClick={() => void detail.refetch()}>重新判断依赖</Button>}
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
            <Button disabled={!enumsReady || valueAction.isPending} onClick={() => { saveValue.reset(); setEditingValue(null) }}><Icon name="add" />维护当前值</Button></div>
          {valueActionError && valueAction.variables?.kind === 'status' && <div role="alert"><p>{valueActionError}</p>
            <Button variant="secondary" busy={valueAction.isPending} disabled={!detailReady}
              onClick={() => valueAction.variables && valueAction.mutate(valueAction.variables)}>重试本次操作</Button></div>}
          <TableShell scrollClassName="parameter-table-wrap" footerClassName="parameter-table__footer"
            footer={`${selected.values.length} 条当前值 · 定义修订 ${selected.revision}`}>
            <DataTable className="parameter-table" aria-label="参数当前值">
            <thead><tr><th>作用域</th><th>值模式</th><th>当前内容</th><th>状态</th><th>更新时间</th><th aria-label="操作">操作</th></tr></thead>
            <tbody>{selected.values.map((value) => <tr key={value.id}>
              <td><strong>{value.sdParamScopeTypeText}</strong><code>{scopeDisplay(value)}</code></td>
              <td>{value.sdParamValueModeText}</td><td className="parameter-value-cell">{displayValue(value)}</td>
              <td><StatusBadge tone={value.sdParamStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                {value.sdParamStatusText}</StatusBadge></td><td>{formatDate(value.updatedAt)}</td>
              <td><div className="parameter-row-actions"><Button size="sm" variant="text" disabled={valueAction.isPending}
                onClick={() => { saveValue.reset(); setEditingValue(value) }}>编辑</Button><Button size="sm" variant="text"
                busy={valueAction.isPending} onClick={() => valueAction.mutate({ kind: 'status', before: selected, value, enabled: value.sdParamStatus !== 'ACTIVE' })}>
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
      systemEnums={systemEnums.data} busy={busy} available={definitionFormReady} saveError={definitionSaveError}
      onRefresh={refreshParameterFacts} onClose={() => { definitionSession.current += 1; setDefinitionDialog(undefined) }}
      onSave={async (input) => {
        if (!definitionFormReady) throw new Error('参数定义资料尚未确认，请重新加载')
        if (definitionDialog === 'create') await definitionWrite.mutateAsync({ kind: 'create', input })
        else {
          const before = definitionDraftSource.current
          if (!before) throw new Error('参数定义原始资料尚未确认，请重新打开')
          await definitionWrite.mutateAsync({ kind: 'update', before, input })
        }
      }} />}
    {confirmDefinitionStatus && <Dialog eyebrow="参数状态"
      title={`确认${confirmDefinitionStatus.sdParamStatus === 'ACTIVE' ? '停用' : '启用'}“${confirmDefinitionStatus.name}”`}
      description={confirmDefinitionStatus.sdParamStatus === 'ACTIVE'
        ? '停用后该参数不能继续维护当前值，已有定义、当前值和变更记录仍会保留。'
        : '启用后该参数可重新维护和解析当前值。'}
      onClose={() => { if (!definitionWrite.isPending) { definitionSession.current += 1; setConfirmDefinitionStatus(undefined) } }} closeOnBackdrop={false}
      footer={<><Button variant="secondary" disabled={definitionWrite.isPending} onClick={() => { definitionSession.current += 1; setConfirmDefinitionStatus(undefined) }}>取消</Button>
        <Button variant={confirmDefinitionStatus.sdParamStatus === 'ACTIVE' ? 'danger' : 'primary'} busy={definitionWrite.isPending} disabled={!detailReady}
          onClick={() => definitionWrite.mutate({ kind: 'status', before: confirmDefinitionStatus, enabled: confirmDefinitionStatus.sdParamStatus !== 'ACTIVE' })}>
          确认{confirmDefinitionStatus.sdParamStatus === 'ACTIVE' ? '停用' : '启用'}</Button></>}>
      {!detailReady && <ParameterVerificationNotice onRefresh={refreshParameterFacts} />}
      {definitionSaveError && <p role="alert">{definitionSaveError}</p>}
      <p className="master-confirm-note">请确认当前业务状态后再继续。</p>
    </Dialog>}
    {categoryDialog && <ParameterCategoryDialog
      state={categoryDialog} categories={categories.data ?? []} available={categoriesReady} onRefresh={refreshParameterFacts}
      saveError={categorySaveError ? `分类操作未确认：${errorMessage(categorySaveError)}。请重新加载核实。` : undefined}
      busy={createCategory.isPending || updateCategory.isPending || reorderCategories.isPending}
      onClose={() => { categorySession.current += 1; setCategoryDialog(undefined) }} onMove={async (move) => {
        if (!categoriesReady) throw new Error('参数分类尚未确认，请重新加载')
        const plan = planCategoryMove(categories.data ?? [], move)
        if (!plan.orders.length) return false
        await reorderCategories.mutateAsync(plan)
        return true
      }} onSave={async (mode, category, input) => {
        if (!categoriesReady) throw new Error('参数分类尚未确认，请重新加载')
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
      saveError={saveValue.context === valueContextKey && saveValue.error ? errorMessage(saveValue.error) : undefined}
      available={detailReady && enumsReady} onRefresh={refreshParameterFacts}
      onClose={() => setEditingValue(undefined)} onSave={(input) => saveValue.mutateAsync(input)} />}
    {showChanges && selected && <ParameterChangesDialog definition={selected} changes={changes.isSuccess && !changes.isFetching ? changes.data : []}
      loading={changes.isFetching} error={changes.error ? errorMessage(changes.error) : ''} busy={valueAction.isPending}
      operationError={valueAction.variables?.kind === 'rollback' ? valueActionError : undefined}
      onRetry={() => valueAction.variables && valueAction.mutate(valueAction.variables)}
      available={detailReady && changes.isSuccess && !changes.isFetching} onRefresh={refreshParameterFacts}
      onClose={() => { if (valueAction.variables?.kind === 'rollback') valueActionSession.current += 1; setShowChanges(false) }} onRollback={(change) => {
        if (!detailReady || !changes.isSuccess || changes.isFetching) return
        try { valueAction.mutate(prepareParameterRollback(selected, change)) }
        catch (error) { setOperationError(errorMessage(error)) }
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
        <span className={`parameter-card__dependency ${definition.dependencySatisfied === true ? 'is-satisfied' : 'is-unsatisfied'}`}>
          <Icon name="roadmap" />
          <span>依赖: {definition.dependsOnName || definition.dependsOnKey}</span>
          <span className="dependency-tag">{parameterDependencyPresentation(definition.dependencySatisfied).label}</span>
        </span>
      )}
    </span><Icon name="chevron-right" />
  </button>
}

function ParameterDefinitionDialog({ mode, definition, initialCategoryId, categories, allDefinitions, systemEnums, busy, available, saveError, onRefresh, onClose, onSave, fixedConfigType }: {
  mode: 'create' | 'edit'; definition?: ParameterDefinition; initialCategoryId?: string
  categories: CategoryOption[]; allDefinitions?: ParameterDefinitionSummary[]; systemEnums?: SystemEnumDefinition[]; busy: boolean; onClose: () => void
  onSave: (input: ParameterDefinitionInput) => Promise<void>
  fixedConfigType?: 'BUSINESS' | 'SYSTEM'
  available: boolean; saveError?: string; onRefresh: () => Promise<void>
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
  const [validationEdited, setValidationEdited] = useState(false)
  const [rawSchema, setRawSchema] = useState(definition?.jsonSchema ?? '')
  const [rawSchemaMode, setRawSchemaMode] = useState(Boolean(validation.sourceIssue))
  const [defaultDraft, setDefaultDraft] = useState<{ text: string; kind: 'VALUE' | 'NULL' | 'EMPTY_STRING' }>()
  const defaultState = defaultDraft ?? {
    text: definition?.defaultValueJson?.trim() === 'null' ? '' : readRawValue(definition?.defaultValueJson, definition?.sdParamValueType ?? 'STRING'),
    kind: definition?.defaultValueJson?.trim() === 'null' ? 'NULL'
      : definition?.sdParamValueType === 'STRING' && definition.defaultValueJson?.trim() === '""' ? 'EMPTY_STRING' : 'VALUE',
  }
  const defaultValue = defaultState.text
  const nullDefault = defaultState.kind === 'NULL'
  const emptyStringDefault = defaultState.kind === 'EMPTY_STRING'
  const defaultEdited = defaultDraft !== undefined
  const setDefaultValue = (text: string) => setDefaultDraft({ text, kind: 'VALUE' })
  const setNullDefault = (checked: boolean) => setDefaultDraft({ text: defaultValue, kind: checked ? 'NULL' : 'VALUE' })
  const setEmptyStringDefault = (checked: boolean) => setDefaultDraft({ text: defaultValue, kind: checked ? 'EMPTY_STRING' : 'VALUE' })
  const [unitDraft, setUnit] = useState<string>()
  const unit = unitDraft ?? definition?.unit ?? ''
  const [exampleDraft, setExampleJson] = useState<string>()
  const exampleJson = exampleDraft ?? definition?.exampleValueJson ?? ''
  const exampleEdited = exampleDraft !== undefined
  const [dictionaryCode, setDictionaryCode] = useState(definition?.dictionaryCode ?? '')
  const [scopeLevels, setScopeLevels] = useState<ParameterScope[]>(definition ? definition.allowedScopes ?? [] : ['TENANT'])
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
  const jsonSchema = rawSchemaMode ? rawSchema : validationEdited
    ? writeValidationSchema(valueType, validation) : definition?.jsonSchema ?? ''
  const validationError = rawSchemaMode ? readValidationRules(rawSchema, valueType).sourceIssue ?? ''
    : validationEdited ? validationRulesError(valueType, validation) : validation.sourceIssue ?? ''
  const defaultValueAllowed = sensitivity !== 'SECRET' && controlType !== 'SECRET_REFERENCE'
  const hasNullDefault = defaultValueAllowed && nullableValue && nullDefault
  const hasEmptyStringDefault = defaultValueAllowed && valueType === 'STRING' && emptyStringDefault && !hasNullDefault
  const hasDefaultValue = defaultValueAllowed && (hasEmptyStringDefault
    || (valueType === 'STRING' ? defaultValue.length > 0 : Boolean(defaultValue.trim())))
  const protectedSource = definition && (definition.sdParamSensitivity !== 'NORMAL' || definition.sdParamDisplayPolicy !== 'PLAIN')
  const missingDefault = definition?.hasDefaultValue && definition.defaultValueJson == null
  const missingExample = definition?.hasExampleValue && definition.exampleValueJson == null
  const sourceFieldsUnconfirmed = missingDefault && !protectedSource && !defaultEdited || missingExample && !protectedSource && !exampleEdited
  const defaultValueError = defaultValueAllowed && nullDefault && !nullableValue ? '默认值为空时必须允许空值，请修改默认值或开启允许空值。'
    : missingDefault && !protectedSource && !defaultEdited
    ? '原默认值未返回，请重新确认配置或明确填写替代值。'
    : hasDefaultValue && !hasNullDefault && valueType !== 'STRING'
      ? valueType === 'JSON' ? jsonFieldError(defaultValue, '默认值') : parameterValueError(valueType, defaultValue)
      : ''
  const exampleError = missingExample && !protectedSource && !exampleEdited
    ? '原示例值未返回，请重新确认配置或明确填写替代值。'
    : exampleJson.trim() ? parameterJsonValueError(valueType, exampleJson, '示例值') : ''

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
    if (!available || busy || !categoryId || keyError || !name.trim() || !scopeLevels.length || validationError || defaultValueError || exampleError) return
    try {
      await onSave({ categoryId, key: key.trim().toLowerCase(), name: name.trim(),
        description: optional(description), valueType, controlType, jsonSchema: optional(jsonSchema),
        defaultValueJson: hasNullDefault ? 'null' : hasEmptyStringDefault ? '""' : hasDefaultValue ? writeJsonValue(valueType, defaultValue) : undefined,
        unit: optional(unit), exampleValueJson: optional(exampleJson),
        dictionaryCode: controlType === 'SELECT' ? optional(dictionaryCode)?.toUpperCase() : undefined,
        allowedScopes: scopeLevels, category: configType, inheritanceEnabled, cacheEnabled, nullableValue,
        sensitivity, displayPolicy,
        dependsOnKey: optional(dependsOnKey),
        dependsOnValue: dependsOnKey ? optional(dependsOnValue) : undefined,
        dependencyBehavior: dependsOnKey ? dependencyBehavior : undefined })
    } catch { /* The page-level mutation error keeps this dialog open for correction. */ }
  }

  return <Dialog title={mode === 'create' ? '新建参数' : '编辑参数定义'} eyebrow="参数定义"
    description="参数键创建后不可修改；已有当前值时不能修改值类型。系统会根据值类型自动保存和校验默认值。"
    onClose={() => { if (!busy) onClose() }} closeOnBackdrop={false} size="xwide" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button type="submit" form="parameter-definition-form" busy={busy} disabled={!available || Boolean(sourceFieldsUnconfirmed)}>{mode === 'create' ? '创建参数' : '保存定义'}</Button></>}>
    {(!available || sourceFieldsUnconfirmed) && <ParameterVerificationNotice onRefresh={onRefresh} />}
    {saveError && <p role="alert">{saveError}</p>}
    <form id="parameter-definition-form" className="parameter-form" onSubmit={submit} inert={busy} noValidate>
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
              setValidationEdited(true); setRawSchema(''); setRawSchemaMode(false)
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
            hint={hasNullDefault ? '未配置当前值时返回空值，不是文本 null'
              : hasEmptyStringDefault ? missingDefault && protectedSource
                ? '默认值将替换为空字符串；关闭此选项并留空会保留原受保护默认值。'
                : '默认值为长度 0 的字符串；关闭此选项并留空可取消默认值。'
                : missingDefault && protectedSource ? '已有默认值受保护；留空保留原值，填写新值替换。' : defaultValueHint(valueType)}>
            {hasNullDefault ? <input value="空值" readOnly /> : hasEmptyStringDefault ? <input value="" placeholder="空字符串（长度 0）" readOnly />
              : defaultValueControl(valueType, defaultValue, setDefaultValue)}
          </FormField>{valueType === 'STRING' && <Toggle checked={emptyStringDefault} onChange={setEmptyStringDefault} title="使用空字符串默认值" copy={'保存为 ""，不等于未配置'} />}
          {nullableValue && <Toggle checked={nullDefault} onChange={setNullDefault} title="默认值为空" copy="使用空值作为默认值" />}</div>}
          <FormField className="parameter-grid__span-3" label="计量单位" hint="无单位可留空">
            <input value={unit} maxLength={32} onChange={event => setUnit(event.target.value)} /></FormField>
          <FormField className="parameter-grid__span-6" label="示例值（JSON）"
            error={submitted ? exampleError || undefined : undefined}
            hint={missingExample && protectedSource ? '已有示例值受保护；留空保留原值，填写新值替换。'
              : '按参数类型填写 JSON，例如字符串使用双引号；留空表示不配置示例。'}>
            <textarea rows={2} value={exampleJson} maxLength={10000}
              onChange={event => setExampleJson(event.target.value)} /></FormField>
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
          <p>未编辑的规则保持原样；复杂约束可通过原始 JSON 编辑。</p></div>
          {!rawSchemaMode && <Button size="sm" variant="text" aria-expanded={validationExpanded}
            aria-controls="parameter-validation-content"
            onClick={() => setValidationExpanded((current) => !current)}>
            {validationExpanded ? '收起配置' : '展开配置'}
          </Button>}</header>
        <div id="parameter-validation-content">
          {rawSchemaMode ? <FormField label="原始校验规则（JSON）"
            error={validationError || undefined} hint="留空表示不配置附加规则；保存时由服务端校验规则。">
            <textarea value={rawSchema} rows={6} onChange={(event) => setRawSchema(event.target.value)} />
          </FormField> : <>
          {!validationExpanded && <div className="parameter-validation-summary">
            <div><strong>{validationTypeLabel(valueType, validation.schemaType)}</strong>
              <span>{validationSummary(valueType, validation)}</span></div>
            <small>展开后可调整规则</small>
          </div>}
          {validationExpanded && <ParameterValidationEditor valueType={valueType} value={validation}
            onChange={(next) => { setValidation(next); setValidationEdited(true) }}
            error={submitted ? validationError || undefined : undefined} />}
          <Button size="sm" variant="text" onClick={() => {
            setRawSchema(jsonSchema); setRawSchemaMode(true)
          }}>查看或编辑原始规则</Button>
          </>}
        </div>
      </section>

      <section className="parameter-form__group" aria-labelledby="parameter-policy-title">
        <header className="parameter-form__group-head"><div><h3 id="parameter-policy-title">生效策略</h3>
          <p>控制可维护范围、展示方式和解析行为。</p></div></header>
        <div className="parameter-form__grid parameter-form__grid--policy">
          <div className="parameter-policy-fields parameter-policy-fields--three parameter-grid__span-12">
            <FormField label="参数级别" required hint="可多选，至少保留一个允许维护的作用域"
              error={submitted && !scopeLevels.length ? '至少选择一个参数级别' : undefined}>
              <Select multiple value={scopeLevels}
              showValue clearable={false} onChange={(values) => setScopeLevels(values as ParameterScope[])}
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


type ValidationSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'any'

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
  sourceSchema: Record<string, unknown>
  sourceIssue?: string
}

function ParameterValidationEditor({ valueType, value, onChange, error }: {
  valueType: ParameterValueType
  value: ParameterValidationRules
  onChange: (value: ParameterValidationRules) => void
  error?: string
}) {
  const update = (key: keyof ParameterValidationRules, next: string) => onChange({ ...value, [key]: next })
  const advancedCount = Object.keys(value.extraSchema).length
  const rawEnumRequired = Array.isArray(value.sourceSchema.enum) && value.sourceSchema.enum.some((item) =>
    valueType === 'STRING' ? typeof item !== 'string' || !item.length || item.trim() !== item || /[\n\r,，]/.test(item)
      : !isParameterJsonNumber(item))
  const rawRequiredFields = Array.isArray(value.sourceSchema.required) && value.sourceSchema.required.some((item) =>
    typeof item === 'string' && (item.trim() !== item || /[\n\r,，]/.test(item)))

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
          hint="使用 Java 正则语法；保存时由服务端校验，参数值必须完整匹配">
          <input value={value.pattern} placeholder="例如 ^[A-Z][A-Z0-9_]*$"
            onChange={(event) => update('pattern', event.target.value)} /></FormField>
        {rawEnumRequired ? <FormField className="parameter-validation-grid__span-2" label="限定可选值（原始数组）"
          hint="此数组不能无损转换为逗号分隔的文本，请通过原始规则编辑。">
          <textarea readOnly value={stringifyParameterJson(value.sourceSchema.enum)} rows={2} /></FormField>
        : <FormField className="parameter-validation-grid__span-2" label="限定可选值"
          hint="可选；多个值使用逗号分隔">
          <input value={value.enumValues} placeholder="例如 启用, 停用"
            onChange={(event) => update('enumValues', event.target.value)} /></FormField>}
      </>}
      {valueType === 'NUMBER' && <>
        <FormField label="数值形式" required><Select value={value.schemaType} clearable={false} showValue
          onChange={(next) => update('schemaType', next)} options={[
            { value: 'number', label: '小数或整数' }, { value: 'integer', label: '仅整数' },
          ]} /></FormField>
        <FormField label="最小值" hint="留空表示不限制">
          <input inputMode="decimal" value={value.minimum} placeholder="不限"
            onChange={(event) => update('minimum', event.target.value)} /></FormField>
        <FormField label="最大值" hint="留空表示不限制">
          <input inputMode="decimal" value={value.maximum} placeholder="不限"
            onChange={(event) => update('maximum', event.target.value)} /></FormField>
        {rawEnumRequired ? <FormField label="限定可选值（原始数组）" hint="请通过原始规则编辑此数组。">
          <textarea readOnly value={stringifyParameterJson(value.sourceSchema.enum)} rows={2} /></FormField>
        : <FormField label="限定可选值" hint="可选；多个数值使用逗号分隔">
          <input value={value.enumValues} placeholder="例如 5, 10, 15"
            onChange={(event) => update('enumValues', event.target.value)} /></FormField>}
      </>}
      {valueType === 'BOOLEAN' && <div className="parameter-validation-empty">
        <strong>布尔值仅允许“是”或“否”</strong><span>已有附加规则继续保留，可查看原始规则。</span>
      </div>}
      {valueType === 'JSON' && <>
        <FormField label="数据结构" required><Select value={value.schemaType} clearable={false} showValue
          onChange={(next) => update('schemaType', next)} options={[
            { value: 'any', label: '对象或数组（未限定）' },
            { value: 'object', label: '对象' }, { value: 'array', label: '数组' },
          ]} /></FormField>
        {value.schemaType === 'object' && (rawRequiredFields
          ? <FormField className="parameter-validation-grid__span-3" label="必填属性（原始数组）"
            hint="此字段名数组包含分隔符或首尾空格，请通过原始规则编辑。">
            <textarea readOnly value={stringifyParameterJson(value.sourceSchema.required)} rows={2} /></FormField>
          : <FormField className="parameter-validation-grid__span-3" label="必填属性"
          hint="可选；多个属性名使用逗号分隔">
          <input value={value.requiredFields} placeholder="例如 enabled, mode"
            onChange={(event) => update('requiredFields', event.target.value)} /></FormField>)}
        {value.schemaType === 'array' && <div className="parameter-validation-empty parameter-validation-grid__span-3">
          <strong>数组结构已限定</strong><span>附加约束请查看原始规则，实际校验以服务端支持的规则为准。</span>
        </div>}
      </>}
    </div>
  </div>
}

function ParameterValueDialog({ definition, value, context, systemEnums, api, busy, available, saveError, onRefresh, onClose, onSave }: {
  definition: ParameterDefinition; value: ParameterValue | null; context: ParameterContext
  systemEnums?: SystemEnumDefinition[]; api: RhnApi; busy: boolean; onClose: () => void
  available: boolean; saveError?: string; onRefresh: () => Promise<void>
  onSave: (input: ParameterValueInput) => Promise<unknown>
}) {
  const [scopeType, setScopeType] = useState<ParameterScope>(value?.sdParamScopeType ?? definition.allowedScopes[0])
  const [scopeId, setScopeId] = useState(value?.scopeId ?? suggestedScopeId(
    value?.sdParamScopeType ?? definition.allowedScopes[0], context,
  ))
  const [selectedOrganizationId, setOrganizationId] = useState(context.organization.id)
  const [scopeReference, setScopeReference] = useState(value?.scopeReference ?? '')
  const [valueMode, setValueMode] = useState<ParameterValueMode>(value?.sdParamValueMode ?? 'OVERRIDE')
  const [rawValue, setRawValue] = useState(readRawValue(value?.valueJson, definition.sdParamValueType))
  const [secretRef, setSecretRef] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const needsExistingDepartment = value?.sdParamScopeType === 'DEPARTMENT'
  const existingDepartment = useQuery({
    queryKey: ['parameter-value-department', context.tenantId, value?.scopeId],
    queryFn: async () => {
      if (!value?.scopeId) throw new Error('当前科室参数缺少科室标识')
      const result = await api.organization.department(value.scopeId)
      if (result?.department?.id !== value.scopeId || typeof result.department.organizationId !== 'string'
        || !result.department.organizationId.trim()) throw new Error('科室归属响应不完整或与当前科室不符')
      return result
    },
    enabled: needsExistingDepartment,
  })
  const departmentReady = !needsExistingDepartment || existingDepartment.isSuccess && !existingDepartment.isFetching
  const organizationId = needsExistingDepartment
    ? departmentReady ? existingDepartment.data!.department.organizationId : ''
    : scopeType === 'ORGANIZATION' ? scopeId : selectedOrganizationId
  const scopeVerification = useConfigurationScopeTarget({ api, scopeType, tenantId: context.tenantId,
    organizationId, departmentId: scopeType === 'DEPARTMENT' ? scopeId : '', enabled: departmentReady })
  const isDirectVisitService = definition.key === 'outpatient.direct-visit.catalog-item-id' && definition.sdParamSensitivity !== 'SECRET'
  const needsService = isDirectVisitService && valueMode === 'OVERRIDE'
  const services = useQuery({
    queryKey: ['direct-visit-service-options', context.tenantId, organizationId],
    queryFn: async () => requireDirectVisitServices(await api.masterData.services('', '', 'ACTIVE', organizationId)),
    enabled: needsService && scopeVerification.ready && Boolean(organizationId),
  })
  const servicesReady = scopeVerification.ready && Boolean(organizationId) && services.isSuccess && !services.isFetching
  const serviceOptions = servicesReady ? services.data! : []
  const serviceError = needsService
    ? !servicesReady ? '门诊服务目录尚未确认，不能保存覆盖值。'
      : !rawValue ? '请选择门诊服务；如不收费，请明确选择“不配置门诊服务费”。'
        : !serviceOptions.some(item => item.id === rawValue) ? `原门诊服务（${rawValue}）不在当前机构可选目录中，请重新选择或明确不配置。` : ''
    : ''
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
      : isDirectVisitService ? serviceError
        : parameterValueError(definition.sdParamValueType, rawValue)
    : ''

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (!available || busy || !departmentReady || !scopeVerification.ready || missingTarget || referenceError || currentValueError) return
    try {
      await onSave({ expectedRevision: value?.revision, scopeType, scopeId: target.scopeId,
        organizationId: scopeType === 'DEPARTMENT' ? organizationId.trim() : undefined,
        scopeReference: target.requiresReference ? scopeReference.trim() : undefined,
        valueMode,
        valueJson: valueMode === 'OVERRIDE' && definition.sdParamSensitivity !== 'SECRET'
          ? writeJsonValue(definition.sdParamValueType, rawValue) : undefined,
        secretRef: valueMode === 'OVERRIDE' && definition.sdParamSensitivity === 'SECRET' ? secretRef.trim() : undefined,
        reason: optional(reason) })
    } catch { /* The page-level mutation error keeps this dialog open for correction. */ }
  }

  return <Dialog title={value ? '编辑当前值' : '维护当前值'} eyebrow={definition.name}
    description="作用域由系统根据上下文生成规范编码，不能手工输入。覆盖值会按参数定义的数据类型和校验规则验证。"
    onClose={() => { if (!busy) onClose() }} closeOnBackdrop={false} size="wide" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button type="submit" form="parameter-value-form" busy={busy} disabled={!available || !departmentReady || !scopeVerification.ready || Boolean(serviceError)}>保存当前值</Button></>}>
    {!available && <ParameterVerificationNotice onRefresh={onRefresh} />}
    {saveError && <p role="alert">{saveError}</p>}
    {!departmentReady && <div role="alert">
      <p>{existingDepartment.isFetching ? '正在核实当前科室的所属机构…' : '科室归属未确认，无法保存当前值。'}</p>
      {existingDepartment.isError && <p>{errorMessage(existingDepartment.error)}</p>}
      <Button variant="secondary" disabled={existingDepartment.isFetching}
        onClick={() => void existingDepartment.refetch()}>重新确认科室归属</Button>
    </div>}
    <form id="parameter-value-form" className="parameter-value-form" inert={busy} onSubmit={submit} noValidate>
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
      {departmentReady && (['PLATFORM', 'TENANT', 'ORGANIZATION', 'DEPARTMENT'] as ParameterScope[]).includes(scopeType)
        && <ConfigurationScopeTarget verification={scopeVerification} scopeType={scopeType as 'PLATFORM' | 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'}
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
      {needsService && <DirectVisitServiceValue value={rawValue} options={serviceOptions} ready={servicesReady}
        loading={services.isFetching} error={serviceError} queryError={services.error}
        nullable={definition.nullableValue} canRefresh={scopeVerification.ready && Boolean(organizationId)}
        onRefresh={() => { if (scopeVerification.ready && organizationId) void services.refetch() }}
        onChange={(next) => { setRawValue(next); if (!next && definition.nullableValue) setValueMode('EXPLICIT_NULL') }} />}
      {valueMode === 'OVERRIDE' && !isDirectVisitService && definition.sdParamSensitivity !== 'SECRET' && <ValueControl definition={definition}
        rawValue={rawValue} onChange={setRawValue} systemEnums={systemEnums} api={api}
        required error={submitted ? currentValueError || undefined : undefined} />}
      <FormField className="parameter-form__span-2" label="变更原因"><textarea rows={3} value={reason} maxLength={1000}
        onChange={(event) => setReason(event.target.value)} /></FormField>
    </form>
  </Dialog>
}

function ValueControl({ definition, rawValue, onChange, systemEnums, api, error, required = false }: {
  definition: ParameterDefinition; rawValue: string; onChange: (value: string) => void
  systemEnums?: SystemEnumDefinition[]; api: RhnApi; error?: string; required?: boolean
}) {
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
  return <FormField label="参数值" required={required} error={error}><input inputMode={definition.sdParamValueType === 'NUMBER' ? 'decimal' : undefined}
    value={rawValue} onChange={(event) => onChange(event.target.value)} /></FormField>
}

function requireDirectVisitServices(items: ServiceCatalogItem[]): ServiceCatalogItem[] {
  if (!Array.isArray(items) || items.some(item => !item || typeof item.id !== 'string' || !item.id.trim()
    || typeof item.name !== 'string' || !item.name.trim() || typeof item.code !== 'string' || !item.code.trim()
    || typeof item.orderable !== 'boolean' || typeof item.sdStatus !== 'string' || typeof item.sdUsageType !== 'string'
    || (item.organizationAdoption != null && (item.organizationAdoption.catalogItemId !== item.id
      || typeof item.organizationAdoption.sdStatus !== 'string'
      || typeof item.organizationAdoption.orderable !== 'boolean' || typeof item.organizationAdoption.executable !== 'boolean')))) {
    throw new Error('门诊服务目录响应不完整，请重新加载。')
  }
  return items.filter(item => item.sdStatus === 'ACTIVE' && item.orderable && item.sdUsageType === 'OUTPATIENT'
    && item.serviceSubtype === 'OUTPATIENT_VISIT' && item.accountingCategory === 'REGISTRATION'
    && item.organizationAdoption?.sdStatus === 'ACTIVE' && item.organizationAdoption.orderable && item.organizationAdoption.executable)
}

function DirectVisitServiceValue({ value, onChange, options, ready, loading, error, queryError, nullable, canRefresh, onRefresh }: {
  value: string; onChange: (value: string) => void; options: ServiceCatalogItem[]; ready: boolean; loading: boolean
  error: string; queryError: unknown; nullable: boolean; canRefresh: boolean; onRefresh: () => void
}) {
  return <div>
    <FormField label="直接接诊门诊服务" error={error || undefined}
      hint="配置后按机构有效价格记入本次就诊费用，接诊时由服务端校验服务有效期和价格。">
      <Select value={value} onChange={onChange} loading={loading} disabled={!ready}
        clearable={nullable} placeholder={ready ? '请选择门诊服务' : '门诊服务目录待确认'} showValue
        options={options.map(item => ({ value: item.id, label: item.name, secondaryText: item.code }))} />
    </FormField>
    {queryError != null && <p role="alert">{errorMessage(queryError)}</p>}
    {ready && options.length === 0 && <p>当前机构没有可选门诊服务，请维护服务目录或明确不配置门诊服务费。</p>}
    <Button variant="secondary" disabled={loading || !canRefresh} onClick={onRefresh}>重新加载门诊服务</Button>
    {nullable && <Button variant="secondary" onClick={() => onChange('')}>不配置门诊服务费</Button>}
  </div>
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
  return <input inputMode={valueType === 'NUMBER' ? 'decimal' : undefined}
    value={value} placeholder={valueType === 'NUMBER' ? '例如 30 或 0.5' : '请输入默认内容'}
    onChange={(event) => onChange(event.target.value)} />
}

function defaultValueHint(valueType: ParameterValueType) {
  if (valueType === 'NUMBER') return '直接填写数字，无需额外格式'
  if (valueType === 'BOOLEAN') return '选择“是”或“否”'
  if (valueType === 'JSON') return '仅 JSON 类型需要填写合法的 JSON 内容'
  return '直接填写文本，系统会按字符串保存'
}

function ParameterCategoryDialog({ state, categories, busy, available, saveError, onRefresh, onClose, onMove, onSave }: {
  state: CategoryDialogState; categories: ParameterCategory[]; busy: boolean; onClose: () => void
  available: boolean; saveError?: string; onRefresh: () => Promise<void>
  onMove: (move: TreePanelMove) => Promise<boolean>
  onSave: (mode: 'create' | 'edit', category: ParameterCategory | undefined,
    input: CategoryEditorInput) => Promise<ParameterCategory>
}) {
  const [selectedId, setSelectedId] = useState(state.category?.id)
  const [editor, setEditor] = useState<CategoryEditorState>(state.mode === 'edit'
    ? { mode: 'edit', categoryId: state.category.id }
    : { mode: 'create', parentId: state.parentId })
  const [savedMessage, setSavedMessage] = useState('')
  const [moveError, setMoveError] = useState('')
  const [editorVersion, setEditorVersion] = useState(0)
  const selectedCategory = categories.find((item) => item.id === selectedId)
  const editingCategory = editor.mode === 'edit' ? categories.find((item) => item.id === editor.categoryId) : undefined
  const treeNodes = flattenCategories(categories).map(({ category }) => ({
    id: category.id,
    parentId: category.parentId,
    label: category.name,
    secondaryText: category.code,
    keywords: [category.code, category.description ?? ''],
    inactive: category.sdParamStatus === 'INACTIVE',
  }))
  const editorKey = editor.mode === 'edit'
    ? `edit-${editingCategory?.id ?? 'missing'}-${editorVersion}`
    : `create-${editor.parentId ?? 'root'}`

  return <Dialog title="参数分类管理" eyebrow="分类树"
    description="通过树面板维护分类层级；分类编码创建后不可修改，拖拽排序会一次性保存并自动阻止循环。"
    onClose={() => { if (!busy) onClose() }} closeOnBackdrop={false} size="xwide" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>完成</Button>
      <Button type="submit" form="parameter-category-form" busy={busy} disabled={!available}>
        {editor.mode === 'create' ? '创建分类' : '保存分类'}</Button></>}>
    {!available && <ParameterVerificationNotice onRefresh={onRefresh} />}
    {(saveError || moveError) && <p role="alert">{saveError || moveError}</p>}
    {available && (saveError || moveError) && <Button variant="secondary" disabled={busy} onClick={() => void onRefresh()}>重新确认配置</Button>}
    {savedMessage && <Alert tone="success" className="parameter-category-feedback">{savedMessage}</Alert>}
    <div className="parameter-category-workspace">
      <TreePanel title="参数目录" rootLabel="全部分类" nodes={treeNodes} selectedId={selectedId}
        searchPlaceholder="搜索分类名称或编码" busy={busy || !available} onSelect={(id) => { setSelectedId(id); setSavedMessage('') }}
        onAdd={(parentId) => { setEditor({ mode: 'create', parentId }); setSelectedId(parentId); setSavedMessage('') }}
        onEdit={(id) => { setSelectedId(id); setEditorVersion(version => version + 1); setEditor({ mode: 'edit', categoryId: id }); setSavedMessage('') }}
        onMove={async (move) => {
          setSavedMessage(''); setMoveError('')
          try { if (await onMove(move)) setSavedMessage('分类层级与顺序已保存') }
          catch (error) { setMoveError(errorMessage(error)) }
        }} />
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
            busy={busy} onSave={async (input, original) => {
              setSavedMessage(''); setMoveError('')
              const saved = await onSave(editor.mode, original, input)
              setEditorVersion(version => version + 1)
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
  defaultParentId?: string; busy: boolean; onSave: (input: CategoryEditorInput, original?: ParameterCategory) => Promise<void>
}) {
  const [original] = useState(category)
  const [code, setCode] = useState(category?.code ?? '')
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [parentId, setParentId] = useState(category?.parentId ?? defaultParentId ?? '')
  const [active, setActive] = useState(mode === 'create' || category?.sdParamStatus === 'ACTIVE')
  const [submitted, setSubmitted] = useState(false)
  const descendants = category ? descendantCategoryIds(categories, category.id) : new Set<string>()
  const options = flattenCategories(categories).filter((item) => item.category.sdParamStatus === 'ACTIVE'
    && item.category.id !== category?.id && !descendants.has(item.category.id))
  const siblingOrders = categories.filter((item) => (item.parentId ?? '') === parentId).map((item) => item.sortOrder)
  const sortOrder = original?.sortOrder ?? (Math.max(0, ...siblingOrders) + 10)
  const codeError = !code.trim() ? '请输入分类编码'
    : !/^[A-Z][A-Z0-9_]{0,63}$/.test(code.trim().toUpperCase())
      ? '必须以字母开头，只能使用大写字母、数字和下划线' : ''

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (busy || codeError || !name.trim()) return
    try {
      await onSave({ parentId: parentId || undefined, code: code.trim().toUpperCase(), name: name.trim(),
        description: optional(description), sortOrder, active }, original)
    } catch { /* Keep open for correction. */ }
  }

  return <form id="parameter-category-form" className="parameter-category-form" onSubmit={submit} inert={busy} noValidate>
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

function ParameterChangesDialog({ definition, changes, loading, error, operationError, busy, available, onRefresh, onClose, onRollback, onRetry }: {
  definition: ParameterDefinition; changes: Awaited<ReturnType<RhnApi['configuration']['changes']>>
  loading: boolean; error: string; busy: boolean; onClose: () => void
  available: boolean; onRefresh: () => Promise<void>
  operationError?: string; onRetry: () => void; onRollback: (change: ParameterChange) => void
}) {
  return <Dialog title="参数变更记录" eyebrow={definition.name} onClose={() => { if (!busy) onClose() }}
    description="变更日志只追加不覆盖。恢复历史值会形成一次新的 ROLLBACK 变更，不会删除后续记录。"
    footer={<Button variant="secondary" disabled={busy} onClick={onClose}>关闭</Button>}>
    {!available && <ParameterVerificationNotice onRefresh={onRefresh} />}
    {loading && <LoadingState label="正在加载变更记录…" />}{error && <Alert>{error}</Alert>}
    {operationError && <div role="alert"><p>{operationError}</p><Button variant="secondary" busy={busy} disabled={!available} onClick={onRetry}>重试本次操作</Button></div>}
    {!loading && !error && changes.length === 0 && <EmptyState icon="tasks" title="暂无变更记录" copy="该参数尚未产生变更。" />}
    <ol className="parameter-change-list">{changes.map((change) => {
      const issue = change.sdParamChangeTargetType === 'VALUE' ? parameterRollbackIssue(definition, change) : undefined
      return <li key={change.id}>
      <div><div><strong>{change.sdParamChangeTypeText}</strong><StatusBadge>{change.sdParamChangeTargetTypeText}</StatusBadge></div>
        {change.sdParamChangeTargetType === 'VALUE' && change.valueId && <Button size="sm" variant="text" busy={busy} disabled={!available || Boolean(issue)}
          onClick={() => onRollback(change)}>恢复此快照</Button>}</div>
      {issue && <p>无法恢复：{issue}</p>}
      <p>{change.reason || '未填写变更原因'}</p>
      <small>{formatDate(change.changedAt)} · 操作用户 {change.changedBy} · 请求 {change.requestCode}</small>
      <details><summary>查看前后快照</summary>
        {change.before === undefined && <p>前快照未返回</p>}{change.after === undefined && <p>后快照未返回</p>}
        <pre>{JSON.stringify({ before: change.before, after: change.after }, null, 2)}</pre></details>
    </li>})}</ol>
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
    throw new Error('分类移动目标无效或会形成循环，请重新选择')
  }
  if (move.parentId && !categories.some(category => category.id === move.parentId && category.sdParamStatus === 'ACTIVE')) {
    throw new Error('上级分类不存在或已停用，请重新选择')
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
    pattern: '', enumValues: '', requiredFields: '', extraSchema: {}, sourceSchema: {},
  }
  if (!schemaJson?.trim()) return fallback
  try {
    const parsed = parseParameterJson(schemaJson) as Record<string, unknown>
    if (!parsed || Array.isArray(parsed) || isParameterJsonNumber(parsed) || typeof parsed !== 'object') {
      return { ...fallback, sourceIssue: '校验规则必须是 JSON 对象，请修复原始规则' }
    }
    const sourceIssue = schemaSourceIssue(parsed, valueType)
    const schemaType = typeof parsed.type === 'string' && schemaTypeMatchesValueType(parsed.type, valueType)
      ? parsed.type as ValidationSchemaType : fallback.schemaType
    const enumValues = Array.isArray(parsed.enum) && parsed.enum.every((item) => {
      if (valueType === 'STRING') return typeof item === 'string'
      if (valueType === 'NUMBER') return isParameterJsonNumber(item)
      return false
    }) ? parsed.enum.map(String).join(', ') : ''
    const requiredFields = Array.isArray(parsed.required) && parsed.required.every((item) => typeof item === 'string')
      ? parsed.required.join(', ') : ''
    const managed = new Set(['type', ...(valueType === 'STRING' ? ['minLength', 'maxLength', 'pattern']
      : valueType === 'NUMBER' ? ['minimum', 'maximum'] : valueType === 'JSON' && schemaType === 'object' ? ['required'] : [])])
    if (enumValues) managed.add('enum')
    const extraSchema = Object.fromEntries(Object.entries(parsed).filter(([key]) => !managed.has(key)))
    return {
      schemaType,
      minimum: isParameterJsonNumber(parsed.minimum) ? String(parsed.minimum) : '',
      maximum: isParameterJsonNumber(parsed.maximum) ? String(parsed.maximum) : '',
      minLength: isParameterJsonNumber(parsed.minLength) ? String(parsed.minLength) : '',
      maxLength: isParameterJsonNumber(parsed.maxLength) ? String(parsed.maxLength) : '',
      pattern: typeof parsed.pattern === 'string' ? parsed.pattern : '',
      enumValues,
      requiredFields,
      extraSchema, sourceSchema: parsed, sourceIssue,
    }
  } catch { return { ...fallback, sourceIssue: '校验规则不是有效的 JSON，请修复原始规则' } }
}

function schemaSourceIssue(schema: Record<string, unknown>, valueType: ParameterValueType) {
  if ('type' in schema && (typeof schema.type !== 'string' || !schemaTypeMatchesValueType(schema.type, valueType))) {
    return '原始规则的 type 与参数值类型不匹配，请核查原始规则'
  }
  for (const key of ['minimum', 'maximum']) {
    if (key in schema && !isParameterJsonNumber(schema[key])) return `${key} 必须是有效数值`
  }
  for (const key of ['minLength', 'maxLength']) {
    if (key in schema && (!isParameterJsonNumber(schema[key]) || nonNegativeInteger(String(schema[key])) === undefined)) {
      return `${key} 必须是非负整数`
    }
  }
  if (isParameterJsonNumber(schema.minimum) && isParameterJsonNumber(schema.maximum) && compareParameterNumbers(schema.minimum, schema.maximum) > 0) {
    return 'minimum 不能大于 maximum'
  }
  if (isParameterJsonNumber(schema.minLength) && isParameterJsonNumber(schema.maxLength) && compareParameterNumbers(schema.minLength, schema.maxLength) > 0) {
    return 'minLength 不能大于 maxLength'
  }
  if ('pattern' in schema && typeof schema.pattern !== 'string') return 'pattern 必须是字符串'
  if ('enum' in schema && !Array.isArray(schema.enum)) return 'enum 必须是数组'
  if ('required' in schema && (!Array.isArray(schema.required)
    || schema.required.some((item) => typeof item !== 'string' || !item.trim()))) return 'required 必须是非空字段名数组'
  return undefined
}

function writeValidationSchema(valueType: ParameterValueType, rules: ParameterValidationRules) {
  // Patch only edited fields: converting untouched arrays or patterns through text inputs is lossy.
  const schema = { ...rules.sourceSchema }
  const original = readValidationRules(stringifyParameterJson(rules.sourceSchema), valueType)
  if (rules.schemaType !== original.schemaType) {
    if (rules.schemaType === 'any') delete schema.type
    else schema.type = rules.schemaType
  }
  const updateNumber = (key: 'minLength' | 'maxLength' | 'minimum' | 'maximum') => {
    if (rules[key] === original[key]) return
    delete schema[key]
    assignNumberRule(schema, key, rules[key])
  }
  if (valueType === 'STRING') {
    updateNumber('minLength'); updateNumber('maxLength')
    if (rules.pattern !== original.pattern) {
      delete schema.pattern
      if (rules.pattern.length) schema.pattern = rules.pattern
    }
  }
  if (valueType === 'NUMBER') {
    updateNumber('minimum'); updateNumber('maximum')
  }
  if ((valueType === 'STRING' || valueType === 'NUMBER') && rules.enumValues !== original.enumValues) {
    const options = splitRuleValues(rules.enumValues)
    delete schema.enum
    if (options.length) schema.enum = valueType === 'NUMBER' ? options.map(item => isParameterNumberText(item) ? new ParameterJsonNumber(item) : item) : options
  }
  if (valueType === 'JSON' && rules.requiredFields !== original.requiredFields) {
    const required = splitRuleValues(rules.requiredFields)
    delete schema.required
    if (required.length) schema.required = required
  }
  return stringifyParameterJson(schema)
}

function validationRulesError(valueType: ParameterValueType, rules: ParameterValidationRules) {
  if (valueType === 'NUMBER') {
    if (rules.minimum.trim() && !isParameterNumberText(rules.minimum)) return '最小值必须是有效数值'
    if (rules.maximum.trim() && !isParameterNumberText(rules.maximum)) return '最大值必须是有效数值'
    if (rules.minimum.trim() && rules.maximum.trim()
      && compareParameterNumbers(new ParameterJsonNumber(rules.minimum), new ParameterJsonNumber(rules.maximum)) > 0) return '最小值不能大于最大值'
    if (splitRuleValues(rules.enumValues).some(item => !isParameterNumberText(item))) return '限定可选值必须全部为有效数值'
  }
  if (valueType === 'STRING') {
    const minimum = nonNegativeInteger(rules.minLength)
    const maximum = nonNegativeInteger(rules.maxLength)
    if (rules.minLength.trim() && minimum === undefined) return '最小长度必须是非负整数'
    if (rules.maxLength.trim() && maximum === undefined) return '最大长度必须是非负整数'
    if (minimum !== undefined && maximum !== undefined && compareParameterNumbers(minimum, maximum) > 0) return '最小长度不能大于最大长度'
  }
  return ''
}

function validationSummary(valueType: ParameterValueType, rules: ParameterValidationRules) {
  const parts: string[] = []
  const extraCount = Object.keys(rules.extraSchema).length
  if (extraCount) parts.push(`${extraCount} 项附加规则（查看原始规则）`)
  if (valueType === 'STRING') {
    if (rules.minLength || rules.maxLength) parts.push(`长度 ${rules.minLength || '0'}～${rules.maxLength || '不限'}`)
    if (rules.pattern.length) parts.push('已配置格式规则')
  }
  if (valueType === 'NUMBER') {
    if (rules.minimum || rules.maximum) parts.push(`范围 ${rules.minimum || '不限'}～${rules.maximum || '不限'}`)
  }
  if (valueType === 'JSON' && rules.schemaType === 'object' && rules.requiredFields.trim()) parts.push('已配置必填属性')
  if (rules.enumValues.trim()) {
    const original = readValidationRules(stringifyParameterJson(rules.sourceSchema), valueType)
    const count = rules.enumValues === original.enumValues && Array.isArray(rules.sourceSchema.enum)
      ? rules.sourceSchema.enum.length : splitRuleValues(rules.enumValues).length
    parts.push(`${count} 个可选值`)
  }
  return parts.length ? parts.join(' · ') : '当前仅校验值类型，可按需补充业务约束'
}

function validationTypeLabel(valueType: ParameterValueType, schemaType: ValidationSchemaType) {
  if (valueType === 'STRING') return '字符串规则'
  if (valueType === 'NUMBER') return schemaType === 'integer' ? '整数规则' : '数值规则'
  if (valueType === 'BOOLEAN') return '布尔值规则'
  return schemaType === 'any' ? 'JSON 对象或数组规则' : schemaType === 'array' ? 'JSON 数组规则' : 'JSON 对象规则'
}

function defaultSchemaType(valueType: ParameterValueType): ValidationSchemaType {
  if (valueType === 'STRING') return 'string'
  if (valueType === 'NUMBER') return 'number'
  if (valueType === 'BOOLEAN') return 'boolean'
  return 'any'
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
  if (value.trim()) schema[key] = isParameterNumberText(value) ? new ParameterJsonNumber(value) : value
}

function nonNegativeInteger(value: string) {
  if (!value.trim()) return undefined
  return /^(0|[1-9]\d*)$/.test(value.trim()) ? new ParameterJsonNumber(value) : undefined
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

function readRawValue(valueJson: string | undefined, type: ParameterValueType) {
  if (!valueJson) return ''
  if (type !== 'STRING') return valueJson
  try { const value = JSON.parse(valueJson); return typeof value === 'string' ? value : valueJson } catch { return valueJson }
}

function writeJsonValue(type: ParameterValueType, rawValue: string) {
  return type === 'STRING' ? JSON.stringify(rawValue) : rawValue.trim()
}

function jsonFieldError(value: string, label: string) {
  if (!value.trim()) return ''
  try {
    const parsed = parseParameterJson(value)
    return parsed !== null && typeof parsed === 'object' && !isParameterJsonNumber(parsed)
      ? '' : `${label}必须是 JSON 对象或数组`
  } catch (error) { return `${label}必须是合法且属性不重复的 JSON：${errorMessage(error)}` }
}

function parameterJsonValueError(type: ParameterValueType, value: string, label: string) {
  try {
    const parsed = parseParameterJson(value)
    const matches = type === 'STRING' ? typeof parsed === 'string' : type === 'NUMBER' ? isParameterJsonNumber(parsed)
      : type === 'BOOLEAN' ? typeof parsed === 'boolean' : parsed !== null && typeof parsed === 'object' && !isParameterJsonNumber(parsed)
    return matches ? '' : `${label}与参数类型不匹配`
  } catch (error) { return `${label}必须是合法且属性不重复的 JSON：${errorMessage(error)}` }
}

function parameterValueError(type: ParameterValueType, value: string) {
  if (!value.trim()) return '请输入参数值'
  if (type === 'NUMBER' && !isParameterNumberText(value)) return '请输入有效的十进制数值（可使用科学计数法）'
  if (type === 'BOOLEAN' && !['true', 'false'].includes(value)) return '请选择是或否'
  if (type === 'JSON') return jsonFieldError(value, '参数值')
  return ''
}

function optional(value: string) { return value.trim() || undefined }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function requireParameterList<T>(value: T[], label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label}返回数据不完整，请重新加载`)
  return value
}

function ParameterVerificationNotice({ onRefresh }: { onRefresh: () => Promise<void> }) {
  return <div role="alert"><p>当前配置尚未确认，重新加载成功后才能保存或恢复。</p>
    <Button variant="secondary" onClick={() => void onRefresh()}>重新确认配置</Button>
  </div>
}

function parameterDependencyPresentation(value: boolean | null | undefined): {
  label: string; tone: 'success' | 'warning' | 'neutral'; copy: string
} {
  if (value === true) return { label: '预览条件满足', tone: 'success', copy: '当前预览范围内的前置条件已满足。' }
  if (value === false) return { label: '预览条件未满足', tone: 'warning', copy: '当前预览范围内的前置条件未满足。' }
  return { label: '依赖状态待确认', tone: 'neutral', copy: '未取得可用的依赖判断结果，请核查前置参数或重新加载。' }
}
