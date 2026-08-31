import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DictionaryAttributeCardinality, DictionaryAttributeDataType, DictionaryAttributeDefinition,
  DictionaryAttributeOverridePolicy, DictionaryAttributeScopeType, DictionaryDetail, DictionaryItem,
  DictionarySummary, RhnApi, Department, OrganizationUnit,
} from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'
import { ConfigurationScopeTarget } from './ConfigurationScopeTarget'

export interface DictionaryAttributeContext {
  tenantId: string
  organization: Pick<OrganizationUnit, 'id' | 'name'>
  department: Pick<Department, 'id' | 'name' | 'organizationId'>
}

const scopeNames: Record<DictionaryAttributeScopeType, string> = {
  PLATFORM: '全局', TENANT: '租户', ORGANIZATION: '机构', DEPARTMENT: '科室',
}
const typeNames: Record<DictionaryAttributeDataType, string> = {
  BOOLEAN: '布尔', INTEGER: '整数', DECIMAL: '小数', TEXT: '文本', CODE: '编码',
  DATE: '日期', DATETIME: '日期时间', DICT_REF: '引用字典',
}
const scopeDepth: Record<DictionaryAttributeScopeType, number> = {
  PLATFORM: 0, TENANT: 1, ORGANIZATION: 2, DEPARTMENT: 3,
}

