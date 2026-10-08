import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ItemAttributeJson, ItemAttributeSchema, ItemAttributeMaintenance } from '../../shared/api/masterDataApi'
import type { RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Select } from '../../shared/ui'

export async function loadAttributeMaintenance(api: RhnApi, subjectType: 'MEDICATION' | 'CATALOG_ITEM' | 'SERVICE_VARIANT', targetId: string, date: string) {
  const result = await api.masterData.itemAttributeMaintenance(subjectType, targetId, date)
  assertAttributeMaintenance(result)
  return result
}

export function assertAttributeMaintenance(result: unknown): asserts result is ItemAttributeMaintenance {
  const value = result as ItemAttributeMaintenance | null
  if (!value || !Array.isArray(value.schema?.attributes) || !Array.isArray(value.baseValues) || !Array.isArray(value.overrides)) {
    throw new Error('扩展属性资料返回不完整')
  }
}

export function parseAttributeRaw(value: string, attribute: ItemAttributeSchema): ItemAttributeJson {
  const normalized = value.trim()
  if (!normalized) throw new Error('属性值不能为空')
  let parsed: ItemAttributeJson
  if (attribute.cardinality === 'MULTIPLE' || ['OBJECT', 'TERM_REF'].includes(attribute.dataType)) {
    try { parsed = JSON.parse(normalized) as ItemAttributeJson }
    catch { throw new Error('属性值必须是合法 JSON') }
  } else if (attribute.dataType === 'BOOLEAN') {
    if (!['true', 'false'].includes(normalized)) throw new Error('布尔属性必须为 true 或 false')
    parsed = normalized === 'true'
  } else if (['INTEGER', 'DECIMAL'].includes(attribute.dataType)) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
      throw new Error('数值属性必须使用十进制数字')
    }
    parsed = Number(normalized)
  } else parsed = normalized

  const validScalar = (item: ItemAttributeJson): boolean => {
    switch (attribute.dataType) {
      case 'BOOLEAN': return typeof item === 'boolean'
      case 'INTEGER': return typeof item === 'number' && Number.isSafeInteger(item)
      case 'DECIMAL': return typeof item === 'number' && Number.isFinite(item)
      case 'OBJECT': case 'TERM_REF': return item !== null && typeof item === 'object' && !Array.isArray(item)
      default: return typeof item === 'string'
    }
  }
  if (attribute.cardinality === 'MULTIPLE') {
    if (!Array.isArray(parsed)) throw new Error('多值属性必须是 JSON 数组')
    if (!parsed.every(validScalar)) throw new Error(`多值属性中的值必须符合 ${attribute.dataType} 类型`)
  } else if (!validScalar(parsed)) throw new Error(`属性值必须符合 ${attribute.dataType} 类型`)
  return parsed
}

export function ItemAttributeValueEditor({ api, attribute, value, onChange, placeholder, actions, disabled = false, required = false }: {
  api?: RhnApi; attribute: ItemAttributeSchema; value: string; onChange: (value: string) => void
  placeholder?: string; actions?: (editable: boolean) => ReactNode; disabled?: boolean; required?: boolean
}) {
  const dictionaryRequired = attribute.dataType === 'DICT_REF'
  const dictionary = useQuery({
    queryKey: ['master-data-attribute-dictionary', attribute.dictionaryId],
    enabled: Boolean(api && dictionaryRequired && attribute.dictionaryId),
    retry: false, staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await api!.dictionaries.get(attribute.dictionaryId!)
      if (!result || !Array.isArray(result.items)) throw new Error('字典返回不完整')
      return result
    },
  })
  const itemSchema = attribute.cardinality === 'MULTIPLE' && attribute.schema.items
    && typeof attribute.schema.items === 'object' && !Array.isArray(attribute.schema.items)
    ? attribute.schema.items as Record<string, ItemAttributeJson> : attribute.schema
  const enumeration = Array.isArray(itemSchema.enum) ? itemSchema.enum : undefined
  const options = dictionaryRequired ? (dictionary.data?.items ?? [])
    .filter((item) => item.sdDictItemStatus === 'ACTIVE')
    .map((item) => ({ value: item.code, label: item.name }))
    : (enumeration ?? []).map((item) => ({ value: String(item), label: String(item) }))
  let parsed: ItemAttributeJson | undefined
  let formatError = ''
  if (value.trim()) {
    try { parsed = parseAttributeRaw(value, attribute) }
    catch (error) { formatError = (error as Error).message }
  }
  const multiple = attribute.cardinality === 'MULTIPLE'
  const selectedValues = Array.isArray(parsed) ? parsed.map(String) : []
  const selectable = dictionaryRequired || enumeration !== undefined
  const storedValues = multiple ? selectedValues : value ? [value] : []
  const unknownValues = selectable ? storedValues.filter((item) => !options.some((option) => option.value === item)) : []
  const dictionaryUnavailable = dictionaryRequired && (!api || !attribute.dictionaryId || !dictionary.isSuccess || !options.length)
  const selectableOptions = [...options, ...unknownValues.map((item) => ({ value: item, label: `${item}（未匹配可选项）` }))]
  const editable = !disabled && !dictionaryUnavailable && !formatError && !unknownValues.length
  const label = attribute.name
  return <div className="master-data-attribute-editor">
    {dictionaryRequired && (!api || !attribute.dictionaryId) ? <Alert tone="warning">未配置属性字典，无法核验选项</Alert>
      : dictionaryRequired && dictionary.isError ? <Alert tone="warning">属性字典加载失败，原值已保留
        <Button size="sm" variant="secondary" onClick={() => void dictionary.refetch()}>重试属性字典</Button>
      </Alert> : dictionaryRequired && dictionary.isPending ? <span role="status">正在加载属性字典…</span>
        : dictionaryRequired && !options.length ? <Alert tone="warning">字典没有可用选项，原值已保留</Alert> : null}
    {formatError && <Alert tone="warning">{formatError}，请核对原值后修正</Alert>}
    {!dictionaryUnavailable && unknownValues.length > 0 && <Alert tone="warning">存在未匹配可选项的原值，请核对后修正</Alert>}
    {dictionaryUnavailable || formatError ? <textarea required={required} aria-label={label} value={value} rows={3}
      readOnly={dictionaryUnavailable} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      : selectable && multiple ? <Select clearable={!required} aria-label={label} multiple value={selectedValues} options={selectableOptions}
        placeholder={placeholder || '请选择'} disabled={disabled}
        onChange={(values) => onChange(JSON.stringify(values.map((item) => parseAttributeRaw(item, { ...attribute, cardinality: 'SINGLE' }))))} />
        : selectable ? <Select clearable={!required} aria-label={label} value={value} options={selectableOptions} onChange={onChange}
          placeholder={placeholder || '请选择'} disabled={disabled} />
          : multiple || ['OBJECT', 'TERM_REF'].includes(attribute.dataType) ? <textarea required={required} aria-label={label} value={value} rows={3}
            placeholder={placeholder || '请输入合法 JSON'} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
            : attribute.dataType === 'BOOLEAN' ? <Select clearable={!required} aria-label={label} value={value} onChange={onChange}
              options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} placeholder={placeholder || '请选择'} disabled={disabled} />
              : <input required={required} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}
                type={attribute.dataType === 'DATE' ? 'date' : ['INTEGER', 'DECIMAL'].includes(attribute.dataType) ? 'number' : 'text'}
                step={attribute.dataType === 'INTEGER' ? '1' : 'any'} placeholder={placeholder || '请输入属性值'} />}
    {actions && <div className="master-data-attribute-actions">{actions(editable)}</div>}
  </div>
}
