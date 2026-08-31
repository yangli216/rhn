import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  errorMessage, type DictionarySummary, type ItemAttributeConfiguration,
  type ItemAttributeDataType, type ItemAttributeDefinitionConfiguration,
  type ItemAttributeDefinitionInput, type ItemAttributeJson,
  type ItemTypeAttributeConfiguration, type ItemTypeAttributeInput, type RhnApi,
} from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'

type SubjectType = '' | 'MEDICATION' | 'CATALOG_ITEM'
type Scope = 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'

export function ItemAttributeConfigurationPanel({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const [subjectType, setSubjectType] = useState<SubjectType>('MEDICATION')
  const [itemTypeId, setItemTypeId] = useState('')
  const [query, setQuery] = useState('')
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('')
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const queryKey = ['item-attribute-configurations', subjectType, itemTypeId]
  const configuration = useQuery({
    queryKey,
    queryFn: () => api.masterData.itemAttributeConfigurations(subjectType, itemTypeId),
  })
  const dictionaries = useQuery({
    queryKey: ['item-attribute-configuration-dictionaries'],
    queryFn: () => api.dictionaries.list('', '', '', 'ACTIVE'),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => { setItemTypeId(''); setSelectedDefinitionId('') }, [subjectType])
  const values = configuration.data
  const definitions = useMemo(() => (values?.definitions ?? []).filter((value) => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    return [value.name, value.code, value.description].some((item) => item.toLowerCase().includes(normalized))
  }), [query, values?.definitions])
  useEffect(() => {
    if (!definitions.length) { setSelectedDefinitionId(''); return }
    if (!definitions.some((value) => value.id === selectedDefinitionId)) setSelectedDefinitionId(definitions[0].id)
  }, [definitions, selectedDefinitionId])
  const selected = definitions.find((value) => value.id === selectedDefinitionId)
  const assignments = (values?.assignments ?? []).filter((value) => value.definitionId === selectedDefinitionId)

  const refresh = async (message: string) => {
    setDialog(undefined); setOperationError(''); setFeedback(message)
    await queryClient.invalidateQueries({ queryKey: ['item-attribute-configurations'] })
    await queryClient.invalidateQueries({ queryKey: ['master-data-item-attributes'] })
  }
  const fail = (error: unknown) => setOperationError(errorMessage(error))
  const definitionDialog = (value?: ItemAttributeDefinitionConfiguration) => setDialog(
    <DefinitionDialog api={api} configuration={values} dictionaries={dictionaries.data ?? []} value={value}
      onClose={() => setDialog(undefined)} onSaved={() => refresh(value ? '属性定义已更新' : '属性定义已创建')} onError={fail} />,
  )
  const assignmentDialog = (definition: ItemAttributeDefinitionConfiguration, value?: ItemTypeAttributeConfiguration) =>
    setDialog(<AssignmentDialog api={api} configuration={values!} definition={definition} value={value}
      onClose={() => setDialog(undefined)} onSaved={() => refresh(value ? '类型装配已更新' : '属性已装配到项目类型')}
      onError={fail} />)
  const changeDefinitionStatus = async (value: ItemAttributeDefinitionConfiguration) => {
    try {
      await api.masterData.changeItemAttributeDefinitionStatus(value,
        value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', '属性定义生命周期调整')
      await refresh(value.status === 'ACTIVE' ? '属性定义已停用' : '属性定义已启用')
    } catch (error) { fail(error) }
  }
  const changeAssignmentStatus = async (value: ItemTypeAttributeConfiguration) => {
    try {
      await api.masterData.changeItemTypeAttributeStatus(value,
        value.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', '项目类型属性装配状态调整')
      await refresh(value.status === 'ACTIVE' ? '属性装配已停用' : '属性装配已启用')
    } catch (error) { fail(error) }
  }

  return <div className="attribute-config-center">
    <div className="attribute-config-center__toolbar">
      <div><h3>项目类型与扩展属性</h3><p>定义租户长尾属性并装配到药品、诊疗项目类型；平台属性只读。</p></div>
      <Button disabled={!values} onClick={() => definitionDialog()}><Icon name="add" />新增租户属性</Button>
    </div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {(operationError || configuration.error || dictionaries.error) && <Alert>
      {operationError || errorMessage(configuration.error || dictionaries.error)}</Alert>}
    <div className="attribute-config-filters">
      <Select value={subjectType} onChange={(value) => setSubjectType(value as SubjectType)} showValue
        options={[{ value: 'MEDICATION', label: '药品知识' }, { value: 'CATALOG_ITEM', label: '诊疗与目录项目' }]} />
      <Select value={itemTypeId} onChange={setItemTypeId} placeholder="全部项目类型" showValue
        options={(values?.itemTypes ?? []).map((value) => ({ value: value.id, label: value.name,
          secondaryText: value.code }))} />
      <SearchField className="attribute-config-filters__search" label="搜索属性" value={query}
        onChange={setQuery} placeholder="搜索属性名称、编码或说明" />
      <span className="master-data-count">{definitions.length} 项属性</span>
    </div>
    {configuration.isPending ? <LoadingState label="正在加载项目类型与属性配置…" />
      : !definitions.length ? <EmptyState icon="settings" title="暂无符合条件的属性定义"
        copy="可新增租户属性；稳定核心字段应继续使用强类型基础数据。" />
        : <div className="attribute-config-layout">
          <div className="attribute-config-definitions" role="listbox" aria-label="属性定义">
            {definitions.map((value) => {
              const count = (values?.assignments ?? []).filter((item) => item.definitionId === value.id).length
              return <button key={value.id} type="button" className={value.id === selectedDefinitionId ? 'is-active' : ''}
                onClick={() => setSelectedDefinitionId(value.id)}>
                <span><strong>{value.name}</strong><code>{value.code}</code></span>
                <span><StatusBadge tone={value.scopeType === 'PLATFORM' ? 'neutral' : 'success'}>
                  {value.scopeType === 'PLATFORM' ? '平台' : '租户'}</StatusBadge>
                  <small>{count} 个装配</small></span>
              </button>
            })}
          </div>
          {selected && <section className="attribute-config-detail">
            <header><div><div className="attribute-config-detail__badges">
              <StatusBadge>{dataTypeLabel(selected.dataType)} · {selected.cardinality === 'MULTIPLE' ? '多值' : '单值'}</StatusBadge>
              <StatusBadge tone={selected.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {selected.status === 'ACTIVE' ? '有效' : '已停用'}</StatusBadge>
              {selected.storageMode === 'PROJECTED' && <StatusBadge tone="warning">强类型投影</StatusBadge>}
            </div><h3>{selected.name}</h3><code>{selected.code}</code><p>{selected.description}</p></div>
              <div className="attribute-config-detail__actions">
                {selected.editable && <><Button size="sm" variant="secondary" onClick={() => definitionDialog(selected)}>编辑定义</Button>
                  <Button size="sm" variant="text" onClick={() => changeDefinitionStatus(selected)}>
                    {selected.status === 'ACTIVE' ? '停用' : '启用'}</Button></>}
              </div></header>
            <dl className="attribute-config-metadata">
              <div><dt>可变性</dt><dd>{variabilityLabel(selected.variability)}</dd></div>
              <div><dt>解析上下文</dt><dd>{contextLabel(selected.contextBasis)}</dd></div>
              <div><dt>允许作用域</dt><dd>{selected.allowedScopes.map(scopeLabel).join('、') || '不允许覆盖'}</dd></div>
              <div><dt>默认值</dt><dd>{displayJson(selected.defaultValue)}</dd></div>
            </dl>
            <div className="attribute-config-assignments__header"><div><h4>项目类型装配</h4>
              <p>子类型装配优先于父类型，停用后不再进入维护 Schema 和业务解析。</p></div>
              {selected.editable && selected.status === 'ACTIVE' && <Button size="sm" onClick={() => assignmentDialog(selected)}>
                <Icon name="add" />新增装配</Button>}</div>
            {!assignments.length ? <EmptyState icon="settings" title="尚未装配到当前筛选范围"
              copy="选择新增装配，把该属性加入具体项目类型。" />
              : <div className="table-wrap"><table className="data-table"><thead><tr>
                <th>项目类型</th><th>分组 / 顺序</th><th>维护控件</th><th>规则</th><th>状态</th><th>操作</th>
              </tr></thead><tbody>{assignments.map((assignment) => {
                const type = values?.itemTypes.find((item) => item.id === assignment.itemTypeId)
                return <tr key={assignment.id}><td><strong>{type?.name || '未知类型'}</strong><code>{type?.code}</code></td>
                  <td>{assignment.groupName || '默认分组'}<small>{assignment.groupSortOrder} / {assignment.attributeSortOrder}</small></td>
                  <td>{widgetLabel(assignment.widgetType)}</td><td>{assignment.required ? '必填' : '选填'}
                    {assignment.listDisplay ? <small> · 列表展示</small> : null}</td>
                  <td><StatusBadge tone={assignment.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {assignment.status === 'ACTIVE' ? '有效' : '已停用'}</StatusBadge></td>
                  <td>{assignment.editable && <div className="row-actions"><Button size="sm" variant="text"
                    onClick={() => assignmentDialog(selected, assignment)}>编辑</Button><Button size="sm" variant="text"
                    onClick={() => changeAssignmentStatus(assignment)}>{assignment.status === 'ACTIVE' ? '停用' : '启用'}</Button></div>}</td></tr>
              })}</tbody></table></div>}
          </section>}
        </div>}
    {dialog}
  </div>
}

function DefinitionDialog({ api, configuration, dictionaries, value, onClose, onSaved, onError }: {
  api: RhnApi; configuration?: ItemAttributeConfiguration; dictionaries: DictionarySummary[]
  value?: ItemAttributeDefinitionConfiguration; onClose: () => void; onSaved: () => Promise<void>; onError: (error: unknown) => void
}) {
  const [dataType, setDataType] = useState<ItemAttributeDataType>(value?.dataType ?? 'TEXT')
  const [cardinality, setCardinality] = useState<'SINGLE' | 'MULTIPLE'>(value?.cardinality ?? 'SINGLE')
  const [variability, setVariability] = useState<ItemAttributeDefinitionInput['variability']>(value?.variability ?? 'BASE_ONLY')
  const [contextBasis, setContextBasis] = useState<ItemAttributeDefinitionInput['contextBasis']>(value?.contextBasis ?? 'NONE')
  const [sensitivity, setSensitivity] = useState(value?.sensitivity ?? 'NORMAL')
  const [dictionaryId, setDictionaryId] = useState(value?.dictionaryId ?? '')
  const [allowedScopes, setAllowedScopes] = useState<Scope[]>(value?.allowedScopes ?? [])
  const [nullable, setNullable] = useState(schemaNullable(value?.schema))
  const [enumValues, setEnumValues] = useState(schemaEnum(value?.schema).join('、'))
  const [minimum, setMinimum] = useState(schemaKeyword(value?.schema, 'minimum'))
  const [maximum, setMaximum] = useState(schemaKeyword(value?.schema, 'maximum'))
  const [maxLength, setMaxLength] = useState(schemaKeyword(value?.schema, 'maxLength'))
  const [defaultRaw, setDefaultRaw] = useState(rawValue(value?.defaultValue, cardinality))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (variability === 'BASE_ONLY') setAllowedScopes([])
    else if (!allowedScopes.length) setAllowedScopes(['TENANT', 'ORGANIZATION', 'DEPARTMENT'])
  }, [variability]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (dataType !== 'DICT_REF') setDictionaryId('') }, [dataType])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      const schema = buildSchema(dataType, cardinality, nullable, enumValues, minimum, maximum, maxLength)
      const input: ItemAttributeDefinitionInput = {
        code: String(form.get('code') || '').trim().toUpperCase(), name: String(form.get('name') || '').trim(),
        description: String(form.get('description') || '').trim(), dataType, cardinality,
        dictionaryId: dictionaryId || undefined, unitCode: optional(form, 'unitCode'), schema,
        defaultValue: parseConfiguredValue(defaultRaw, dataType, cardinality), variability,
        overridePolicy: variability === 'SCOPE_OVERRIDE' ? 'ANY' : 'NO_OVERRIDE', allowedScopes,
        contextBasis, sensitivity,
        reason: String(form.get('reason') || '').trim(), requestCode: crypto.randomUUID(),
      }
      if (value) await api.masterData.updateItemAttributeDefinition(value.id, value.revision, stripCode(input))
      else await api.masterData.createItemAttributeDefinition(input)
      await onSaved()
    } catch (error) { onError(error) } finally { setBusy(false) }
  }
  return <Dialog title={value ? '编辑属性定义' : '新增租户属性'} eyebrow="基础数据 · 元数据扩展" size="xwide"
    description="核心业务字段仍使用强类型表；这里仅配置低频、差异化、可继承的长尾属性。" onClose={onClose}>
    <form className="attribute-config-form" onSubmit={submit}>
      <section><header><h3>属性身份</h3><p>租户编码命名空间由平台固定，创建后属性编码不可修改。</p></header>
        <div className="attribute-config-form__grid">
          <FormField label="属性编码" required hint={`必须以 ${configuration?.tenantNamespace ?? 'TNT.<TENANT>.'} 开头`}>
            <input name="code" defaultValue={value?.code ?? configuration?.tenantNamespace} disabled={Boolean(value)} required /></FormField>
          <FormField label="属性名称" required><input name="name" defaultValue={value?.name} required /></FormField>
          <FormField label="属性说明" required className="span-2"><textarea name="description" defaultValue={value?.description}
            rows={2} required /></FormField>
        </div></section>
      <section><header><h3>数据约束</h3><p>使用结构化选项生成受控 Schema，不需要直接编辑 JSON。</p></header>
        <div className="attribute-config-form__grid attribute-config-form__grid--4">
          <FormField label="数据类型" required><Select value={dataType} onChange={(item) => setDataType(item as ItemAttributeDataType)}
            options={dataTypeOptions} showValue /></FormField>
          <FormField label="基数" required><Select value={cardinality} onChange={(item) => setCardinality(item as 'SINGLE' | 'MULTIPLE')}
            options={[{ value: 'SINGLE', label: '单值' }, { value: 'MULTIPLE', label: '多值' }]} /></FormField>
          <FormField label="单位编码"><input name="unitCode" defaultValue={value?.unitCode} placeholder="如 mg、mL" /></FormField>
          <FormField label="敏感级别"><Select value={sensitivity} onChange={setSensitivity}
            options={[{ value: 'NORMAL', label: '普通' }, { value: 'SENSITIVE', label: '敏感' },
              { value: 'MEDICAL_SAFETY', label: '医疗安全' }, { value: 'PRIVACY', label: '隐私' }]} /></FormField>
          {dataType === 'DICT_REF' && <FormField label="引用字典" required className="span-2"><Select value={dictionaryId}
            onChange={setDictionaryId} showValue options={dictionaries.map((item) => ({ value: item.id, label: item.name,
              secondaryText: item.code }))} /></FormField>}
          {dataType === 'ENUM' && <FormField label="枚举选项" required className="span-2"
            hint="使用顿号、逗号或换行分隔"><textarea value={enumValues} onChange={(event) => setEnumValues(event.target.value)} rows={2} /></FormField>}
          {['INTEGER', 'DECIMAL'].includes(dataType) && <><FormField label="最小值"><input type="number" value={minimum}
            onChange={(event) => setMinimum(event.target.value)} /></FormField><FormField label="最大值"><input type="number"
            value={maximum} onChange={(event) => setMaximum(event.target.value)} /></FormField></>}
          {['TEXT', 'ENUM', 'DICT_REF'].includes(dataType) && <FormField label="最大长度"><input type="number" min="1"
            value={maxLength} onChange={(event) => setMaxLength(event.target.value)} /></FormField>}
          <FormField label="空值策略"><label className="check-row"><input type="checkbox" checked={nullable}
            onChange={(event) => setNullable(event.target.checked)} /><span>允许显式空值覆盖</span></label></FormField>
          <FormField label="定义默认值" className="span-2" hint={cardinality === 'MULTIPLE' ? '多个值用顿号或逗号分隔' : undefined}>
            <input value={defaultRaw} onChange={(event) => setDefaultRaw(event.target.value)} placeholder="可不设置" /></FormField>
        </div></section>
      <section><header><h3>继承与业务上下文</h3><p>解析顺序固定为科室、机构、租户、公共值和默认值。</p></header>
        <div className="attribute-config-form__grid">
          <FormField label="可变性" required><Select value={variability}
            onChange={(item) => setVariability(item as ItemAttributeDefinitionInput['variability'])}
            options={[{ value: 'BASE_ONLY', label: '仅公共基线' }, { value: 'SCOPE_OVERRIDE', label: '允许作用域覆盖' },
              { value: 'LOCAL_ONLY', label: '必须本地配置' }]} /></FormField>
          <FormField label="上下文依据" required><Select value={contextBasis}
            onChange={(item) => setContextBasis(item as ItemAttributeDefinitionInput['contextBasis'])}
            options={contextOptions} /></FormField>
          {variability !== 'BASE_ONLY' && <FormField label="允许作用域" required className="span-2">
            <div className="attribute-scope-options">{(['TENANT', 'ORGANIZATION', 'DEPARTMENT'] as Scope[]).map((scope) =>
              <label key={scope}><input type="checkbox" checked={allowedScopes.includes(scope)} onChange={(event) =>
                setAllowedScopes((current) => event.target.checked ? [...new Set([...current, scope])]
                  : current.filter((item) => item !== scope))} /><span>{scopeLabel(scope)}</span></label>)}</div></FormField>}
        </div></section>
      <FormField label="变更原因" required hint="写入追加式配置审计"><input name="reason"
        defaultValue={value ? '调整租户属性定义' : '新增租户扩展属性'} required /></FormField>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>取消</Button>
        <Button type="submit" busy={busy}>{value ? '保存定义' : '创建属性'}</Button></div>
    </form>
  </Dialog>
}