export function DictionaryAttributeConfiguration({ api, dictionary, items, context, onChanged }: {
  api: RhnApi
  dictionary: DictionaryDetail
  items: DictionaryItem[]
  context: DictionaryAttributeContext
  onChanged: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [definitionEditor, setDefinitionEditor] = useState<DictionaryAttributeDefinition | null | undefined>()
  const [configurationItem, setConfigurationItem] = useState<DictionaryItem>()
  const [displayScope, setDisplayScope] = useState<DictionaryAttributeScopeType>('ORGANIZATION')
  const [displayOrganizationId, setDisplayOrganizationId] = useState(context.organization.id)
  const [displayDepartmentId, setDisplayDepartmentId] = useState(context.department.id)
  const [itemQuery, setItemQuery] = useState('')
  const [error, setError] = useState('')
  const attributes = useQuery({
    queryKey: ['dictionary-attributes', dictionary.id],
    queryFn: () => api.dictionaries.attributes(dictionary.id),
  })
  const dictionaryOptions = useQuery({
    queryKey: ['dictionary-options'],
    queryFn: () => api.dictionaries.list('', '', '', 'ACTIVE'),
  })
  const itemConfigurations = useQuery({
    queryKey: ['dictionary-item-attribute-configurations', dictionary.id, displayScope,
      displayOrganizationId, displayDepartmentId],
    queryFn: () => api.dictionaries.itemAttributeConfigurations(dictionary.id, displayScope,
      displayScope === 'ORGANIZATION' || displayScope === 'DEPARTMENT' ? displayOrganizationId : '',
      displayScope === 'DEPARTMENT' ? displayDepartmentId : ''),
    enabled: displayScope !== 'ORGANIZATION' && displayScope !== 'DEPARTMENT' || Boolean(displayOrganizationId)
      && (displayScope !== 'DEPARTMENT' || Boolean(displayDepartmentId)),
  })

  async function refresh(message: string) {
    setError('')
    onChanged(message)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dictionary', dictionary.id] }),
      queryClient.invalidateQueries({ queryKey: ['dictionary-attributes', dictionary.id] }),
      queryClient.invalidateQueries({ queryKey: ['dictionary-item-attribute-configurations', dictionary.id] }),
      queryClient.invalidateQueries({ queryKey: ['dictionary-changes', dictionary.id] }),
      queryClient.invalidateQueries({ queryKey: ['applicable-dictionary-items'] }),
    ])
  }

  const statusMutation = useMutation({
    mutationFn: (attribute: DictionaryAttributeDefinition) => api.dictionaries.changeAttributeStatus(
      dictionary.id, attribute.id, attribute.status !== 'ACTIVE', {
        expectedDictionaryRevision: dictionary.revision,
        expectedAttributeRevision: attribute.revision,
        reason: attribute.status === 'ACTIVE' ? '停止扩展属性配置' : '恢复扩展属性配置',
        requestCode: crypto.randomUUID(),
      },
    ),
    onSuccess: (next) => refresh(`扩展属性“${next.name}”状态已更新`),
    onError: (cause) => setError(errorMessage(cause)),
  })

  const activeAttributes = attributes.data?.filter((attribute) => attribute.status === 'ACTIVE') ?? []
  const visibleConfigurations = (itemConfigurations.data ?? []).filter((configuration) => {
    const normalized = itemQuery.trim().toLowerCase()
    return !normalized || `${configuration.itemName}${configuration.itemCode}`.toLowerCase().includes(normalized)
  })

  return <section className="dictionary-attributes">
    <header className="dictionary-attributes__head">
      <div><h3>扩展属性</h3><span>为每个字典项附加可继承的业务配置；下级作用域可自由覆盖上级值。</span></div>
      <Button size="sm" variant="secondary" onClick={() => setDefinitionEditor(null)}>
        <Icon name="add" />新增属性
      </Button>
    </header>
    {error && <Alert>{error}</Alert>}
    {attributes.isPending && <LoadingState label="正在加载扩展属性…" />}
    {!attributes.isPending && !attributes.data?.length && <div className="dictionary-attributes__empty">
      当前字典尚未定义扩展属性。可新增“可用场景”“渠道能力”等配置。
    </div>}
    {!!attributes.data?.length && <div className="dictionary-attribute-cards">
      {attributes.data.map((attribute) => <article key={attribute.id}>
        <div><strong>{attribute.name}</strong><code>{attribute.code}</code></div>
        <div className="dictionary-attribute-cards__meta">
          <StatusBadge tone={attribute.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {attribute.status === 'ACTIVE' ? '启用' : '停用'}
          </StatusBadge>
          <span>{typeNames[attribute.dataType]} · {attribute.cardinality === 'MULTIPLE' ? '多值' : '单值'}</span>
          <span>可配置至{scopeNames[attribute.minimumScope]}</span>
          {attribute.referenceDictionaryName && <span>值域：{attribute.referenceDictionaryName}</span>}
        </div>
        <p>{attribute.description}</p>
        <div className="dictionary-row-actions">
          <Button size="sm" variant="text" onClick={() => setDefinitionEditor(attribute)}>编辑</Button>
          <Button size="sm" variant="text" busy={statusMutation.isPending}
            onClick={() => statusMutation.mutate(attribute)}>{attribute.status === 'ACTIVE' ? '停用' : '启用'}</Button>
        </div>
      </article>)}
    </div>}
    <section className="dictionary-attribute-values">
      <header className="dictionary-attribute-values__head">
        <div><h3>字典项属性值</h3><span>直接查看当前层级的配置值、最终生效值和继承来源。</span></div>
        <div className="dictionary-attribute-values__filters">
          <SearchField className="dictionary-attribute-values__search" label="搜索字典项属性值"
            value={itemQuery} onChange={setItemQuery} placeholder="搜索字典项" />
          <div className="dictionary-attribute-values__scope"><Select aria-label="属性值查看层级"
            value={displayScope} clearable={false} showValue onChange={(value) => setDisplayScope(value as DictionaryAttributeScopeType)}
            options={(Object.keys(scopeNames) as DictionaryAttributeScopeType[]).map((value) => ({
              value, label: scopeNames[value], secondaryText: `${scopeNames[value]}层配置`,
            }))} /></div>
          <ConfigurationScopeTarget api={api} scopeType={displayScope} tenantId={context.tenantId}
            organizationId={displayOrganizationId} departmentId={displayDepartmentId}
            onOrganizationChange={setDisplayOrganizationId} onDepartmentChange={setDisplayDepartmentId}
            className="dictionary-attribute-values__target" />
        </div>
      </header>
      {!activeAttributes.length && !attributes.isPending && <div className="dictionary-attributes__empty">
        定义并启用扩展属性后，可在此直接查看每个字典项的配置值。
      </div>}
      {activeAttributes.length > 0 && itemConfigurations.isPending && <LoadingState label="正在解析字典项属性值…" />}
      {itemConfigurations.error && <Alert>{errorMessage(itemConfigurations.error)}</Alert>}
      {activeAttributes.length > 0 && !itemConfigurations.isPending && <div className="dictionary-attribute-value-table-wrap">
        <table className="dictionary-attribute-value-table">
          <thead><tr><th>字典项</th>{activeAttributes.map((attribute) => <th key={attribute.id}>
            <span>{attribute.name}</span><code>{attribute.code}</code></th>)}<th aria-label="操作" /></tr></thead>
          <tbody>{visibleConfigurations.map((configuration) => {
            const item = items.find((value) => value.id === configuration.dictionaryItemId)
            return <tr key={configuration.dictionaryItemId}>
              <td><strong>{configuration.itemName}</strong><code>{configuration.itemCode}</code></td>
              {activeAttributes.map((attribute) => {
                const value = configuration.attributes.find((candidate) => candidate.definition.id === attribute.id)
                return <td key={attribute.id}><AttributeValueDisplay value={value} /></td>
              })}
              <td>{item && <Button size="sm" variant="text" onClick={() => setConfigurationItem(item)}>配置</Button>}</td>
            </tr>
          })}</tbody>
        </table>
        {!visibleConfigurations.length && <div className="dictionary-attribute-values__empty-result">
          未找到匹配的字典项。
        </div>}
      </div>}
      {activeAttributes.length > 0 && <footer className="dictionary-table__footer">
        显示 {visibleConfigurations.length} 个字典项 · 查看层级：{scopeNames[displayScope]}
      </footer>}
    </section>

    {definitionEditor !== undefined && <AttributeDefinitionDialog api={api} dictionary={dictionary}
      attribute={definitionEditor} dictionaries={dictionaryOptions.data ?? []}
      onClose={() => setDefinitionEditor(undefined)} onSaved={async (message) => {
        setDefinitionEditor(undefined); await refresh(message)
      }} />}
    {configurationItem && attributes.data && <ItemAttributeDialog api={api} dictionary={dictionary}
      item={configurationItem} definitions={attributes.data.filter((value) => value.status === 'ACTIVE')}
      context={context} initialScope={displayScope} initialOrganizationId={displayOrganizationId}
      initialDepartmentId={displayDepartmentId}
      onClose={() => setConfigurationItem(undefined)} onSaved={refresh} />}
  </section>
}

