import type {
  ItemAttributeConfiguration,
  ItemAttributeDataType,
  ItemAttributeDefinitionConfiguration,
  ItemAttributeDefinitionInput,
  ItemAttributeJson,
  ItemTypeAttributeInput,
} from '../../../shared/rhnApi'

export type Scope = 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'

export const dataTypeOptions: Array<{ value: ItemAttributeDataType; label: string }> = [
  ['TEXT', '文本'],
  ['BOOLEAN', '布尔'],
  ['INTEGER', '整数'],
  ['DECIMAL', '小数'],
  ['ENUM', '枚举'],
  ['DICT_REF', '字典引用'],
  ['DATE', '日期'],
  ['DATETIME', '日期时间'],
  ['DURATION', '时长'],
  ['TERM_REF', '术语引用'],
  ['OBJECT', '结构化对象'],
].map(([value, label]) => ({ value: value as ItemAttributeDataType, label }))

export const contextOptions: Array<{ value: ItemAttributeDefinitionInput['contextBasis']; label: string }> = [
  ['NONE', '无业务上下文'],
  ['ORDERING', '开立机构 / 科室'],
  ['EXECUTING', '执行机构 / 科室'],
  ['DISPENSING', '发药机构 / 科室'],
  ['STOCKING', '库存机构 / 科室'],
].map(([value, label]) => ({ value: value as ItemAttributeDefinitionInput['contextBasis'], label }))

export function dataTypeLabel(value: ItemAttributeDataType): string {
  return dataTypeOptions.find((item) => item.value === value)?.label ?? value
}

export function variabilityLabel(value: ItemAttributeDefinitionConfiguration['variability']): string {
  return {
    BASE_ONLY: '仅公共基线',
    SCOPE_OVERRIDE: '允许作用域覆盖',
    LOCAL_ONLY: '必须本地配置',
  }[value] ?? value
}

export function variabilityHint(value: ItemAttributeDefinitionConfiguration['variability']): string {
  switch (value) {
    case 'BASE_ONLY':
      return '全租户统一公共基线值，不开放下级覆盖'
    case 'SCOPE_OVERRIDE':
      return '可在租户、机构、科室多级按需覆盖'
    case 'LOCAL_ONLY':
      return '无统一基线，必须在本地机构或科室录入'
    default:
      return ''
  }
}

export function contextLabel(value: ItemAttributeDefinitionConfiguration['contextBasis']): string {
  return contextOptions.find((item) => item.value === value)?.label ?? value
}

export function contextHint(value: ItemAttributeDefinitionConfiguration['contextBasis']): string {
  switch (value) {
    case 'ORDERING':
      return '在门诊/住院开立时动态确定机构/科室'
    case 'EXECUTING':
      return '在医技/检查执行时动态确定机构/科室'
    case 'DISPENSING':
      return '在药房发药时动态确定机构/科室'
    case 'STOCKING':
      return '在库房管药时动态确定机构/科室'
    default:
      return '不依赖特定的业务发生机构科室'
  }
}

export function scopeLabel(value: Scope): string {
  return { TENANT: '租户', ORGANIZATION: '机构', DEPARTMENT: '科室' }[value] ?? value
}

export function widgetLabel(value: string): string {
  const labels: Record<string, string> = {
    TEXT: '单行文本',
    INPUT: '单行输入',
    TEXTAREA: '多行文本',
    SWITCH: '开关',
    SELECT: '下拉单选',
    RADIO: '单选组',
    DATE: '日期选择',
    DATETIME: '日期时间',
    NUMBER: '数值输入',
    DICT_SELECT: '字典下拉',
    MULTI_SELECT: '多选下拉',
    JSON: '结构化对象',
  }
  return labels[value] ?? value
}

