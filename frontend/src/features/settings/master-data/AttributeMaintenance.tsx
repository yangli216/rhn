import { DataTable as UiDataTable } from '../../../shared/ui'
import { ItemAttributeValueEditor, parseAttributeRaw, loadAttributeMaintenance } from "../ItemAttributeValueEditor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Organization } from "../../../shared/model";
import { errorMessage, type Department, type RhnApi, type ItemAttributeJson, type ItemAttributeOverride, type ItemAttributeSchema, type ItemAttributeSubjectType, type ItemAttributeValue, type ItemAttributeMaintenance } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, Select, StatusBadge } from "../../../shared/ui";
import { today, attributeDataTypeLabel, FormSection, FormGrid } from './masterDataShared'

export function AttributeManagementDialog({ api, organization, subjectType, targetId, itemName, onClose }: {
  api: RhnApi; organization: Organization; subjectType: ItemAttributeSubjectType
  targetId: string; itemName: string; onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('基础数据扩展属性维护')
  const [pendingKey, setPendingKey] = useState('')
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [scopeType, setScopeType] = useState<'ORGANIZATION' | 'DEPARTMENT'>('ORGANIZATION')
  const [departmentId, setDepartmentId] = useState('')
  const queryKey = ['master-data-item-attributes', subjectType, targetId, today()]
  const maintenance = useQuery({
    queryKey,
    queryFn: () => loadAttributeMaintenance(api, subjectType, targetId, today()),
  })
  const departments = useQuery({
    queryKey: ['master-data-attribute-departments', organization.id],
    queryFn: () => api.organization.departments(organization.id),
  })
  useEffect(() => {
    if (scopeType === 'DEPARTMENT' && !departmentId) setDepartmentId(departments.data?.[0]?.id ?? '')
  }, [departmentId, departments.data, scopeType])
  const refresh = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey })
    setFeedback(message); setOperationError('')
  }
  const execute = async (key: string, action: () => Promise<unknown>, message: string) => {
    if (!reason.trim()) { setOperationError('请填写变更原因'); return }
    setPendingKey(key); setOperationError(''); setFeedback('')
    try { await action(); await refresh(message) } catch (error) { setOperationError(errorMessage(error)) }
    finally { setPendingKey('') }
  }

  const values = maintenance.data
  const selectedDepartment = departments.data?.find((value) => value.id === departmentId)
  const scopeName = scopeType === 'ORGANIZATION' ? organization.shortName || organization.name
    : selectedDepartment?.name || '所选科室'
  return <Dialog title={`${itemName} · 扩展属性`} eyebrow="基础数据扩展能力" size="xwide" onClose={onClose}
    description={`横向维护租户公共值与“${scopeName}”覆盖值；未维护覆盖时自动继承上一级。`}>
    <div className="master-data-attribute-dialog">
      <div className="master-data-attribute-toolbar">
        <FormField label="本次变更原因" required hint="保存到属性变更日志，便于审计和回溯">
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000}
            placeholder="说明本次配置的业务依据" />
        </FormField>
        <div className="master-data-attribute-scope">
          <Select value={scopeType} onChange={(value) => setScopeType(value as 'ORGANIZATION' | 'DEPARTMENT')}
            options={[{ value: 'ORGANIZATION', label: '当前机构' }, { value: 'DEPARTMENT', label: '指定科室' }]} />
          {scopeType === 'DEPARTMENT' && <Select value={departmentId} onChange={setDepartmentId}
            placeholder="选择科室" options={(departments.data ?? []).map((value: Department) => ({
              value: value.id, label: value.name, secondaryText: value.code,
            }))} />}
        </div>
        <div className="master-data-attribute-legend">
          <StatusBadge>租户公共值</StatusBadge><span>可被机构或科室覆盖</span>
          <StatusBadge tone="success">{scopeType === 'ORGANIZATION' ? '当前机构' : '当前科室'}</StatusBadge><span>
            {scopeType === 'ORGANIZATION' ? organization.code : selectedDepartment?.code || '请选择'}</span>
        </div>
      </div>
      {feedback && <Alert tone="success">{feedback}</Alert>}
      {(operationError || maintenance.error) && <Alert>{operationError || errorMessage(maintenance.error)}</Alert>}
      {maintenance.isPending && <LoadingState label="正在加载扩展属性 Schema 与当前值…" />}
      {values && !values.schema.attributes.length && <EmptyState icon="settings" title="当前类型未装配扩展属性"
        copy="可先在项目类型属性配置中完成装配；稳定核心字段仍在基础信息区域维护。" />}
      {values && values.schema.attributes.length > 0 && <div className="master-data-attribute-table-wrap">
        <UiDataTable className="master-data-attribute-table"><thead><tr>
          <th>属性定义</th><th>租户公共值</th><th>{scopeName}覆盖值</th>
        </tr></thead><tbody>{values.schema.attributes.map((attribute) => {
          const baseValue = values.baseValues.find((item) => item.definitionId === attribute.definitionId)
          const overrideValue = values.overrides.find((item) => item.definitionId === attribute.definitionId
            && item.scopeType === scopeType && item.organizationId === organization.id
            && (scopeType === 'ORGANIZATION' || item.departmentId === departmentId))
          return <AttributeEditorRow key={`${attribute.definitionId}-${baseValue?.revision ?? 'new'}-${overrideValue?.revision ?? 'new'}`}
            attribute={attribute} baseValue={baseValue} overrideValue={overrideValue}
            organization={organization} scopeType={scopeType} departmentId={departmentId || undefined}
            reason={reason} pendingKey={pendingKey} execute={execute}
            subjectType={subjectType} targetId={targetId} api={api} />
        })}</tbody></UiDataTable>
      </div>}
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </div>
  </Dialog>
}