function AssignmentDialog({ api, configuration, definition, value, onClose, onSaved, onError }: {
  api: RhnApi; configuration: ItemAttributeConfiguration; definition: ItemAttributeDefinitionConfiguration
  value?: ItemTypeAttributeConfiguration; onClose: () => void; onSaved: () => Promise<void>; onError: (error: unknown) => void
}) {
  const [itemTypeId, setItemTypeId] = useState(value?.itemTypeId ?? '')
  const [widgetType, setWidgetType] = useState(value?.widgetType ?? suggestedWidget(definition))
  const [required, setRequired] = useState(value?.required ?? false)
  const [listDisplay, setListDisplay] = useState(value?.listDisplay ?? false)
  const [defaultRaw, setDefaultRaw] = useState(rawValue(value?.defaultValue, definition.cardinality))
  const [busy, setBusy] = useState(false)
  const eligibleTypes = configuration.itemTypes.filter((type) => !configuration.assignments.some((assignment) =>
    assignment.definitionId === definition.id && assignment.itemTypeId === type.id && assignment.id !== value?.id))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      const input: ItemTypeAttributeInput = {
        itemTypeId, definitionId: definition.id, required,
        defaultValue: parseConfiguredValue(defaultRaw, definition.dataType, definition.cardinality), widgetType,
        groupName: optional(form, 'groupName'), groupSortOrder: Number(form.get('groupSortOrder')),
        attributeSortOrder: Number(form.get('attributeSortOrder')), searchable: false, listDisplay,
        reason: String(form.get('reason') || '').trim(), requestCode: crypto.randomUUID(),
      }
      if (value) await api.masterData.updateItemTypeAttribute(value.id, value.revision, stripAssignmentIds(input))
      else await api.masterData.createItemTypeAttribute(input)
      await onSaved()
    } catch (error) { onError(error) } finally { setBusy(false) }
  }
  return <Dialog title={value ? '编辑类型装配' : '新增类型装配'} eyebrow="基础数据 · 动态维护表单" size="wide"
    description={`将“${definition.name}”装配到项目类型；子类型配置优先于父类型。`} onClose={onClose}>
    <form className="attribute-config-form" onSubmit={submit}>
      <div className="attribute-config-form__grid">
        <FormField label="项目类型" required className="span-2"><Select value={itemTypeId} onChange={setItemTypeId}
          disabled={Boolean(value)} showValue options={eligibleTypes.map((item) => ({ value: item.id, label: item.name,
            secondaryText: item.code }))} /></FormField>
        <FormField label="维护控件" required><Select value={widgetType} onChange={setWidgetType}
          options={widgetOptions(definition)} showValue /></FormField>
        <FormField label="字段分组"><input name="groupName" defaultValue={value?.groupName ?? '扩展属性'} /></FormField>
        <FormField label="分组顺序" required><input name="groupSortOrder" type="number" min="0"
          defaultValue={value?.groupSortOrder ?? 50} required /></FormField>
        <FormField label="属性顺序" required><input name="attributeSortOrder" type="number" min="0"
          defaultValue={value?.attributeSortOrder ?? nextOrder(configuration, itemTypeId)} required /></FormField>
        <FormField label="类型默认值" className="span-2"><input value={defaultRaw}
          onChange={(event) => setDefaultRaw(event.target.value)} placeholder="不设置则使用属性定义默认值" /></FormField>
        <FormField label="维护规则"><div className="attribute-scope-options"><label><input type="checkbox" checked={required}
          onChange={(event) => setRequired(event.target.checked)} /><span>必填</span></label><label><input type="checkbox"
          checked={listDisplay} onChange={(event) => setListDisplay(event.target.checked)} /><span>列表展示</span></label></div></FormField>
      </div>
      <Alert tone="info">动态扩展属性暂不允许作为高频检索条件；需要检索、计费、库存或医疗安全规则时，应先晋升为强类型投影。</Alert>
      <FormField label="变更原因" required><input name="reason" defaultValue={value ? '调整项目类型属性装配' : '新增项目类型属性装配'} required /></FormField>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>取消</Button>
        <Button type="submit" busy={busy} disabled={!itemTypeId}>{value ? '保存装配' : '完成装配'}</Button></div>
    </form>
  </Dialog>
}