export function suggestedWidget(value: ItemAttributeDefinitionConfiguration): string {
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

export function widgetOptions(value: ItemAttributeDefinitionConfiguration): Array<{ value: string; label: string }> {
  const suggested = suggestedWidget(value)
  const all = [{ value: suggested, label: widgetLabel(suggested) }]
  if (value.dataType === 'TEXT') all.push({ value: 'TEXTAREA', label: '多行文本' })
  if (value.dataType === 'ENUM') all.push({ value: 'RADIO', label: '单选组' })
  return all
}

export function buildSchema(
  dataType: ItemAttributeDataType,
  cardinality: 'SINGLE' | 'MULTIPLE',
  nullable: boolean,
  enumRaw: string,
  minimum: string,
  maximum: string,
  maxLength: string,
): Record<string, ItemAttributeJson> {
  const type = jsonType(dataType)
  const scalar: Record<string, ItemAttributeJson> = { type }
  if (dataType === 'ENUM') scalar.enum = splitValues(enumRaw)
  if (minimum) scalar.minimum = Number(minimum)
  if (maximum) scalar.maximum = Number(maximum)
  if (maxLength) scalar.maxLength = Number(maxLength)
  if (cardinality === 'MULTIPLE') {
    return { type: nullable ? ['array', 'null'] : 'array', items: scalar, uniqueItems: true }
  }
  return { ...scalar, type: nullable ? [type, 'null'] : type }
}

export function parseConfiguredValue(
  raw: string,
  dataType: ItemAttributeDataType,
  cardinality: 'SINGLE' | 'MULTIPLE',
): ItemAttributeJson | undefined {
  const normalized = raw.trim()
  if (!normalized) return undefined
  const values = cardinality === 'MULTIPLE' ? splitValues(normalized) : [normalized]
  const convert = (value: string): ItemAttributeJson => {
    if (dataType === 'BOOLEAN') return value === 'true' || value === '是'
    if (dataType === 'INTEGER') return Number.parseInt(value, 10)
    if (dataType === 'DECIMAL') return Number(value)
    if (['TERM_REF', 'OBJECT'].includes(dataType)) {
      try {
        return JSON.parse(value) as ItemAttributeJson
      } catch {
        return value
      }
    }
    return value
  }
  const result = values.map(convert)
  return cardinality === 'MULTIPLE' ? result : result[0]
}

export function splitValues(value: string): string[] {
  return value.split(/[、,，;；\n]/).map((item) => item.trim()).filter(Boolean)
}

export function jsonType(value: ItemAttributeDataType): string {
  if (value === 'BOOLEAN') return 'boolean'
  if (value === 'INTEGER') return 'integer'
  if (value === 'DECIMAL') return 'number'
  if (['TERM_REF', 'OBJECT'].includes(value)) return 'object'
  return 'string'
}

export function schemaNode(schema: Record<string, ItemAttributeJson> | undefined): Record<string, ItemAttributeJson> | undefined {
  return schema?.items && typeof schema.items === 'object' && !Array.isArray(schema.items)
    ? (schema.items as Record<string, ItemAttributeJson>)
    : schema
}

export function schemaNullable(schema?: Record<string, ItemAttributeJson>): boolean {
  return Array.isArray(schema?.type) && schema.type.includes('null')
}

export function schemaEnum(schema?: Record<string, ItemAttributeJson>): string[] {
  const value = schemaNode(schema)?.enum
  return Array.isArray(value) ? value.map(String) : []
}

export function schemaKeyword(schema: Record<string, ItemAttributeJson> | undefined, key: string): string {
  const value = schemaNode(schema)?.[key]
  return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
}

export function rawValue(value: ItemAttributeJson | undefined, cardinality: 'SINGLE' | 'MULTIPLE'): string {
  if (value === undefined || value === null) return ''
  if (cardinality === 'MULTIPLE' && Array.isArray(value)) return value.map(String).join('、')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function stripCode(input: ItemAttributeDefinitionInput): Omit<ItemAttributeDefinitionInput, 'code'> {
  const { code: _code, ...rest } = input
  return rest
}

export function stripAssignmentIds(input: ItemTypeAttributeInput): Omit<ItemTypeAttributeInput, 'itemTypeId' | 'definitionId'> {
  const { itemTypeId: _itemTypeId, definitionId: _definitionId, ...rest } = input
  return rest
}

export function optional(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) || '').trim()
  return value || undefined
}

export function displayJson(value: ItemAttributeJson | undefined): string {
  if (value === undefined) return '未设置'
  if (value === null) return '空值'
  if (typeof value === 'object') return JSON.stringify(value)
  return typeof value === 'boolean' ? (value ? '是' : '否') : String(value)
}

export function nextOrder(configuration: ItemAttributeConfiguration, itemTypeId: string): number {
  const values = configuration.assignments.filter((item) => !itemTypeId || item.itemTypeId === itemTypeId)
  return values.length ? Math.max(...values.map((item) => item.attributeSortOrder)) + 10 : 10
}

export interface AttributeOption {
  value: string
  label: string
}

export function extractDefinitionOptions(
  definition?: ItemAttributeDefinitionConfiguration
): AttributeOption[] {
  if (!definition) return []
  const schema = schemaNode(definition.schema)
  const enumeration = Array.isArray(schema?.enum) ? schema.enum : []
  const enumLabels =
    schema?.['x-enumLabels'] &&
    typeof schema['x-enumLabels'] === 'object' &&
    !Array.isArray(schema['x-enumLabels'])
      ? (schema['x-enumLabels'] as Record<string, string>)
      : {}

  if (enumeration.length > 0) {
    return enumeration.map((code) => {
      const strCode = String(code)
      return {
        value: strCode,
        label: enumLabels[strCode] || strCode,
      }
    })
  }

  if (definition.dataType === 'BOOLEAN') {
    return [
      { value: 'true', label: '是' },
      { value: 'false', label: '否' },
    ]
  }

  return []
}