function AttributeValueDisplay({ value }: {
  value?: import('../../shared/rhnApi').DictionaryItemAttribute
}) {
  const resolved = value?.resolved
  if (!resolved) return <div className="dictionary-attribute-value is-empty"><span>未配置</span>
    <small>当前上下文无生效值</small></div>
  const labels = resolved.valueMode === 'EXPLICIT_EMPTY' ? [] : resolved.values.map((member) =>
    member.referenceItemName ?? member.value ?? member.referenceItemCode ?? '—')
  return <div className="dictionary-attribute-value">
    <div className="dictionary-attribute-value__members">
      {resolved.valueMode === 'EXPLICIT_EMPTY' ? <span className="is-empty-value">显式空集</span>
        : labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
    </div>
    <small><StatusBadge tone={value?.inherited ? 'info' : 'success'}>
      {value?.inherited ? '继承' : '本层配置'}
    </StatusBadge><span>来源：{resolved.sourceLabel}</span></small>
  </div>
}

function AttributeDefinitionDialog({ api, dictionary, attribute, dictionaries, onClose, onSaved }: {
  api: RhnApi
  dictionary: DictionaryDetail
  attribute: DictionaryAttributeDefinition | null
  dictionaries: DictionarySummary[]
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const [name, setName] = useState(attribute?.name ?? '')
  const [code, setCode] = useState(attribute?.code ?? '')
  const [description, setDescription] = useState(attribute?.description ?? '')
  const [dataType, setDataType] = useState<DictionaryAttributeDataType>(attribute?.dataType ?? 'DICT_REF')
  const [cardinality, setCardinality] = useState<DictionaryAttributeCardinality>(attribute?.cardinality ?? 'MULTIPLE')
  const [referenceDictionaryId, setReferenceDictionaryId] = useState(attribute?.referenceDictionaryId ?? '')
  const [minimumScope, setMinimumScope] = useState<DictionaryAttributeScopeType>(attribute?.minimumScope ?? 'ORGANIZATION')
  const [overridePolicy, setOverridePolicy] = useState<DictionaryAttributeOverridePolicy>(attribute?.overridePolicy ?? 'ANY')
  const [requiredValue, setRequiredValue] = useState(attribute?.requiredValue ?? false)
  const [searchable, setSearchable] = useState(attribute?.searchable ?? false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        expectedDictionaryRevision: dictionary.revision,
        expectedAttributeRevision: attribute?.revision,
        code: attribute ? undefined : code.trim().toUpperCase(), name: name.trim(), description: description.trim(),
        dataType, cardinality, referenceDictionaryId: dataType === 'DICT_REF' ? referenceDictionaryId : undefined,
        schema: {}, minimumScope, overridePolicy, requiredValue, searchable,
        reason: attribute ? '维护字典扩展属性定义' : '新增字典扩展属性', requestCode: crypto.randomUUID(),
      }
      return attribute ? api.dictionaries.updateAttribute(dictionary.id, attribute.id, input)
        : api.dictionaries.createAttribute(dictionary.id, input)
    },
    onSuccess: (saved) => onSaved(`已${attribute ? '更新' : '新增'}扩展属性“${saved.name}”`),
    onError: (cause) => setError(errorMessage(cause)),
  })

  function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (!name.trim() || !code.trim() || !description.trim() || (dataType === 'DICT_REF' && !referenceDictionaryId)) return
    mutation.mutate()
  }

  return <Dialog title={attribute ? '编辑扩展属性' : '新增扩展属性'} eyebrow={dictionary.name} size="wide"
    description="属性定义决定值类型、基数和允许自定义的最深层级；继承顺序固定为科室、机构、租户、全局。"
    closeOnBackdrop={false} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="dictionary-attribute-definition-form" busy={mutation.isPending}>保存属性</Button></>}>
    {error && <Alert>{error}</Alert>}
    <form id="dictionary-attribute-definition-form" className="dictionary-attribute-form" onSubmit={submit} noValidate>
      <FormField label="属性名称" required error={submitted && !name.trim() ? '请输入属性名称' : undefined}>
        <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></FormField>
      <FormField label="属性编码" required hint="创建后不可修改" error={submitted && !code.trim() ? '请输入属性编码' : undefined}>
        <input value={code} readOnly={Boolean(attribute)} maxLength={64} onChange={(event) => setCode(event.target.value)} /></FormField>
      <FormField className="dictionary-attribute-form__wide" label="用途说明" required
        error={submitted && !description.trim() ? '请输入用途说明' : undefined}>
        <input value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></FormField>
      <FormField label="数据类型"><Select value={dataType} clearable={false} showValue onChange={(value) => setDataType(value as DictionaryAttributeDataType)}
        options={Object.entries(typeNames).map(([value, label]) => ({ value, label }))} /></FormField>
      <FormField label="值基数"><Select value={cardinality} clearable={false} showValue onChange={(value) => setCardinality(value as DictionaryAttributeCardinality)}
        options={[{ value: 'SINGLE', label: '单值' }, { value: 'MULTIPLE', label: '多值' }]} /></FormField>
      {dataType === 'DICT_REF' && <FormField className="dictionary-attribute-form__wide" label="引用字典" required
        error={submitted && !referenceDictionaryId ? '请选择引用字典' : undefined}>
        <Select value={referenceDictionaryId} clearable={false} showValue onChange={setReferenceDictionaryId}
          options={dictionaries.filter((value) => value.id !== dictionary.id).map((value) => ({
            value: value.id, label: value.name, secondaryText: value.code,
          }))} /></FormField>}
      <FormField label="可配置最深层级"><Select value={minimumScope} clearable={false} showValue
        onChange={(value) => setMinimumScope(value as DictionaryAttributeScopeType)}
        options={Object.entries(scopeNames).map(([value, label]) => ({ value, label }))} /></FormField>
      <FormField label="下级覆盖策略"><Select value={overridePolicy} clearable={false} showValue
        onChange={(value) => setOverridePolicy(value as DictionaryAttributeOverridePolicy)}
        options={[{ value: 'ANY', label: '允许自由覆盖' }, { value: 'NO_OVERRIDE', label: '禁止下级覆盖' }]} /></FormField>
      <label className="dictionary-attribute-check"><input type="checkbox" checked={requiredValue}
        onChange={(event) => setRequiredValue(event.target.checked)} />业务使用时必须有最终值</label>
      <label className="dictionary-attribute-check"><input type="checkbox" checked={searchable}
        onChange={(event) => setSearchable(event.target.checked)} />允许作为业务筛选条件</label>
    </form>
  </Dialog>
}