const dataTypeOptions = [
  ['TEXT', '文本'], ['BOOLEAN', '布尔'], ['INTEGER', '整数'], ['DECIMAL', '小数'], ['ENUM', '枚举'],
  ['DICT_REF', '字典引用'], ['DATE', '日期'], ['DATETIME', '日期时间'], ['DURATION', '时长'],
  ['TERM_REF', '术语引用'], ['OBJECT', '结构化对象'],
].map(([value, label]) => ({ value, label }))
const contextOptions = [
  ['NONE', '无业务上下文'], ['ORDERING', '开立机构 / 科室'], ['EXECUTING', '执行机构 / 科室'],
  ['DISPENSING', '发药机构 / 科室'], ['STOCKING', '库存机构 / 科室'],
].map(([value, label]) => ({ value, label }))

function buildSchema(dataType: ItemAttributeDataType, cardinality: 'SINGLE' | 'MULTIPLE', nullable: boolean,
  enumRaw: string, minimum: string, maximum: string, maxLength: string): Record<string, ItemAttributeJson> {
  const type = jsonType(dataType)
  const scalar: Record<string, ItemAttributeJson> = { type }
  if (dataType === 'ENUM') scalar.enum = splitValues(enumRaw)
  if (minimum) scalar.minimum = Number(minimum)
  if (maximum) scalar.maximum = Number(maximum)
  if (maxLength) scalar.maxLength = Number(maxLength)
  if (cardinality === 'MULTIPLE') return { type: nullable ? ['array', 'null'] : 'array', items: scalar, uniqueItems: true }
  return { ...scalar, type: nullable ? [type, 'null'] : type }
}

