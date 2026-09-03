import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DICTIONARY_SYSTEM_ENUM, errorMessage, systemEnumItems,
  type DictionaryCategory, type DictionaryChange, type DictionaryDetail, type DictionaryItem, type DictionaryScopeType,
  type RhnApi, type SystemEnumItem } from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Pagination, Panel,
  PanelHead, SearchField, Select, SplitWorkspace, StatusBadge, TableShell, TreePanel,
} from '../../shared/ui'

type DictionaryDialogState = 'create' | 'edit' | undefined
type CategoryDialogState = { mode: 'create'; parentId?: string } | { mode: 'edit'; category: DictionaryCategory } | undefined
export function DictionaryManagement({ api, onOpenAttributeConfiguration }: {
  api: RhnApi
  onOpenAttributeConfiguration: (dictionaryId: string) => void
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDictionaryId = searchParams.get('dictionaryId') ?? ''
  const [dictionaryQuery, setDictionaryQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [catalogPage, setCatalogPage] = useState(0)
  const directoryPageSize = useDictionaryDirectoryPageSize()
  const [selectedId, setSelectedId] = useState<string>()
  const [itemQuery, setItemQuery] = useState('')
  const [itemStatus, setItemStatus] = useState('')
  const [dictionaryDialog, setDictionaryDialog] = useState<DictionaryDialogState>()
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>()
  const [editingItem, setEditingItem] = useState<DictionaryItem | null | undefined>(undefined)
  const [showChanges, setShowChanges] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')

  const dictionaries = useQuery({
    queryKey: ['dictionaries', dictionaryQuery, categoryFilter, scopeFilter, statusFilter],
    queryFn: () => api.dictionaries.list(dictionaryQuery, categoryFilter, scopeFilter, statusFilter),
  })
  const categories = useQuery({ queryKey: ['dictionary-categories'], queryFn: api.dictionaries.categories })
  const systemEnums = useQuery({
    queryKey: ['dictionary-system-enums'],
    queryFn: api.dictionaries.systemEnums,
    staleTime: Infinity,
  })
  const detail = useQuery({
    queryKey: ['dictionary', selectedId],
    queryFn: () => api.dictionaries.get(selectedId!),
    enabled: Boolean(selectedId),
  })
  const changes = useQuery({
    queryKey: ['dictionary-changes', selectedId],
    queryFn: () => api.dictionaries.changes(selectedId!),
    enabled: Boolean(selectedId && showChanges),
  })

  useEffect(() => {
    const list = dictionaries.data ?? []
    const requestedIndex = list.findIndex((item) => item.id === requestedDictionaryId)
    if (requestedDictionaryId && requestedIndex >= 0) {
      if (selectedId !== requestedDictionaryId) setSelectedId(requestedDictionaryId)
      setCatalogPage(Math.floor(requestedIndex / directoryPageSize))
      return
    }
    const selectedIndex = list.findIndex((item) => item.id === selectedId)
    if (list.length && selectedIndex < 0) {
      setSelectedId(list[0].id)
    }
    if (selectedIndex >= 0) setCatalogPage(Math.floor(selectedIndex / directoryPageSize))
    if (!list.length) setSelectedId(undefined)
  }, [dictionaries.data, directoryPageSize, requestedDictionaryId, selectedId])

  useEffect(() => { setCatalogPage(0) }, [dictionaryQuery, categoryFilter, scopeFilter, statusFilter])

  async function acceptChange(next: DictionaryDetail, message: string) {
    queryClient.setQueryData(['dictionary', next.id], next)
    setSelectedId(next.id)
    setFeedback(message)
    setOperationError('')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
      queryClient.invalidateQueries({ queryKey: ['dictionary-changes', next.id] }),
      queryClient.invalidateQueries({ queryKey: ['dictionary-options'] }),
    ])
  }

  function refreshAfterError(error: unknown) {
    setOperationError(errorMessage(error))
    if (selectedId) void queryClient.invalidateQueries({ queryKey: ['dictionary', selectedId] })
  }

  const createDictionary = useMutation({
    mutationFn: api.dictionaries.create,
    onSuccess: (next) => acceptChange(next, `已创建字典“${next.name}”`),
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const updateDictionary = useMutation({
    mutationFn: (input: { categoryId: string; name: string; description?: string; reason?: string }) =>
      api.dictionaries.update(detail.data!.id, {
        ...input, expectedRevision: detail.data!.revision, requestCode: crypto.randomUUID(),
      }),
    onSuccess: (next) => acceptChange(next, `已更新字典“${next.name}”`),
    onError: refreshAfterError,
  })
  const createCategory = useMutation({
    mutationFn: api.dictionaries.createCategory,
    onSuccess: async (next) => {
      setFeedback(`已创建分类“${next.name}”`); setOperationError('')
      await queryClient.invalidateQueries({ queryKey: ['dictionary-categories'] })
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const updateCategory = useMutation({
    mutationFn: ({ category, input }: { category: DictionaryCategory; input: Parameters<RhnApi['dictionaries']['updateCategory']>[1] }) =>
      api.dictionaries.updateCategory(category.id, input),
    onSuccess: async (next) => {
      setFeedback(`已更新分类“${next.name}”`); setOperationError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dictionary-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
        queryClient.invalidateQueries({ queryKey: ['dictionary'] }),
      ])
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const categoryStatus = useMutation({
    mutationFn: (category: DictionaryCategory) => api.dictionaries.changeCategoryStatus(
      category.id, category.sdDictCategoryStatus !== 'ACTIVE', {
        expectedRevision: category.revision,
        reason: category.sdDictCategoryStatus === 'ACTIVE' ? '停止用于新增归类' : '恢复用于字典归类',
        requestCode: crypto.randomUUID(),
      },
    ),
    onSuccess: async (next) => {
      setFeedback(`分类“${next.name}”状态已更新`); setOperationError('')
      await queryClient.invalidateQueries({ queryKey: ['dictionary-categories'] })
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const dictionaryStatus = useMutation({
    mutationFn: (enabled: boolean) => api.dictionaries.changeStatus(detail.data!.id, enabled, {
      expectedRevision: detail.data!.revision, reason: enabled ? '重新启用字典' : '停止用于新业务',
      requestCode: crypto.randomUUID(),
    }),
    onSuccess: (next) => acceptChange(next, `字典“${next.name}”状态已更新为“${next.sdDictStatusText}”`),
    onError: refreshAfterError,
  })
  const saveItem = useMutation({
    mutationFn: (input: { code: string; name: string; description?: string; sortOrder: number }) => {
      const context = { ...input, expectedRevision: detail.data!.revision,
        reason: editingItem ? '维护字典项展示属性' : '新增业务代码', requestCode: crypto.randomUUID() }
      return editingItem
        ? api.dictionaries.updateItem(detail.data!.id, editingItem.id, context)
        : api.dictionaries.addItem(detail.data!.id, context)
    },
    onSuccess: (next) => acceptChange(next, `已${editingItem ? '更新' : '新增'}字典项`).then(() => setEditingItem(undefined)),
    onError: refreshAfterError,
  })
  const itemState = useMutation({
    mutationFn: (item: DictionaryItem) => api.dictionaries.changeItemStatus(
      detail.data!.id, item.id, item.sdDictItemStatus !== 'ACTIVE', {
        expectedRevision: detail.data!.revision,
        reason: item.sdDictItemStatus === 'ACTIVE' ? '停止用于新业务' : '恢复用于新业务',
        requestCode: crypto.randomUUID(),
      },
    ),
    onSuccess: (next) => acceptChange(next, '字典项状态已更新'),
    onError: refreshAfterError,
  })

  const selectedItems = detail.data?.items ?? []
  const categoryOptions = useMemo(() => flattenCategories(categories.data ?? []), [categories.data])
  const scopeOptions = systemEnumItems(systemEnums.data, DICTIONARY_SYSTEM_ENUM.scopeType)
  const dictionaryStatusOptions = systemEnumItems(systemEnums.data, DICTIONARY_SYSTEM_ENUM.dictionaryStatus)
  const itemStatusOptions = systemEnumItems(systemEnums.data, DICTIONARY_SYSTEM_ENUM.itemStatus)
  const visibleItems = useMemo(() => selectedItems.filter((item) => {
    const query = itemQuery.trim().toLowerCase()
    const matchesQuery = !query || `${item.name}${item.code}${item.description ?? ''}`.toLowerCase().includes(query)
    return matchesQuery && (!itemStatus || item.sdDictItemStatus === itemStatus)
  }), [itemQuery, itemStatus, selectedItems])
  const busy = createDictionary.isPending || updateDictionary.isPending || dictionaryStatus.isPending
    || saveItem.isPending || itemState.isPending || createCategory.isPending || updateCategory.isPending
    || categoryStatus.isPending
  const selected = detail.data
  const dictionaryList = dictionaries.data ?? []
  const catalogPageCount = Math.max(1, Math.ceil(dictionaryList.length / directoryPageSize))
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount - 1)
  const pageDictionaries = dictionaryList.slice(safeCatalogPage * directoryPageSize,
    (safeCatalogPage + 1) * directoryPageSize)
  const queryError = dictionaries.error || categories.error || detail.error || systemEnums.error

  return <div className="dictionary-page">
    <PageHeader compact eyebrow="平台管理 · 基础设置" title="字典管理"
      description="按平台或租户分类维护普通枚举字典；分类只用于治理和检索，不改变字典解析规则。"
      actions={<><Button variant="secondary" onClick={() => {
        const firstCategory = categoryOptions[0]?.category
        setCategoryDialog(firstCategory ? { mode: 'edit', category: firstCategory } : { mode: 'create' })
      }}>管理分类</Button>
        <Button disabled={!systemEnums.data || !categories.data?.some((item) => item.sdDictCategoryStatus === 'ACTIVE')}
          onClick={() => setDictionaryDialog('create')}><Icon name="add" />新建字典</Button></>} />

    {feedback && <Alert tone="success" className="dictionary-feedback">{feedback}</Alert>}
    {(operationError || queryError) && <Alert className="dictionary-feedback">
      {operationError || errorMessage(queryError)}
    </Alert>}

    <SplitWorkspace className="dictionary-workspace">
      <Panel className="dictionary-catalog">
        <PanelHead title="字典目录" meta={`${dictionaries.data?.length ?? 0} 个`} />
        <div className="dictionary-catalog__filters">
          <SearchField className="dictionary-catalog__search" label="搜索字典" value={dictionaryQuery}
            onChange={setDictionaryQuery} placeholder="搜索名称或编码" />
          <div className="dictionary-category-filter"><Select aria-label="作用域" value={scopeFilter}
            placeholder="全部范围" showValue onChange={setScopeFilter}
            options={scopeOptions.map((item) => ({ value: item.code, label: item.name }))} /></div>
        </div>
        <div className="dictionary-catalog__secondary-filter">
          <div className="dictionary-category-filter"><Select aria-label="字典分类" value={categoryFilter}
            placeholder="全部分类" showValue onChange={setCategoryFilter}
            options={categoryOptions.map((item) => ({ value: item.category.id, label: item.label,
              secondaryText: item.category.code }))} /></div>
          <div className="dictionary-category-filter"><Select aria-label="字典状态" value={statusFilter}
            placeholder="全部状态" showValue onChange={setStatusFilter}
            options={dictionaryStatusOptions.map((item) => ({ value: item.code, label: item.name }))} /></div>
        </div>
        <div className="dictionary-catalog__list" role="listbox" aria-label="字典目录">
          {dictionaries.isPending && <LoadingState label="正在加载字典…" />}
          {pageDictionaries.map((dictionary) => <button key={dictionary.id} type="button" role="option"
            aria-selected={dictionary.id === selectedId}
            className={`dictionary-card ${dictionary.id === selectedId ? 'is-selected' : ''}`}
            onClick={() => { setSelectedId(dictionary.id); setSearchParams({ dictionaryId: dictionary.id })
              setItemQuery(''); setFeedback(''); setOperationError('') }}>
            <span className="dictionary-card__icon"><Icon name="tasks" /></span>
            <span className="dictionary-card__content">
              <span className="dictionary-card__title"><strong>{dictionary.name}</strong>
                {dictionary.systemManaged && <StatusBadge>系统托管</StatusBadge>}
                <StatusBadge tone={dictionary.sdDictStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                  {dictionary.sdDictStatusText}
                </StatusBadge></span>
              <code>{dictionary.code}</code>
              <small>{dictionary.categoryName} · {dictionary.sdDictScopeTypeText}
                {' · '}{dictionary.itemCount} 个字典项</small>
            </span><Icon name="chevron-right" />
          </button>)}
          {!dictionaries.isPending && dictionaries.data?.length === 0 && <EmptyState icon="search"
            title="未找到匹配字典" copy="请调整名称、编码、范围或状态条件。" />}
        </div>
        <Pagination page={safeCatalogPage} totalPages={catalogPageCount} label="字典目录分页"
          onChange={(nextPage) => {
            setCatalogPage(nextPage)
            const first = dictionaryList[nextPage * directoryPageSize]
            if (first) {
              setSelectedId(first.id)
              setSearchParams({ dictionaryId: first.id })
            }
          }} />
      </Panel>

      <Panel className="dictionary-detail">
        {detail.isPending && selectedId && <LoadingState label="正在加载字典详情…" />}
        {!selected && !detail.isPending && <EmptyState icon="tasks" title="暂无字典"
          copy="新建一个普通枚举字典后即可维护字典项。" />}
        {selected && <>
          <header className="dictionary-detail__head">
            <div>
              <div className="dictionary-detail__title-row"><h2>{selected.name}</h2>
                {selected.systemManaged && <StatusBadge>系统托管</StatusBadge>}
                <StatusBadge tone={selected.sdDictStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                  {selected.sdDictStatusText}
                </StatusBadge></div>
              <code>{selected.code}</code>
              <p>{selected.description || '暂无用途说明'}</p>
            </div>
            <div className="dictionary-detail__actions">
              <Button variant="secondary" onClick={() => onOpenAttributeConfiguration(selected.id)}>扩展配置</Button>
              <Button variant="secondary" onClick={() => setShowChanges(true)}>变更记录</Button>
              {!selected.systemManaged && <><Button variant="secondary" onClick={() => setDictionaryDialog('edit')}>编辑定义</Button>
                <Button variant={selected.sdDictStatus === 'ACTIVE' ? 'danger' : 'secondary'} busy={dictionaryStatus.isPending}
                  onClick={() => dictionaryStatus.mutate(selected.sdDictStatus !== 'ACTIVE')}>
                  {selected.sdDictStatus === 'ACTIVE' ? '停用字典' : '启用字典'}
                </Button></>}
            </div>
          </header>
          <dl className="dictionary-facts">
            <div><dt>所属分类</dt><dd>{selected.categoryName}</dd></div>
            <div><dt>适用范围</dt><dd>{selected.sdDictScopeTypeText}</dd></div>
            <div><dt>当前修订号</dt><dd>{selected.revision}</dd></div>
            <div><dt>最近更新</dt><dd>{formatDate(selected.updatedAt)}</dd></div>
          </dl>
          <div className="dictionary-items__toolbar">
            <div><h3>字典项</h3><span>{selected.systemManaged
              ? '系统托管内容与代码枚举、数据库约束保持一致，仅供查看。'
              : '业务编码创建后不可修改；状态和展示属性的每次变化都会留下快照。'}</span></div>
            <div className="dictionary-items__actions">
              <SearchField className="dictionary-items__search" label="搜索字典项" value={itemQuery}
                onChange={setItemQuery} placeholder="搜索字典项" />
              <div className="dictionary-category-filter compact"><Select aria-label="字典项状态"
                value={itemStatus} placeholder="全部状态" showValue onChange={setItemStatus}
                options={itemStatusOptions.map((item) => ({ value: item.code, label: item.name }))} /></div>
              {!selected.systemManaged && <Button onClick={() => setEditingItem(null)}><Icon name="add" />新增字典项</Button>}
            </div>
          </div>
          <TableShell scrollClassName="dictionary-table-wrap" footerClassName="dictionary-table__footer"
            footer={`显示 ${visibleItems.length} 个字典项 · 共 ${selectedItems.length} 个`}>
            <DataTable className="dictionary-table" aria-label="字典项">
              <thead><tr><th>显示名称 / 编码</th><th>说明</th><th>排序</th><th>状态</th><th aria-label="操作">操作</th></tr></thead>
              <tbody>{visibleItems.map((item) => <tr key={item.id}>
                <td><strong>{item.name}</strong><code>{item.code}</code></td><td>{item.description || '—'}</td>
                <td className="numeric">{item.sortOrder}</td>
                <td><StatusBadge tone={item.sdDictItemStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                  {item.sdDictItemStatusText}</StatusBadge></td>
                <td>{!selected.systemManaged && <div className="dictionary-row-actions"><Button size="sm" variant="text" onClick={() => setEditingItem(item)}>编辑</Button>
                  <Button size="sm" variant="text" busy={itemState.isPending} onClick={() => itemState.mutate(item)}>
                    {item.sdDictItemStatus === 'ACTIVE' ? '停用' : '启用'}</Button></div>}</td>
              </tr>)}</tbody>
            </DataTable>
            {visibleItems.length === 0 && <EmptyState icon="search" title="暂无匹配字典项"
              copy={selectedItems.length === 0 ? '点击“新增字典项”补充第一个业务代码。' : '请调整搜索内容或状态筛选。'} />}
          </TableShell>
        </>}
      </Panel>
    </SplitWorkspace>

    {dictionaryDialog && <DictionaryDefinitionDialog mode={dictionaryDialog}
      dictionary={dictionaryDialog === 'edit' ? selected : undefined} scopeOptions={scopeOptions}
      categories={categoryOptions.filter((item) => item.category.sdDictCategoryStatus === 'ACTIVE')}
      busy={busy} onClose={() => setDictionaryDialog(undefined)} onSave={async (input) => {
        if (dictionaryDialog === 'create') await createDictionary.mutateAsync({ ...input, requestCode: crypto.randomUUID() })
        else await updateDictionary.mutateAsync(input)
        setDictionaryDialog(undefined)
      }} />}
    {categoryDialog && <DictionaryCategoryDialog state={categoryDialog} categories={categories.data ?? []}
      busy={createCategory.isPending || updateCategory.isPending || categoryStatus.isPending}
      onClose={() => setCategoryDialog(undefined)} onStatus={(category) => categoryStatus.mutateAsync(category)}
      onSave={async (mode, category, input) => {
        if (mode === 'create') return createCategory.mutateAsync({ ...input, requestCode: crypto.randomUUID() })
        return updateCategory.mutateAsync({ category: category!, input: {
          expectedRevision: category!.revision, parentId: input.parentId, name: input.name,
          description: input.description, sortOrder: input.sortOrder,
          reason: input.parentId !== category!.parentId ? '调整字典分类层级' : '维护字典分类信息',
          requestCode: crypto.randomUUID(),
        } })
      }} />}
    {editingItem !== undefined && selected && <DictionaryItemDialog dictionary={selected} item={editingItem}
      busy={saveItem.isPending} onClose={() => setEditingItem(undefined)} onSave={(input) => saveItem.mutateAsync(input)} />}
    {showChanges && selected && <DictionaryChangesDialog dictionary={selected} changes={changes.data ?? []}
      loading={changes.isPending} error={changes.error ? errorMessage(changes.error) : ''} onClose={() => setShowChanges(false)} />}
  </div>
}

function useDictionaryDirectoryPageSize() {
  const calculate = () => {
    if (typeof window === 'undefined') return 4
    if (window.innerHeight < 800) return 2
    if (window.innerHeight < 1000) return 4
    if (window.innerHeight < 1250) return 6
    return 8
  }
  const [pageSize, setPageSize] = useState(calculate)
  useEffect(() => {
    function update() { setPageSize(calculate()) }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return pageSize
}

function DictionaryDefinitionDialog({ mode, dictionary, scopeOptions, categories, busy, onClose, onSave }: {
  mode: 'create' | 'edit'; dictionary?: DictionaryDetail; busy: boolean; onClose: () => void
  scopeOptions: SystemEnumItem[]
  categories: CategoryOption[]
  onSave: (input: { scopeType: DictionaryScopeType; categoryId: string; code: string; name: string; description?: string; reason?: string }) => Promise<void>
}) {
  const source = mode === 'edit' ? dictionary : undefined
  const [name, setName] = useState(source?.name ?? '')
  const [code, setCode] = useState(source?.code ?? '')
  const [description, setDescription] = useState(source?.description ?? '')
  const [scopeType, setScopeType] = useState<DictionaryScopeType>(source?.sdDictScopeType ?? 'TENANT')
  const categoriesForScope = categories.filter((item) => item.category.sdDictScopeType === scopeType)
  const [categoryId, setCategoryId] = useState(source?.categoryId
    ?? categories.find((item) => item.category.sdDictScopeType === 'TENANT')?.category.id
    ?? categories[0]?.category.id ?? '')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (!name.trim() || !code.trim() || !categoryId) return
    try {
      await onSave({ scopeType, categoryId, code: code.trim().toUpperCase(), name: name.trim(),
        description: description.trim() || undefined, reason: reason.trim() || undefined })
    } catch {
      // The page-level alert is populated by the mutation; keep the dialog open for correction.
    }
  }

  return <Dialog title={mode === 'create' ? '新建字典' : '编辑字典定义'} eyebrow="普通枚举字典"
    description="字典编码和作用域创建后保持稳定；定义与字典项只维护当前状态，所有变化写入追加式日志。"
    onClose={onClose} closeOnBackdrop={false} size="wide" footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="dictionary-definition-form" busy={busy}>{mode === 'create' ? '创建字典' : '保存修改'}</Button></>}>
    <form id="dictionary-definition-form" className="dictionary-definition-form" onSubmit={submit} noValidate>
      <div className="dictionary-definition-form__grid">
      <FormField className="dictionary-definition-form__span-5" label="字典名称" required
        error={submitted && !name.trim() ? '请输入字典名称' : undefined}>
        <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></FormField>
      <FormField className="dictionary-definition-form__span-7" label="字典编码" required
        error={submitted && !code.trim() ? '请输入字典编码' : undefined}
        hint="大写字母、数字和下划线，创建后不可修改">
        <input value={code} maxLength={64} readOnly={mode === 'edit'} onChange={(event) => setCode(event.target.value)} /></FormField>
      <FormField className="dictionary-definition-form__span-4" label="适用范围" required>
        <Select value={scopeType} disabled={mode === 'edit'} showValue clearable={false}
        onChange={(value) => { const next = value as DictionaryScopeType; setScopeType(next)
          setCategoryId(categories.find((item) => item.category.sdDictScopeType === next)?.category.id ?? '') }}
        options={scopeOptions.map((item) => ({ value: item.code, label: item.name }))} /></FormField>
      <FormField className="dictionary-definition-form__span-8" label="所属分类" required
        error={submitted && !categoryId ? '请选择字典分类' : undefined}>
        <Select value={categoryId} showValue clearable={false} onChange={setCategoryId}
          options={categoriesForScope.map((item) => ({ value: item.category.id, label: item.label,
            secondaryText: item.category.code }))} /></FormField>
      <FormField className="dictionary-definition-form__span-7" label="用途说明">
        <textarea rows={3} value={description} maxLength={1000} placeholder="说明字典的业务用途和使用边界"
        onChange={(event) => setDescription(event.target.value)} /></FormField>
      <FormField className="dictionary-definition-form__span-5" label="变更原因" hint="建议说明业务依据，便于审计追溯">
        <textarea rows={3} value={reason} maxLength={1000} placeholder="选填，记录创建或调整依据"
        onChange={(event) => setReason(event.target.value)} /></FormField>
      </div>
    </form>
  </Dialog>
}

interface CategoryEditorInput {
  scopeType: DictionaryScopeType
  parentId?: string
  code: string
  name: string
  description?: string
  sortOrder: number
  reason?: string
}

function DictionaryCategoryDialog({ state, categories, busy, onClose, onStatus, onSave }: {
  state: Exclude<CategoryDialogState, undefined>; categories: DictionaryCategory[]; busy: boolean
  onClose: () => void; onStatus: (category: DictionaryCategory) => Promise<unknown>
  onSave: (mode: 'create' | 'edit', category: DictionaryCategory | undefined,
    input: CategoryEditorInput) => Promise<DictionaryCategory>
}) {
  const [selectedId, setSelectedId] = useState(state.mode === 'edit' ? state.category.id : state.parentId)
  const [editor, setEditor] = useState<{ mode: 'create'; parentId?: string } | { mode: 'edit'; categoryId: string }>(
    state.mode === 'edit' ? { mode: 'edit', categoryId: state.category.id } : { mode: 'create', parentId: state.parentId },
  )
  const [savedMessage, setSavedMessage] = useState('')
  const editingCategory = editor.mode === 'edit' ? categories.find((item) => item.id === editor.categoryId) : undefined
  const nodes = categories.map((category) => ({
    id: category.id, parentId: category.parentId, label: category.name,
    secondaryText: `${category.sdDictScopeTypeText} · ${category.code}`,
    keywords: [category.code, category.scopeCode, category.sdDictScopeTypeText, category.description ?? ''],
    inactive: category.sdDictCategoryStatus === 'INACTIVE',
  }))

  return <Dialog title="管理字典分类" eyebrow="普通枚举字典" size="xwide" onClose={onClose}
    closeOnBackdrop={false} description="分类按作用域形成独立目录树；编码和作用域创建后不可修改，移动与状态变化均写入变更日志。"
    footer={<><Button variant="secondary" onClick={onClose}>关闭</Button>
      <Button type="submit" form="dictionary-category-form" busy={busy}>
        {editor.mode === 'create' ? '创建分类' : '保存分类'}</Button></>}>
    {savedMessage && <Alert tone="success" className="dictionary-category-feedback">{savedMessage}</Alert>}
    <div className="dictionary-category-workspace">
      <TreePanel title="分类目录" nodes={nodes} selectedId={selectedId} rootLabel="全部分类"
        searchPlaceholder="搜索名称、编码或范围" busy={busy} onSelect={(id) => {
          setSelectedId(id); setSavedMessage('')
          setEditor(id ? { mode: 'edit', categoryId: id } : { mode: 'create' })
        }}
        onAdd={(parentId) => { setSelectedId(parentId); setEditor({ mode: 'create', parentId }); setSavedMessage('') }}
        onEdit={(id) => { setSelectedId(id); setEditor({ mode: 'edit', categoryId: id }); setSavedMessage('') }} />
      <section className="dictionary-category-editor">
        <header className="dictionary-category-editor__head"><div><span>{editor.mode === 'create' ? '新增节点' : '当前节点'}</span>
          <div className="dictionary-category-editor__title"><h3>{editor.mode === 'create' ? '补充分类信息' : editingCategory?.name ?? '分类不存在'}</h3>
            {editingCategory && <StatusBadge tone={editingCategory.sdDictCategoryStatus === 'ACTIVE' ? 'success' : 'neutral'}>
              {editingCategory.sdDictCategoryStatusText}</StatusBadge>}</div>
          {editingCategory && <small>{editingCategory.sdDictScopeTypeText} · {editingCategory.code}
            {' · '}{editingCategory.dictionaryCount} 个字典</small>}</div>
          {editingCategory && <Button size="sm" variant={editingCategory.sdDictCategoryStatus === 'ACTIVE' ? 'danger' : 'secondary'}
            busy={busy} onClick={async () => { await onStatus(editingCategory); setSavedMessage('分类状态已更新') }}>
            {editingCategory.sdDictCategoryStatus === 'ACTIVE' ? '停用分类' : '启用分类'}</Button>}</header>
        {editor.mode === 'edit' && !editingCategory
          ? <EmptyState icon="tasks" title="分类不存在" copy="请从左侧重新选择分类。" />
          : <DictionaryCategoryEditor key={editor.mode === 'edit' ? editingCategory!.id : `new-${editor.parentId ?? 'root'}`}
            mode={editor.mode} category={editingCategory} categories={categories} defaultParentId={editor.mode === 'create' ? editor.parentId : undefined}
            busy={busy} onSave={async (input) => {
              const saved = await onSave(editor.mode, editingCategory, input)
              setSelectedId(saved.id); setEditor({ mode: 'edit', categoryId: saved.id })
              setSavedMessage(editor.mode === 'create' ? `已创建分类“${saved.name}”` : `已保存分类“${saved.name}”`)
            }} />}
      </section>
    </div>
  </Dialog>
}

function DictionaryCategoryEditor({ mode, category, categories, defaultParentId, busy, onSave }: {
  mode: 'create' | 'edit'; category?: DictionaryCategory; categories: DictionaryCategory[]
  defaultParentId?: string; busy: boolean; onSave: (input: CategoryEditorInput) => Promise<void>
}) {
  const defaultParent = categories.find((item) => item.id === defaultParentId)
  const [scopeType, setScopeType] = useState<DictionaryScopeType>(category?.sdDictScopeType ?? defaultParent?.sdDictScopeType ?? 'TENANT')
  const [parentId, setParentId] = useState(category?.parentId ?? defaultParentId ?? '')
  const [code, setCode] = useState(category?.code ?? '')
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 10)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const descendants = category ? descendantCategoryIds(categories, category.id) : new Set<string>()
  const parentOptions = flattenCategories(categories).filter((item) => item.category.sdDictScopeType === scopeType
    && item.category.sdDictCategoryStatus === 'ACTIVE' && item.category.id !== category?.id
    && !descendants.has(item.category.id))
  const codeError = !code.trim() ? '请输入分类编码'
    : !/^[A-Z][A-Z0-9_]{0,63}$/.test(code.trim().toUpperCase())
      ? '必须以字母开头，只能使用大写字母、数字和下划线' : ''

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (busy || codeError || !name.trim() || sortOrder < 0) return
    try {
      await onSave({ scopeType, parentId: parentId || undefined, code: code.trim().toUpperCase(), name: name.trim(),
        description: description.trim() || undefined, sortOrder, reason: reason.trim() || undefined })
    } catch { /* Page-level feedback keeps the editor open. */ }
  }

  return <form id="dictionary-category-form" className="dictionary-category-form" onSubmit={submit} noValidate>
    <FormField className="dictionary-category-form__span-5" label="分类名称" required
      error={submitted && !name.trim() ? '请输入分类名称' : undefined}>
      <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></FormField>
    <FormField className="dictionary-category-form__span-7" label="分类编码" required hint="创建后不可修改"
      error={submitted ? codeError || undefined : undefined}>
      <input value={code} readOnly={mode === 'edit'} maxLength={64} onChange={(event) => setCode(event.target.value)} /></FormField>
    <FormField className="dictionary-category-form__span-4" label="适用范围" required>
      <Select value={scopeType} disabled={mode === 'edit' || Boolean(defaultParentId)} showValue clearable={false}
        onChange={(value) => { setScopeType(value as DictionaryScopeType); setParentId('') }}
        options={[{ value: 'TENANT', label: '租户私有' }, { value: 'PLATFORM', label: '平台共享' }]} /></FormField>
    <FormField className="dictionary-category-form__span-5" label="上级分类">
      <Select value={parentId} placeholder="根分类" showValue onChange={setParentId}
        options={parentOptions.map((item) => ({ value: item.category.id, label: item.label,
          secondaryText: item.category.code }))} /></FormField>
    <FormField className="dictionary-category-form__span-3" label="排序号"><input type="number" min={0} value={sortOrder}
      onChange={(event) => setSortOrder(Number(event.target.value))} /></FormField>
    <FormField className="dictionary-category-form__span-7" label="分类说明" hint="说明收录边界和维护责任">
      <textarea rows={3} value={description} maxLength={1000} placeholder="说明该分类收录哪些字典"
      onChange={(event) => setDescription(event.target.value)} /></FormField>
    <FormField className="dictionary-category-form__span-5" label="变更原因" hint="选填，用于审计追溯">
      <textarea rows={3} value={reason} maxLength={1000} placeholder="记录本次调整依据"
      onChange={(event) => setReason(event.target.value)} /></FormField>
  </form>
}

function DictionaryItemDialog({ dictionary, item, busy, onClose, onSave }: {
  dictionary: DictionaryDetail; item: DictionaryItem | null; busy: boolean; onClose: () => void
  onSave: (input: { code: string; name: string; description?: string; sortOrder: number }) => Promise<unknown>
}) {
  const [code, setCode] = useState(item?.code ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [sortOrder, setSortOrder] = useState(item?.sortOrder ?? 10)
  const [submitted, setSubmitted] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (!code.trim() || !name.trim() || sortOrder < 0) return
    try {
      await onSave({ code: code.trim().toUpperCase(), name: name.trim(),
        description: description.trim() || undefined, sortOrder })
    } catch {
      // The page-level alert is populated by the mutation; keep the dialog open for correction.
    }
  }

  return <Dialog title={item ? '编辑字典项' : '新增字典项'} eyebrow={dictionary.name} onClose={onClose}
    closeOnBackdrop={false} description="业务编码创建后不可修改；停用只影响新业务，历史数据仍可按原编码解释。"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="dictionary-item-form" busy={busy}>{item ? '保存修改' : '新增字典项'}</Button></>}>
    <form id="dictionary-item-form" onSubmit={submit} noValidate>
      <div className="ui-form-row"><FormField className="ui-field--grow" label="显示名称"
        error={submitted && !name.trim() ? '请输入显示名称' : undefined}>
        <input value={name} maxLength={300} onChange={(event) => setName(event.target.value)} autoFocus /></FormField>
        <FormField label="排序号"><input type="number" min="0" step="10" value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))} /></FormField></div>
      <FormField label="业务编码" error={submitted && !code.trim() ? '请输入业务编码' : undefined}
        hint={item ? '已创建编码不可修改' : '大写字母、数字、下划线、点或连字符'}>
        <input value={code} maxLength={128} readOnly={Boolean(item)} onChange={(event) => setCode(event.target.value)} /></FormField>
      <FormField label="说明"><textarea value={description} maxLength={1000}
        onChange={(event) => setDescription(event.target.value)} /></FormField>
    </form>
  </Dialog>
}

function DictionaryChangesDialog({ dictionary, changes, loading, error, onClose }: {
  dictionary: DictionaryDetail; changes: DictionaryChange[]; loading: boolean; error: string; onClose: () => void
}) {
  return <Dialog title="变更记录" eyebrow={dictionary.name} onClose={onClose}
    description="日志只追加不覆盖，前后快照与字典变更在同一事务内保存。"
    footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    {loading && <LoadingState label="正在加载变更记录…" />}
    {error && <Alert>{error}</Alert>}
    {!loading && !error && changes.length === 0 && <EmptyState icon="tasks" title="暂无变更记录" copy="该字典尚未产生变更。" />}
    <ol className="dictionary-change-list">{changes.map((change) => <li key={change.id}>
      <div><strong>{change.sdDictChangeTypeText}</strong>
        <StatusBadge>{change.sdDictChangeTargetTypeText}</StatusBadge></div>
      <p>{change.reason || '未填写变更原因'}</p>
      <small>{formatDate(change.changedAt)} · 操作用户 {change.changedBy} · 请求 {change.requestCode}</small>
      <details><summary>查看前后快照</summary><pre>{JSON.stringify({ before: change.before ?? null, after: change.after ?? null }, null, 2)}</pre></details>
    </li>)}</ol>
  </Dialog>
}

interface CategoryOption { category: DictionaryCategory; label: string }

function flattenCategories(categories: DictionaryCategory[]): CategoryOption[] {
  const byParent = new Map<string, DictionaryCategory[]>()
  for (const category of categories) {
    const key = category.parentId ?? ''
    byParent.set(key, [...(byParent.get(key) ?? []), category])
  }
  const result: CategoryOption[] = []
  const visit = (parentId: string, depth: number) => {
    for (const category of (byParent.get(parentId) ?? []).sort((a, b) =>
      a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      result.push({ category, label: `${'　'.repeat(depth)}${depth ? '└ ' : ''}${category.name}` })
      visit(category.id, depth + 1)
    }
  }
  visit('', 0)
  return result
}

function descendantCategoryIds(categories: DictionaryCategory[], categoryId: string) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
