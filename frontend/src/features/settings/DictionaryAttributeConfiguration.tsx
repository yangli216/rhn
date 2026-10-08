import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DictionaryAttributeCardinality, DictionaryAttributeDataType, DictionaryAttributeDefinition,
  DictionaryAttributeOverridePolicy, DictionaryAttributeScopeType, DictionaryDetail, DictionaryItem,
  DictionarySummary, DictionaryItemAttributeConfiguration, DictionaryAttributeValueSet, RhnApi, Department, OrganizationUnit,
} from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'
import { ConfigurationScopeTarget, useConfigurationScopeTarget } from './ConfigurationScopeTarget'
import { dictionaryCommandKey, requireSavedAttributeValues } from './dictionaryMutationReceipt'

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

function useDictionaryRequestCodes() {
  const pending = useRef(new Map<string, string>())
  return {
    forCommand(command: unknown) {
      const key = dictionaryCommandKey(command)
      const code = pending.current.get(key) ?? crypto.randomUUID()
      pending.current.set(key, code)
      return code
    },
    confirm(command: unknown) { pending.current.delete(dictionaryCommandKey(command)) },
  }
}

function requireDefinitions(value: DictionaryAttributeDefinition[], dictionaryId: string) {
  if (!Array.isArray(value) || value.some((item) => !item || !item.id || item.dictionaryId !== dictionaryId
    || typeof item.name !== 'string' || !item.name || typeof item.code !== 'string' || !item.code || !Number.isInteger(item.revision)
    || typeof item.description !== 'string' || typeof item.requiredValue !== 'boolean' || typeof item.searchable !== 'boolean'
    || !Object.hasOwn(typeNames, item.dataType) || !Object.hasOwn(scopeNames, item.minimumScope)
    || !['SINGLE', 'MULTIPLE'].includes(item.cardinality) || !['ANY', 'NO_OVERRIDE'].includes(item.overridePolicy)
    || !['ACTIVE', 'INACTIVE'].includes(item.status) || !item.schema || typeof item.schema !== 'object'
    || Array.isArray(item.schema) || !Array.isArray(item.referenceOptions)
    || item.referenceOptions.some((option) => !option || typeof option.id !== 'string' || !option.id
      || typeof option.code !== 'string' || typeof option.name !== 'string'))) {
    throw new Error('属性定义响应不完整，请重新加载')
  }
  return value
}

function attributeScopeCode(scope: DictionaryAttributeScopeType, tenantId: string, organizationId: string, departmentId: string) {
  if (scope === 'PLATFORM') return 'PLATFORM'
  if (scope === 'TENANT') return `TENANT:${tenantId}`
  const organization = `TENANT:${tenantId}/ORG:${organizationId}`
  return scope === 'ORGANIZATION' ? organization : `${organization}/DEPT:${departmentId}`
}

function validValueSet(definition: DictionaryAttributeDefinition, source?: DictionaryAttributeValueSet) {
  if (source == null) return true
  if (typeof source !== 'object') return false
  if (!Array.isArray(source.values)) return false
  if (source.valueMode === 'EXPLICIT_EMPTY') return source.values.length === 0
  if (source.valueMode !== 'OVERRIDE' || source.values.length === 0) return false
  if (definition.cardinality === 'SINGLE' && source.values.length !== 1) return false
  return source.values.every((member) => member && (definition.dataType === 'DICT_REF'
    ? typeof member.referenceItemId === 'string' && Boolean(member.referenceItemId.trim())
    : typeof member.value === 'string'))
}