function ItemAttributeDialog({ api, dictionary, item, definitions, context, initialScope,
  initialOrganizationId, initialDepartmentId, onClose, onSaved }: {
  api: RhnApi
  dictionary: DictionaryDetail
  item: DictionaryItem
  definitions: DictionaryAttributeDefinition[]
  context: DictionaryAttributeContext
  initialScope: DictionaryAttributeScopeType
  initialOrganizationId: string
  initialDepartmentId: string
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const [attributeId, setAttributeId] = useState(definitions[0]?.id ?? '')
  const definition = definitions.find((value) => value.id === attributeId) ?? definitions[0]
  const allowedScopes = useMemo(() => (Object.keys(scopeNames) as DictionaryAttributeScopeType[])
    .filter((scope) => scopeDepth[scope] <= scopeDepth[definition.minimumScope]
      && (definition.overridePolicy !== 'NO_OVERRIDE' || scope === 'PLATFORM')),
  [definition.minimumScope, definition.overridePolicy])
  const [scopeType, setScopeType] = useState<DictionaryAttributeScopeType>(allowedScopes.includes(initialScope)
    ? initialScope : allowedScopes.includes('ORGANIZATION') ? 'ORGANIZATION' : allowedScopes.at(-1) ?? 'PLATFORM')
  const [organizationId, setOrganizationId] = useState(initialOrganizationId || context.organization.id)
  const [departmentId, setDepartmentId] = useState(initialDepartmentId || context.department.id)
  useEffect(() => {
    if (!allowedScopes.includes(scopeType)) setScopeType(allowedScopes.at(-1) ?? 'PLATFORM')
  }, [allowedScopes, scopeType])
  const configuration = useQuery({
    queryKey: ['dictionary-item-attributes', dictionary.id, item.id, scopeType, organizationId, departmentId],
    queryFn: () => api.dictionaries.itemAttributes(dictionary.id, item.id, scopeType,
      scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT' ? organizationId : '',
      scopeType === 'DEPARTMENT' ? departmentId : ''),
    enabled: scopeType !== 'ORGANIZATION' && scopeType !== 'DEPARTMENT' || Boolean(organizationId)
      && (scopeType !== 'DEPARTMENT' || Boolean(departmentId)),
  })
  const current = configuration.data?.attributes.find((value) => value.definition.id === definition.id)
  const [values, setValues] = useState<string[]>([])
  const [scalarValue, setScalarValue] = useState('')
  const [explicitEmpty, setExplicitEmpty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const source = current?.configured ?? current?.resolved
    setExplicitEmpty(current?.configured?.valueMode === 'EXPLICIT_EMPTY')
    const next = source?.values.map((value) => value.referenceItemCode ?? value.value ?? '') ?? []
    setValues(next.filter(Boolean)); setScalarValue(next.join(', '))
  }, [current, attributeId, scopeType])

  const save = useMutation({
    mutationFn: () => api.dictionaries.setItemAttribute(dictionary.id, item.id, definition.id, {
      expectedDictionaryRevision: dictionary.revision, scopeType,
      organizationId: scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT' ? organizationId : undefined,
      departmentId: scopeType === 'DEPARTMENT' ? departmentId : undefined,
      valueMode: explicitEmpty ? 'EXPLICIT_EMPTY' : 'OVERRIDE',
      values: explicitEmpty ? [] : definition.dataType === 'DICT_REF' ? values
        : scalarValue.split(',').map((value) => value.trim()).filter(Boolean),
      reason: `${scopeNames[scopeType]}层维护${definition.name}`,
      requestCode: crypto.randomUUID(),
    }),
    onSuccess: async () => {
      await onSaved(`已保存“${item.name}”的${definition.name}`)
      await configuration.refetch()
    },
    onError: (cause) => setError(errorMessage(cause)),
  })
  const inherit = useMutation({
    mutationFn: () => api.dictionaries.inheritItemAttribute(dictionary.id, item.id, definition.id, {
      expectedDictionaryRevision: dictionary.revision, scopeType, reason: `恢复继承${definition.name}`,
      organizationId: scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT' ? organizationId : undefined,
      departmentId: scopeType === 'DEPARTMENT' ? departmentId : undefined,
      requestCode: crypto.randomUUID(),
    }),
    onSuccess: async () => {
      await onSaved(`“${item.name}”的${definition.name}已恢复继承`)
      await configuration.refetch()
    },
    onError: (cause) => setError(errorMessage(cause)),
  })
  const noValue = !explicitEmpty && (definition.dataType === 'DICT_REF' ? values.length === 0 : !scalarValue.trim())
  const missingTarget = (scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT') && !organizationId
    || scopeType === 'DEPARTMENT' && !departmentId

  return <Dialog title="配置字典项扩展属性" eyebrow={`${dictionary.name} · ${item.name}`} size="wide"
    description="当前层级可自由覆盖上级结果；选择“显式空集”会阻断继承并使最终结果为空。"
    closeOnBackdrop={false} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>关闭</Button>
      <Button disabled={noValue || missingTarget} busy={save.isPending}
        onClick={() => save.mutate()}>保存当前层配置</Button></>}>
    {error && <Alert>{error}</Alert>}
    <div className="dictionary-item-attribute-toolbar">
      <FormField label="扩展属性"><Select value={definition.id} clearable={false} showValue onChange={(value) => setAttributeId(value)}
        options={definitions.map((value) => ({ value: value.id, label: value.name, secondaryText: value.code }))} /></FormField>
      <FormField label="配置层级"><Select value={scopeType} clearable={false} showValue onChange={(value) => setScopeType(value as DictionaryAttributeScopeType)}
        options={allowedScopes.map((value) => ({ value, label: scopeNames[value] }))} /></FormField>
      <ConfigurationScopeTarget api={api} scopeType={scopeType} tenantId={context.tenantId}
        organizationId={organizationId} departmentId={departmentId}
        onOrganizationChange={setOrganizationId} onDepartmentChange={setDepartmentId} />
    </div>
    {configuration.isPending && <LoadingState label="正在解析继承配置…" />}
    {current && <div className="dictionary-item-attribute-editor">
      <div className="dictionary-item-attribute-editor__source">
        <span>当前生效来源</span><strong>{current.resolved?.sourceLabel ?? '尚未配置'}</strong>
        {current.inherited && <StatusBadge tone="info">继承</StatusBadge>}
        {current.configured && <Button size="sm" variant="text" busy={inherit.isPending}
          onClick={() => inherit.mutate()}>恢复继承</Button>}
      </div>
      <label className="dictionary-attribute-check"><input type="checkbox" checked={explicitEmpty}
        onChange={(event) => setExplicitEmpty(event.target.checked)} />当前层显式配置为空（阻断继承）</label>
      {!explicitEmpty && definition.dataType === 'DICT_REF' && <div className="dictionary-reference-options">
        {definition.referenceOptions.map((option) => <label key={option.id}>
          <input type={definition.cardinality === 'SINGLE' ? 'radio' : 'checkbox'} name="dictionary-reference-value"
            checked={values.includes(option.code)} onChange={(event) => setValues(definition.cardinality === 'SINGLE'
              ? event.target.checked ? [option.code] : []
              : event.target.checked ? [...values, option.code] : values.filter((value) => value !== option.code))} />
          <span><strong>{option.name}</strong><code>{option.code}</code></span>
        </label>)}
      </div>}
      {!explicitEmpty && definition.dataType !== 'DICT_REF' && <FormField label={definition.cardinality === 'MULTIPLE' ? '属性值（多个值用逗号分隔）' : '属性值'}>
        {definition.dataType === 'BOOLEAN'
          ? <Select value={scalarValue} clearable={false} showValue onChange={setScalarValue}
              options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} />
          : <input type={definition.dataType === 'DATE' ? 'date' : definition.dataType === 'DATETIME' ? 'datetime-local' : 'text'}
              value={scalarValue} onChange={(event) => setScalarValue(event.target.value)} />}
      </FormField>}
    </div>}
  </Dialog>
}