export function AttributeEditorRow({ api, organization, scopeType, departmentId, subjectType, targetId, attribute, baseValue, overrideValue,
  reason, pendingKey, execute }: {
  api: RhnApi; organization: Organization; subjectType: ItemAttributeSubjectType; targetId: string
  scopeType: 'ORGANIZATION' | 'DEPARTMENT'; departmentId?: string
  attribute: ItemAttributeSchema; baseValue?: ItemAttributeValue; overrideValue?: ItemAttributeOverride
  reason: string; pendingKey: string
  execute: (key: string, action: () => Promise<unknown>, message: string) => Promise<void>
}) {
  const [baseRaw, setBaseRaw] = useState(attributeRaw(baseValue ? baseValue.value : attribute.defaultValue, attribute))
  const [overrideRaw, setOverrideRaw] = useState(attributeRaw(overrideValue?.value, attribute))
  const [overrideMode, setOverrideMode] = useState<'OVERRIDE' | 'EXPLICIT_NULL'>(overrideValue?.valueMode ?? 'OVERRIDE')
  const baseKey = `base-${attribute.definitionId}`
  const overrideKey = `override-${attribute.definitionId}`
  const projected = attribute.storageMode === 'PROJECTED'
  const baseAllowed = !projected && attribute.variability !== 'LOCAL_ONLY'
  const overrideAllowed = !projected && attribute.variability !== 'BASE_ONLY'
    && attribute.allowedScopes.includes(scopeType)
    && (attribute.variability === 'LOCAL_ONLY' || attribute.overridePolicy === 'ANY')
    && (scopeType !== 'DEPARTMENT' || Boolean(departmentId))
  const explicitNullAllowed = !attribute.required && attributeSchemaAllowsNull(attribute)

  const saveBase = () => execute(baseKey, () => api.masterData.saveItemAttributeValue({
    subjectType, targetId, definitionId: attribute.definitionId, valueId: baseValue?.id,
    expectedRevision: baseValue?.revision, value: parseAttributeRaw(baseRaw, attribute),
    validFrom: baseValue?.validFrom ?? today(), validTo: baseValue?.validTo,
    reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}的租户公共值已保存`)
  const saveOverride = () => execute(overrideKey, () => api.masterData.saveItemAttributeOverride({
    subjectType, targetId, definitionId: attribute.definitionId, overrideId: overrideValue?.id,
    expectedRevision: overrideValue?.revision, scopeType, organizationId: organization.id,
    departmentId: scopeType === 'DEPARTMENT' ? departmentId : undefined,
    valueMode: overrideMode, value: overrideMode === 'EXPLICIT_NULL' ? undefined : parseAttributeRaw(overrideRaw, attribute),
    validFrom: overrideValue?.validFrom ?? today(), validTo: overrideValue?.validTo,
    reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}的机构覆盖值已保存`)
  const disableBase = () => baseValue && execute(baseKey, () => api.masterData.disableItemAttributeValue({
    subjectType, targetId, definitionId: attribute.definitionId, recordId: baseValue.id,
    expectedRevision: baseValue.revision, reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}的租户公共值已停用`)
  const disableOverride = () => overrideValue && execute(overrideKey, () => api.masterData.disableItemAttributeOverride({
    subjectType, targetId, definitionId: attribute.definitionId, recordId: overrideValue.id,
    expectedRevision: overrideValue.revision, reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}已恢复继承租户公共值`)

  return <tr><td className="master-data-attribute-definition"><strong>{attribute.name}{attribute.required && ' *'}</strong>
    <code>{attribute.code}</code><small>{attribute.description || '未维护属性说明'}</small>
    <div><StatusBadge>{attributeDataTypeLabel(attribute.dataType)}{attribute.cardinality === 'MULTIPLE' ? ' · 多值' : ''}</StatusBadge>
      {projected && <StatusBadge tone="warning">强类型投影</StatusBadge>}
      {attribute.unitCode && <span className="master-data-attribute-unit">单位：{attribute.unitCode}</span>}</div></td>
    <td>{projected ? <AttributeReadOnlyHint text="请在左侧强类型基础信息中维护" />
      : baseAllowed ? <ItemAttributeValueEditor api={api} attribute={attribute} value={baseRaw} onChange={setBaseRaw}
        actions={(editable) => <><Button size="sm" disabled={pendingKey === baseKey || !baseRaw || !editable} onClick={saveBase}>
          {pendingKey === baseKey ? '保存中…' : '保存基线'}</Button>
          {baseValue && <Button size="sm" variant="text" disabled={pendingKey === baseKey} onClick={disableBase}>停用</Button>}</>} />
        : <AttributeReadOnlyHint text="该属性仅允许维护作用域值" />}</td>
    <td>{projected ? <AttributeReadOnlyHint text="强类型安全字段不允许覆盖" />
      : overrideAllowed ? <ItemAttributeValueEditor api={api} attribute={attribute} value={overrideRaw} onChange={setOverrideRaw}
        disabled={overrideMode === 'EXPLICIT_NULL'}
        placeholder={baseValue ? `继承：${displayAttributeValue(baseValue.value)}` : '未覆盖时使用类型默认值'}
        actions={(editable) => <>{explicitNullAllowed && <Select value={overrideMode} onChange={(value) => setOverrideMode(value as 'OVERRIDE' | 'EXPLICIT_NULL')}
          options={[{ value: 'OVERRIDE', label: '设置覆盖值' }, { value: 'EXPLICIT_NULL', label: '明确清空' }]} />}
          <Button size="sm" disabled={pendingKey === overrideKey || (overrideMode === 'OVERRIDE' && (!overrideRaw || !editable))} onClick={saveOverride}>
          {pendingKey === overrideKey ? '保存中…' : '保存覆盖'}</Button>
          {overrideValue && <Button size="sm" variant="text" disabled={pendingKey === overrideKey}
            onClick={disableOverride}>恢复继承</Button>}</>} />
        : <AttributeReadOnlyHint text={attribute.overridePolicy === 'RESTRICTIVE_ONLY'
          ? '需先配置受控限制比较规则' : '该属性不允许机构覆盖'} />}</td></tr>
}

export function attributeSchemaAllowsNull(attribute: ItemAttributeSchema) {
  const type = attribute.schema.type
  return attribute.schema.nullable === true || (Array.isArray(type) && type.includes('null'))
}

export function AttributeReadOnlyHint({ text }: { text: string }) {
  return <div className="master-data-attribute-readonly"><Icon name="info" /><span>{text}</span></div>
}

export function attributeRaw(value: ItemAttributeJson | undefined, attribute: ItemAttributeSchema) {
  if (value === undefined || value === null) return ''
  if (attribute.cardinality === 'MULTIPLE' || typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function effectiveAttributeRaw(attribute: ItemAttributeSchema, base?: ItemAttributeValue, override?: ItemAttributeOverride) {
  return attributeRaw(override ? (override.valueMode === 'EXPLICIT_NULL' ? null : override.value)
    : base ? base.value : attribute.defaultValue, attribute)
}

export function validateAttributeChanges(maintenance: ItemAttributeMaintenance | undefined, values: Record<string, string>) {
  if (!maintenance) throw new Error('扩展属性尚未加载成功，请重试后保存')
  for (const attribute of maintenance.schema.attributes) {
    if (values[attribute.definitionId] !== undefined) parseAttributeRaw(values[attribute.definitionId], attribute)
  }
}

export function displayAttributeValue(value: ItemAttributeJson) {
  if (value === null) return '空值'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

export function DynamicAttributeField({
  api,
  attribute,
  value,
  onChange,
  explicitNull,
}: {
  api?: RhnApi
  attribute: ItemAttributeSchema
  value: string
  onChange: (val: string) => void
  explicitNull?: boolean
}) {
  const label = `${attribute.name}${attribute.unitCode ? ` (${attribute.unitCode})` : ''}`
  return <FormField label={label} required={attribute.required} hint={attribute.description}>
    <ItemAttributeValueEditor api={api} attribute={attribute} value={value} onChange={onChange} required={attribute.required}
      placeholder={explicitNull ? '机构已明确清空' : undefined} />
  </FormField>
}

export function DynamicItemAttributesSection({
  api,
  maintenance,
  organization,
  values,
  onChange,
  isLoading,
  hasError,
  onRetry,
}: {
  api?: RhnApi
  maintenance?: ItemAttributeMaintenance
  organization?: Organization
  values: Record<string, string>
  onChange: (definitionId: string, val: string) => void
  isLoading?: boolean
  hasError?: boolean
  onRetry?: () => void
}) {
  if (hasError) return <FormSection title="扩展属性" description="请加载成功后核对属性配置。"><Alert tone="warning">扩展属性加载失败，尚未核验
    <Button size="sm" variant="secondary" onClick={onRetry}>重试扩展属性</Button>
  </Alert></FormSection>
  if (isLoading) {
    return (
      <FormSection title="扩展属性" description="正在加载当前项目类型装配的扩展属性…">
        <LoadingState label="正在加载扩展属性…" />
      </FormSection>
    )
  }

  if (!maintenance) return <FormSection title="扩展属性" description="请加载成功后核对属性配置。"><Alert tone="warning">扩展属性尚未加载，不能判断是否已装配</Alert></FormSection>

  const attributes = (maintenance?.schema?.attributes ?? []).filter((item) => item.storageMode !== 'PROJECTED')

  if (!attributes.length) {
    return (
      <FormSection title="扩展属性" description="当前项目类型装配的长尾自定义扩展属性。">
        <p className="master-data-attribute-empty-hint">
          当前项目类型未装配自定义扩展属性。
        </p>
      </FormSection>
    )
  }

  return (
    <FormSection title="扩展属性" description="当前项目类型装配的扩展属性，可直接在主档中维护业务值。">
      <FormGrid columns={3}>
        {attributes.map((attr) => {
          const base = maintenance?.baseValues.find((b) => b.definitionId === attr.definitionId)
          const override = maintenance?.overrides.find((o) => o.definitionId === attr.definitionId && o.scopeType === 'ORGANIZATION' && o.organizationId === organization?.id)
          const initialVal = effectiveAttributeRaw(attr, base, override)
          const currentVal = values[attr.definitionId] ?? initialVal
          return (
            <DynamicAttributeField
              key={attr.definitionId}
              api={api}
              attribute={attr}
              value={currentVal}
              explicitNull={override?.valueMode === 'EXPLICIT_NULL'}
              onChange={(val) => onChange(attr.definitionId, val)}
            />
          )
        })}
      </FormGrid>
    </FormSection>
  )
}