function requireConfiguration(value: DictionaryItemAttributeConfiguration, dictionaryId: string,
  scope: DictionaryAttributeScopeType, scopeCode: string, itemId?: string) {
  if (!value || value.dictionaryId !== dictionaryId || !value.dictionaryItemId
    || itemId && value.dictionaryItemId !== itemId || value.editingScope !== scope || value.editingScopeCode !== scopeCode
    || !Array.isArray(value.attributes) || value.attributes.some((item) => !item?.definition?.id
      || !validValueSet(item.definition, item.configured) || !validValueSet(item.definition, item.resolved))) {
    throw new Error('属性配置响应与当前目标不符或不完整')
  }
  return value
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
  const [configurationItem, setConfigurationItem] = useState<{ item: DictionaryItem; definition: DictionaryAttributeDefinition }>()
  const [displayScope, setDisplayScope] = useState<DictionaryAttributeScopeType>('ORGANIZATION')
  const [displayOrganizationId, setDisplayOrganizationId] = useState(context.organization.id)
  const [displayDepartmentId, setDisplayDepartmentId] = useState(context.department.id)
  const [itemQuery, setItemQuery] = useState('')
  const [error, setError] = useState('')
  const requests = useDictionaryRequestCodes()
  const displayTarget = useConfigurationScopeTarget({ api, scopeType: displayScope, tenantId: context.tenantId,
    organizationId: displayOrganizationId, departmentId: displayDepartmentId })
  const attributes = useQuery({
    queryKey: ['dictionary-attributes', dictionary.id, context.tenantId],
    queryFn: async () => requireDefinitions(await api.dictionaries.attributes(dictionary.id), dictionary.id),
  })
  const dictionaryOptions = useQuery({
    queryKey: ['dictionary-options', context.tenantId],
    queryFn: async () => {
      const result = await api.dictionaries.list('', '', '', 'ACTIVE')
      if (!Array.isArray(result) || result.some((item) => !item || !item.id || !item.name || !item.code)) {
        throw new Error('引用字典列表响应不完整')
      }
      return result
    },
  })
  const definitionsReady = attributes.isSuccess && !attributes.isFetching
  const dictionariesReady = dictionaryOptions.isSuccess && !dictionaryOptions.isFetching
  async function reloadDefinitions() {
    await Promise.all([attributes.refetch(), dictionaryOptions.refetch()])
  }
  const itemConfigurations = useQuery({
    queryKey: ['dictionary-item-attribute-configurations', dictionary.id, context.tenantId, displayScope,
      displayOrganizationId, displayDepartmentId],
    queryFn: async () => {
      const result = await api.dictionaries.itemAttributeConfigurations(dictionary.id, displayScope,
        displayScope === 'ORGANIZATION' || displayScope === 'DEPARTMENT' ? displayOrganizationId : '',
        displayScope === 'DEPARTMENT' ? displayDepartmentId : '')
      if (!Array.isArray(result)) throw new Error('属性配置列表响应不完整')
      return result.map((value) => requireConfiguration(value, dictionary.id, displayScope,
        attributeScopeCode(displayScope, context.tenantId, displayOrganizationId, displayDepartmentId)))
    },
    enabled: displayTarget.ready && definitionsReady,
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
    mutationFn: async (attribute: DictionaryAttributeDefinition) => {
      if (!definitionsReady) throw new Error('属性定义尚未确认，请重新加载')
      setError('')
      const input = {
        expectedDictionaryRevision: dictionary.revision,
        expectedAttributeRevision: attribute.revision,
        reason: attribute.status === 'ACTIVE' ? '停止扩展属性配置' : '恢复扩展属性配置',
      }
      const command = { operation: 'status', dictionaryId: dictionary.id, attributeId: attribute.id, input }
      const saved = await api.dictionaries.changeAttributeStatus(dictionary.id, attribute.id, attribute.status !== 'ACTIVE',
        { ...input, requestCode: requests.forCommand(command) })
      requireDefinitions([saved], dictionary.id)
      if (saved.id !== attribute.id || saved.revision <= attribute.revision || saved.status !== (attribute.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')) {
        throw new Error('属性状态变更未确认，请核实后重试')
      }
      requests.confirm(command)
      return saved
    },
    onSuccess: (next) => refresh(`扩展属性“${next.name}”状态已更新`),
    onError: (cause) => setError(`状态变更未确认：${errorMessage(cause)}`),
  })

  const activeAttributes = definitionsReady ? attributes.data.filter((attribute) => attribute.status === 'ACTIVE') : []
  const visibleConfigurations = (itemConfigurations.data ?? []).filter((configuration) => {
    const normalized = itemQuery.trim().toLowerCase()
    return !normalized || `${configuration.itemName}${configuration.itemCode}`.toLowerCase().includes(normalized)
  })

  return <section className="dictionary-attributes">
    <header className="dictionary-attributes__head">
      <div><h3>扩展属性</h3><span>为每个字典项附加可继承的业务配置；下级作用域可自由覆盖上级值。</span></div>
      <Button size="sm" variant="secondary" disabled={!definitionsReady} onClick={() => setDefinitionEditor(null)}>
        <Icon name="add" />新增属性
      </Button>
    </header>
    {error && <Alert duration={null}>{error}</Alert>}
    {attributes.isFetching && <LoadingState label="正在加载扩展属性…" />}
    {attributes.isError && <div role="alert"><p>属性定义加载失败，不能判断是否已配置。</p>
      <Button variant="secondary" onClick={() => void reloadDefinitions()}>重新加载属性定义</Button>
    </div>}
    {definitionsReady && !attributes.data.length && <div className="dictionary-attributes__empty">
      当前字典尚未定义扩展属性。可新增“可用场景”“渠道能力”等配置。
    </div>}
    {definitionsReady && attributes.data.length > 0 && <div className="dictionary-attribute-cards">
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
          <ConfigurationScopeTarget verification={displayTarget} scopeType={displayScope} tenantId={context.tenantId}
            organizationId={displayOrganizationId} departmentId={displayDepartmentId}
            onOrganizationChange={setDisplayOrganizationId} onDepartmentChange={setDisplayDepartmentId}
            className="dictionary-attribute-values__target" />
        </div>
      </header>
      {!activeAttributes.length && definitionsReady && <div className="dictionary-attributes__empty">
        定义并启用扩展属性后，可在此直接查看每个字典项的配置值。
      </div>}
      {activeAttributes.length > 0 && displayTarget.ready && itemConfigurations.isFetching && <LoadingState label="正在解析字典项属性值…" />}
      {itemConfigurations.error && <div role="alert"><p>{errorMessage(itemConfigurations.error)}</p>
        <Button variant="secondary" disabled={!displayTarget.ready || itemConfigurations.isFetching}
          onClick={() => void itemConfigurations.refetch()}>重新加载属性列表</Button>
      </div>}
      {activeAttributes.length > 0 && displayTarget.ready && itemConfigurations.isSuccess && !itemConfigurations.isFetching && <div className="dictionary-attribute-value-table-wrap">
        <table className="dictionary-attribute-value-table">
          <thead><tr><th>字典项</th>{activeAttributes.map((attribute) => <th key={attribute.id}>
            <span>{attribute.name}</span><code>{attribute.code}</code></th>)}<th aria-label="操作">操作</th></tr></thead>
          <tbody>{visibleConfigurations.map((configuration) => {
            const item = items.find((value) => value.id === configuration.dictionaryItemId)
            return <tr key={configuration.dictionaryItemId}>
              <td><strong>{configuration.itemName}</strong><code>{configuration.itemCode}</code></td>
              {activeAttributes.map((attribute) => {
                const value = configuration.attributes.find((candidate) => candidate.definition.id === attribute.id)
                return <td key={attribute.id}><AttributeValueDisplay value={value} /></td>
              })}
              <td>{item && <Button size="sm" variant="text" onClick={() => setConfigurationItem({ item, definition: activeAttributes[0] })}>配置</Button>}</td>
            </tr>
          })}</tbody>
        </table>
        {!visibleConfigurations.length && <div className="dictionary-attribute-values__empty-result">
          未找到匹配的字典项。
        </div>}
      </div>}
      {activeAttributes.length > 0 && displayTarget.ready && itemConfigurations.isSuccess && !itemConfigurations.isFetching && <footer className="dictionary-table__footer">
        显示 {visibleConfigurations.length} 个字典项 · 查看层级：{scopeNames[displayScope]}
      </footer>}
    </section>

    {definitionEditor !== undefined && <AttributeDefinitionDialog api={api} dictionary={dictionary}
      attribute={definitionEditor} dictionaries={dictionaryOptions.data ?? []}
      available={definitionsReady && (!definitionEditor || attributes.data.some((item) => item.id === definitionEditor.id
        && item.revision === definitionEditor.revision))} dictionariesAvailable={dictionariesReady} onRefresh={reloadDefinitions}
      onClose={() => setDefinitionEditor(undefined)} onSaved={async (message) => {
        setDefinitionEditor(undefined); await refresh(message)
      }} />}
    {configurationItem && <ItemAttributeDialog api={api} dictionary={dictionary}
      item={configurationItem.item} initialDefinition={configurationItem.definition}
      definitions={attributes.data?.filter((value) => value.status === 'ACTIVE') ?? []}
      available={definitionsReady} onRefresh={reloadDefinitions}
      context={context} initialScope={displayScope} initialOrganizationId={displayOrganizationId}
      initialDepartmentId={displayDepartmentId}
      onClose={() => setConfigurationItem(undefined)} onSaved={refresh} />}
  </section>
}

function AttributeValueDisplay({ value }: {
  value?: import('../../shared/rhnApi').DictionaryItemAttribute
}) {
  if (!value) return <span>属性配置缺失，待确认</span>
  const resolved = value?.resolved
  if (!resolved) return <div className="dictionary-attribute-value is-empty"><span>未配置</span>
    <small>当前上下文无生效值</small></div>
  const labels = resolved.valueMode === 'EXPLICIT_EMPTY' ? [] : resolved.values.map((member) =>
    member.referenceItemName ?? member.value ?? member.referenceItemCode ?? `引用项待确认（标识：${member.referenceItemId}）`)
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

function AttributeDefinitionDialog({ api, dictionary, attribute, dictionaries, available, dictionariesAvailable, onRefresh, onClose, onSaved }: {
  api: RhnApi
  dictionary: DictionaryDetail
  attribute: DictionaryAttributeDefinition | null
  dictionaries: DictionarySummary[]
  available: boolean
  dictionariesAvailable: boolean
  onRefresh: () => Promise<void>
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
  const canSave = available && (dataType !== 'DICT_REF' || dictionariesAvailable)
  const requests = useDictionaryRequestCodes()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!canSave) throw new Error('属性定义或引用字典尚未确认，请重新加载')
      setError('')
      const input = {
        expectedDictionaryRevision: dictionary.revision,
        expectedAttributeRevision: attribute?.revision,
        code: attribute ? undefined : code.trim().toUpperCase(), name: name.trim(), description: description.trim(),
        dataType, cardinality, referenceDictionaryId: dataType === 'DICT_REF' ? referenceDictionaryId : undefined,
        schema: attribute ? attribute.schema : {}, minimumScope, overridePolicy, requiredValue, searchable,
        reason: attribute ? '维护字典扩展属性定义' : '新增字典扩展属性',
      }
      const command = { operation: attribute ? 'update' : 'create', dictionaryId: dictionary.id, attributeId: attribute?.id, input }
      const payload = { ...input, requestCode: requests.forCommand(command) }
      const saved = attribute ? await api.dictionaries.updateAttribute(dictionary.id, attribute.id, payload)
        : await api.dictionaries.createAttribute(dictionary.id, payload)
      requireDefinitions([saved], dictionary.id)
      if (attribute && (saved.id !== attribute.id || saved.revision <= attribute.revision)
        || saved.code !== (attribute?.code ?? input.code) || saved.name !== input.name || saved.description !== input.description
        || saved.dataType !== dataType || saved.cardinality !== cardinality || saved.minimumScope !== minimumScope
        || saved.overridePolicy !== overridePolicy || saved.requiredValue !== requiredValue || saved.searchable !== searchable
        || saved.status !== (attribute?.status ?? 'ACTIVE')
        || dataType === 'DICT_REF' && saved.referenceDictionaryId !== referenceDictionaryId
        || dictionaryCommandKey(saved.schema) !== dictionaryCommandKey(input.schema)) {
        throw new Error('服务端返回的属性定义与提交内容不一致，保存未确认')
      }
      requests.confirm(command)
      return saved
    },
    onSuccess: (saved) => onSaved(`已${attribute ? '更新' : '新增'}扩展属性“${saved.name}”`),
    onError: (cause) => setError(`保存未确认：${errorMessage(cause)}`),
  })

  function submit(event: FormEvent) {
    event.preventDefault(); setSubmitted(true)
    if (!canSave || mutation.isPending || !name.trim() || !code.trim() || !description.trim() || (dataType === 'DICT_REF' && !referenceDictionaryId)) return
    mutation.mutate()
  }

  return <Dialog title={attribute ? '编辑扩展属性' : '新增扩展属性'} eyebrow={dictionary.name} size="wide"
    description="属性定义决定值类型、基数和允许自定义的最深层级；继承顺序固定为科室、机构、租户、全局。"
    closeOnBackdrop={false} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="dictionary-attribute-definition-form" disabled={!canSave} busy={mutation.isPending}>保存属性</Button></>}>
    {error && <p role="alert">{error}</p>}
    {!canSave && <div role="alert"><p>属性定义或引用字典尚未确认。请重新加载；若定义已变更，请关闭并重新打开编辑。</p>
      <Button variant="secondary" onClick={() => void onRefresh()}>重新核实属性定义</Button>
    </div>}
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
        <Select value={referenceDictionaryId} disabled={!dictionariesAvailable} clearable={false} showValue onChange={setReferenceDictionaryId}
          options={(dictionariesAvailable ? dictionaries : []).filter((value) => value.id !== dictionary.id).map((value) => ({
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

function ItemAttributeDialog({ api, dictionary, item, definitions, initialDefinition, context, initialScope,
  initialOrganizationId, initialDepartmentId, available, onRefresh, onClose, onSaved }: {
  api: RhnApi
  dictionary: DictionaryDetail
  item: DictionaryItem
  definitions: DictionaryAttributeDefinition[]
  initialDefinition: DictionaryAttributeDefinition
  context: DictionaryAttributeContext
  initialScope: DictionaryAttributeScopeType
  initialOrganizationId: string
  initialDepartmentId: string
  available: boolean
  onRefresh: () => Promise<void>
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  // Keep the chosen definition for draft display; an unavailable definition never switches to another attribute.
  const [definition, setDefinition] = useState(initialDefinition)
  const attributeId = definition.id
  const definitionReady = available && definitions.some((value) => value.id === definition.id && value.revision === definition.revision)
  const referenceOptions = definitionReady
    ? definitions.find((value) => value.id === definition.id)!.referenceOptions : definition.referenceOptions
  const allowedScopes = useMemo(() => (Object.keys(scopeNames) as DictionaryAttributeScopeType[])
    .filter((scope) => scopeDepth[scope] <= scopeDepth[definition.minimumScope]
      && (definition.overridePolicy !== 'NO_OVERRIDE' || scope === 'PLATFORM')),
  [definition.minimumScope, definition.overridePolicy])
  const [scopeType, setScopeType] = useState<DictionaryAttributeScopeType>(initialScope)
  const scopeAllowed = allowedScopes.includes(scopeType)
  const [organizationId, setOrganizationId] = useState(initialOrganizationId)
  const [departmentId, setDepartmentId] = useState(initialDepartmentId)
  const targetVerification = useConfigurationScopeTarget({ api, scopeType, tenantId: context.tenantId,
    organizationId, departmentId, enabled: scopeAllowed && definitionReady })
  const configuration = useQuery({
    queryKey: ['dictionary-item-attributes', dictionary.id, item.id, context.tenantId, scopeType, organizationId, departmentId, definition.id, definition.revision],
    queryFn: async () => {
      const result = await api.dictionaries.itemAttributes(dictionary.id, item.id, scopeType,
        scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT' ? organizationId : '',
        scopeType === 'DEPARTMENT' ? departmentId : '')
      const verified = requireConfiguration(result, dictionary.id, scopeType,
        attributeScopeCode(scopeType, context.tenantId, organizationId, departmentId), item.id)
      const selected = verified.attributes.find((value) => value.definition.id === definition.id)?.definition
      if (!selected || selected.revision !== definition.revision || selected.dataType !== definition.dataType
        || selected.cardinality !== definition.cardinality) throw new Error('属性配置与已确认的定义不一致，请重新加载')
      return verified
    },
    enabled: targetVerification.ready,
  })
  const current = configuration.data?.attributes.find((value) => value.definition.id === definition.id)
  const configurationReady = definitionReady && targetVerification.ready && configuration.isSuccess && !configuration.isFetching
    && current?.definition.revision === definition.revision
  const [values, setValues] = useState<string[]>([])
  const [explicitEmpty, setExplicitEmpty] = useState(false)
  const [error, setError] = useState('')
  const requests = useDictionaryRequestCodes()

  useEffect(() => {
    const source = current?.configured ?? current?.resolved
    setExplicitEmpty(source?.valueMode === 'EXPLICIT_EMPTY')
    const next = source?.values.map((value) => definition.dataType === 'DICT_REF' ? value.referenceItemId! : value.value!) ?? []
    setValues(next.length || definition.dataType === 'DICT_REF' ? next : [''])
  }, [current, attributeId, scopeType, definition.dataType])

  const unavailableReferences = definition.dataType === 'DICT_REF'
    ? values.filter((id) => !referenceOptions.some((option) => option.id === id)) : []
  const valueError = !explicitEmpty ? unavailableReferences.length ? '存在不可选的原引用项，请明确移除或替换'
    : !values.length || values.some((value) => !value.trim()) ? '请填写每一项属性值，或明确移除空项'
      : definition.cardinality === 'SINGLE' && values.length !== 1 ? '单值属性只能配置一项'
        : definition.dataType === 'BOOLEAN' && values.some((value) => !['true', 'false'].includes(value)) ? '请选择有效的布尔值'
          : definition.dataType === 'DATETIME' && values.some((value) => !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
            ? '日期时间必须包含时区，例如 2026-10-03T08:00:00+08:00' : '' : ''

  const save = useMutation({
    mutationFn: async () => {
      if (!configurationReady) throw new Error('配置对象或当前属性配置尚未确认，请重新加载')
      if (valueError) throw new Error(valueError)
      setError('')
      const input = {
      expectedDictionaryRevision: dictionary.revision, scopeType,
      organizationId: scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT' ? organizationId : undefined,
      departmentId: scopeType === 'DEPARTMENT' ? departmentId : undefined,
      valueMode: explicitEmpty ? 'EXPLICIT_EMPTY' as const : 'OVERRIDE' as const,
      values: explicitEmpty ? [] : values,
      reason: `${scopeNames[scopeType]}层维护${definition.name}`,
      }
      const command = { operation: 'values', dictionaryId: dictionary.id, itemId: item.id, attributeId: definition.id, input }
      const response = await api.dictionaries.setItemAttribute(dictionary.id, item.id, definition.id,
        { ...input, requestCode: requests.forCommand(command) })
      const scopeCode = attributeScopeCode(scopeType, context.tenantId, organizationId, departmentId)
      const saved = requireConfiguration(response, dictionary.id, scopeType, scopeCode, item.id)
      const selected = saved.attributes.find((value) => value.definition.id === definition.id)
      if (!selected || selected.definition.revision !== definition.revision || selected.definition.dataType !== definition.dataType
        || selected.definition.cardinality !== definition.cardinality || selected.configured?.scopeType !== scopeType) {
        throw new Error('保存返回的属性定义或作用域不一致，保存未确认')
      }
      requireSavedAttributeValues(definition, selected.configured,
        scopeCode, input.valueMode, input.values)
      requests.confirm(command)
      return { saved, message: `已保存“${item.name}”的${definition.name}` }
    },
    onSuccess: async (result) => {
      await onSaved(result.message)
      await configuration.refetch()
    },
    onError: (cause) => setError(`保存未确认：${errorMessage(cause)}`),
  })
  const inherit = useMutation({
    mutationFn: async () => {
      if (!configurationReady) throw new Error('配置对象或当前属性配置尚未确认，请重新加载')
      setError('')
      const input = {
      expectedDictionaryRevision: dictionary.revision, scopeType, reason: `恢复继承${definition.name}`,
      organizationId: scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT' ? organizationId : undefined,
      departmentId: scopeType === 'DEPARTMENT' ? departmentId : undefined,
      }
      const command = { operation: 'inherit', dictionaryId: dictionary.id, itemId: item.id, attributeId: definition.id, input }
      const response = await api.dictionaries.inheritItemAttribute(dictionary.id, item.id, definition.id,
        { ...input, requestCode: requests.forCommand(command) })
      const saved = requireConfiguration(response, dictionary.id, scopeType,
        attributeScopeCode(scopeType, context.tenantId, organizationId, departmentId), item.id)
      const selected = saved.attributes.find((value) => value.definition.id === definition.id)
      if (!selected || selected.definition.revision !== definition.revision || selected.configured != null) {
        throw new Error('服务端尚未确认移除当前层配置，恢复继承未确认')
      }
      requests.confirm(command)
      return { saved, message: `“${item.name}”的${definition.name}已恢复继承` }
    },
    onSuccess: async (result) => {
      await onSaved(result.message)
      await configuration.refetch()
    },
    onError: (cause) => setError(`恢复继承未确认：${errorMessage(cause)}`),
  })
  const missingTarget = (scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT') && !organizationId
    || scopeType === 'DEPARTMENT' && !departmentId

  return <Dialog title="配置字典项扩展属性" eyebrow={`${dictionary.name} · ${item.name}`} size="wide"
    description="当前层级可自由覆盖上级结果；选择“显式空集”会阻断继承并使最终结果为空。"
    closeOnBackdrop={false} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>关闭</Button>
      <Button disabled={!configurationReady || Boolean(valueError) || missingTarget || inherit.isPending} busy={save.isPending}
        onClick={() => save.mutate()}>保存当前层配置</Button></>}>
    {error && <p role="alert">{error}</p>}
    {!definitionReady && <div role="alert"><p>所选属性定义尚未确认、已变更或已停用，请核实后明确选择属性。</p>
      <Button variant="secondary" onClick={() => void onRefresh()}>重新核实属性定义</Button>
    </div>}
    <div className="dictionary-item-attribute-toolbar">
      <FormField label="扩展属性"><Select value={definition.id} disabled={!available} clearable={false} showValue onChange={(id) => {
        const next = definitions.find((value) => value.id === id)
        if (next) setDefinition(next)
      }}
        options={definitions.map((value) => ({ value: value.id, label: value.name, secondaryText: value.code }))} /></FormField>
      <FormField label="配置层级" error={!scopeAllowed ? '原层级不允许配置此属性，请明确选择允许的层级' : undefined}>
        <Select value={scopeType} clearable={false} showValue onChange={(value) => setScopeType(value as DictionaryAttributeScopeType)}
        options={allowedScopes.map((value) => ({ value, label: scopeNames[value] }))} /></FormField>
      <ConfigurationScopeTarget verification={targetVerification} scopeType={scopeType} tenantId={context.tenantId}
        organizationId={organizationId} departmentId={departmentId}
        onOrganizationChange={setOrganizationId} onDepartmentChange={setDepartmentId} />
    </div>
    {targetVerification.ready && !configurationReady && <div role="alert">
      <p>{configuration.isFetching ? '正在解析继承配置…' : '当前属性配置未确认，请重新加载后再保存。'}</p>
      <Button variant="secondary" disabled={configuration.isFetching} onClick={() => void configuration.refetch()}>重新加载属性配置</Button>
    </div>}
    {current && <div className="dictionary-item-attribute-editor">
      <div className="dictionary-item-attribute-editor__source">
        <span>当前生效来源</span><strong>{configurationReady ? current.resolved?.sourceLabel ?? '尚未配置' : '待确认'}</strong>
        {current.inherited && <StatusBadge tone="info">继承</StatusBadge>}
        {current.configured && <Button size="sm" variant="text" busy={inherit.isPending} disabled={!configurationReady || save.isPending}
          onClick={() => inherit.mutate()}>恢复继承</Button>}
      </div>
      <label className="dictionary-attribute-check"><input type="checkbox" checked={explicitEmpty}
        onChange={(event) => setExplicitEmpty(event.target.checked)} />当前层显式配置为空（阻断继承）</label>
      {valueError && <p role="alert">{valueError}</p>}
      {!explicitEmpty && unavailableReferences.map((id) => <div key={id}>
        <span>原引用项已不可选（标识：{id}）</span>
        <Button size="sm" variant="text" onClick={() => setValues(values.filter((value) => value !== id))}>移除此引用项 {id}</Button>
      </div>)}
      {!explicitEmpty && definition.dataType === 'DICT_REF' && <div className="dictionary-reference-options">
        {referenceOptions.map((option) => <label key={option.id}>
          <input type={definition.cardinality === 'SINGLE' ? 'radio' : 'checkbox'} name="dictionary-reference-value"
            checked={values.includes(option.id)} onChange={(event) => setValues(definition.cardinality === 'SINGLE'
              ? event.target.checked ? [option.id] : []
              : event.target.checked ? [...values, option.id] : values.filter((value) => value !== option.id))} />
          <span><strong>{option.name}</strong><code>{option.code}</code></span>
        </label>)}
      </div>}
      {!explicitEmpty && definition.dataType !== 'DICT_REF' && <div className="dictionary-attribute-form">
        {values.map((value, index) => <div key={index}>
          <FormField label={definition.cardinality === 'MULTIPLE' ? `属性值 ${index + 1}` : '属性值'} required
            hint={definition.dataType === 'DATETIME' ? '填写含时区的 ISO 日期时间；保留原始精度，不自动转换时区'
              : definition.dataType === 'DATE' ? '日期格式：YYYY-MM-DD' : undefined}>
            {definition.dataType === 'BOOLEAN'
              ? <Select value={value} clearable={false} showValue onChange={(next) => setValues(values.map((entry, position) => position === index ? next : entry))}
                  options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} />
              : definition.dataType === 'TEXT'
                ? <textarea rows={2} value={value} onChange={(event) => setValues(values.map((entry, position) => position === index ? event.target.value : entry))} />
                : <input value={value} onChange={(event) => setValues(values.map((entry, position) => position === index ? event.target.value : entry))} />}
          </FormField>
          {definition.cardinality === 'MULTIPLE' && <Button size="sm" variant="text"
            onClick={() => setValues(values.filter((_entry, position) => position !== index))}>移除属性值 {index + 1}</Button>}
        </div>)}
        {definition.cardinality === 'MULTIPLE' && <Button variant="secondary" onClick={() => setValues([...values, ''])}>添加属性值</Button>}
      </div>}
    </div>}
  </Dialog>
}