function parseConfiguredValue(raw: string, dataType: ItemAttributeDataType,
  cardinality: 'SINGLE' | 'MULTIPLE'): ItemAttributeJson | undefined {
  const normalized = raw.trim()
  if (!normalized) return undefined
  const values = cardinality === 'MULTIPLE' ? splitValues(normalized) : [normalized]
  const convert = (value: string): ItemAttributeJson => {
    if (dataType === 'BOOLEAN') return value === 'true' || value === '是'
    if (dataType === 'INTEGER') return Number.parseInt(value, 10)
    if (dataType === 'DECIMAL') return Number(value)
    if (['TERM_REF', 'OBJECT'].includes(dataType)) return JSON.parse(value) as ItemAttributeJson
    return value
  }
  const result = values.map(convert)
  return cardinality === 'MULTIPLE' ? result : result[0]
}

function splitValues(value: string) { return value.split(/[、,，;；\n]/).map((item) => item.trim()).filter(Boolean) }
function jsonType(value: ItemAttributeDataType) {
  if (value === 'BOOLEAN') return 'boolean'
  if (value === 'INTEGER') return 'integer'
  if (value === 'DECIMAL') return 'number'
  if (['TERM_REF', 'OBJECT'].includes(value)) return 'object'
  return 'string'
}
function schemaNode(schema: Record<string, ItemAttributeJson> | undefined) {
  return schema?.items && typeof schema.items === 'object' && !Array.isArray(schema.items)
    ? schema.items as Record<string, ItemAttributeJson> : schema
}
function schemaNullable(schema?: Record<string, ItemAttributeJson>) {
  return Array.isArray(schema?.type) && schema.type.includes('null')
}
function schemaEnum(schema?: Record<string, ItemAttributeJson>) {
  const value = schemaNode(schema)?.enum
  return Array.isArray(value) ? value.map(String) : []
}
function schemaKeyword(schema: Record<string, ItemAttributeJson> | undefined, key: string) {
  const value = schemaNode(schema)?.[key]
  return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
}
function rawValue(value: ItemAttributeJson | undefined, cardinality: 'SINGLE' | 'MULTIPLE') {
  if (value === undefined || value === null) return ''
  if (cardinality === 'MULTIPLE' && Array.isArray(value)) return value.map(String).join('、')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
function stripCode(input: ItemAttributeDefinitionInput): Omit<ItemAttributeDefinitionInput, 'code'> {
  const { code: _code, ...rest } = input; return rest
}
function stripAssignmentIds(input: ItemTypeAttributeInput): Omit<ItemTypeAttributeInput, 'itemTypeId' | 'definitionId'> {
  const { itemTypeId: _itemTypeId, definitionId: _definitionId, ...rest } = input; return rest
}
function optional(form: FormData, name: string) { const value = String(form.get(name) || '').trim(); return value || undefined }
function displayJson(value: ItemAttributeJson | undefined) {
  if (value === undefined) return '未设置'
  if (value === null) return '空值'
  if (typeof value === 'object') return JSON.stringify(value)
  return typeof value === 'boolean' ? (value ? '是' : '否') : String(value)
}
function dataTypeLabel(value: ItemAttributeDataType) { return dataTypeOptions.find((item) => item.value === value)?.label ?? value }
function variabilityLabel(value: ItemAttributeDefinitionConfiguration['variability']) {
  return { BASE_ONLY: '仅公共基线', SCOPE_OVERRIDE: '允许作用域覆盖', LOCAL_ONLY: '必须本地配置' }[value]
}
function contextLabel(value: ItemAttributeDefinitionConfiguration['contextBasis']) {
  return contextOptions.find((item) => item.value === value)?.label ?? value
}
function scopeLabel(value: Scope) { return { TENANT: '租户', ORGANIZATION: '机构', DEPARTMENT: '科室' }[value] }
function widgetLabel(value: string) { return ({ INPUT: '单行输入', TEXTAREA: '多行文本', SWITCH: '开关', SELECT: '下拉单选',
  RADIO: '单选组', DATE: '日期', DATETIME: '日期时间', NUMBER: '数值', DICT_SELECT: '字典下拉',
  MULTI_SELECT: '多选下拉', JSON: '结构化对象' } as Record<string, string>)[value] ?? value }
function suggestedWidget(value: ItemAttributeDefinitionConfiguration) {
  if (value.cardinality === 'MULTIPLE') return 'MULTI_SELECT'
  if (value.dataType === 'BOOLEAN') return 'SWITCH'
  if (value.dataType === 'DICT_REF') return 'DICT_SELECT'
  if (value.dataType === 'ENUM') return 'SELECT'
  if (value.dataType === 'DATE') return 'DATE'
  if (value.dataType === 'DATETIME') return 'DATETIME'
  if (['INTEGER', 'DECIMAL'].includes(value.dataType)) return 'NUMBER'
  if (['TERM_REF', 'OBJECT'].includes(value.dataType)) return 'JSON'
  return 'INPUT'
}
function widgetOptions(value: ItemAttributeDefinitionConfiguration) {
  const suggested = suggestedWidget(value)
  const all = [{ value: suggested, label: widgetLabel(suggested) }]
  if (value.dataType === 'TEXT') all.push({ value: 'TEXTAREA', label: '多行文本' })
  if (value.dataType === 'ENUM') all.push({ value: 'RADIO', label: '单选组' })
  return all
}
function nextOrder(configuration: ItemAttributeConfiguration, itemTypeId: string) {
  const values = configuration.assignments.filter((item) => !itemTypeId || item.itemTypeId === itemTypeId)
  return values.length ? Math.max(...values.map((item) => item.attributeSortOrder)) + 10 : 10
}
