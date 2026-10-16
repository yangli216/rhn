import { ParameterJsonNumber, compareParameterNumbers, isParameterJsonNumber, isParameterNumberText, parseParameterJson, stringifyParameterJson } from './parameterJson'

/**
 * 结构化 JSON 参数：参数定义的 JSON Schema 用 properties 声明一层字段，
 * 维护界面据此生成表单，变更记录据此按字段展示前后差异。服务端按同一份定义逐字段校验。
 */
export type ParameterFieldType = 'boolean' | 'integer' | 'number' | 'string'

export interface ParameterField {
  name: string
  type: ParameterFieldType
  title: string
  description?: string
  required: boolean
  options?: { value: string; label: string }[]
  minimum?: ParameterJsonNumber
  maximum?: ParameterJsonNumber
  minLength?: number
  maxLength?: number
  pattern?: string
  defaultValue?: unknown
  visibleWhen?: Record<string, unknown>
}

/** 每个字段的编辑文本；extra 保留定义之外的原有属性，保存时原样带回。 */
export interface ParameterFieldDraft {
  values: Record<string, string>
  extra: Record<string, unknown>
}

const FIELD_TYPES = new Set<string>(['boolean', 'integer', 'number', 'string'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !isParameterJsonNumber(value)
}

export function readParameterFields(schemaJson: string | undefined | null): ParameterField[] | undefined {
  if (!schemaJson?.trim()) return undefined
  let schema: unknown
  try { schema = parseParameterJson(schemaJson) } catch { return undefined }
  if (!isRecord(schema) || schema.type !== 'object' || !isRecord(schema.properties)) return undefined
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [])
  const fields: ParameterField[] = []
  for (const [name, raw] of Object.entries(schema.properties)) {
    if (!isRecord(raw) || typeof raw.type !== 'string' || !FIELD_TYPES.has(raw.type)) return undefined
    const labels = isRecord(raw['x-enumLabels']) ? raw['x-enumLabels'] : {}
    fields.push({
      name,
      type: raw.type as ParameterFieldType,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : name,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      required: required.has(name),
      options: Array.isArray(raw.enum) ? raw.enum.map((option) => {
        const value = scalarText(option)
        return { value, label: typeof labels[value] === 'string' ? labels[value] as string : value }
      }) : undefined,
      minimum: isParameterJsonNumber(raw.minimum) ? raw.minimum : undefined,
      maximum: isParameterJsonNumber(raw.maximum) ? raw.maximum : undefined,
      minLength: isParameterJsonNumber(raw.minLength) ? Number(raw.minLength.text) : undefined,
      maxLength: isParameterJsonNumber(raw.maxLength) ? Number(raw.maxLength.text) : undefined,
      pattern: typeof raw.pattern === 'string' ? raw.pattern : undefined,
      defaultValue: raw.default,
      visibleWhen: isRecord(raw['x-visibleWhen']) ? raw['x-visibleWhen'] : undefined,
    })
  }
  return fields.length ? fields : undefined
}

function scalarText(value: unknown) {
  if (isParameterJsonNumber(value)) return value.text
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return typeof value === 'string' ? value : ''
}

/** 将当前值（或默认值）拆成字段文本；值不是对象时返回 undefined，由调用方退回原始 JSON 编辑。 */
export function readParameterFieldDraft(fields: ParameterField[], valueJson?: string | null): ParameterFieldDraft | undefined {
  let source: Record<string, unknown> = {}
  if (valueJson?.trim()) {
    let parsed: unknown
    try { parsed = parseParameterJson(valueJson) } catch { return undefined }
    if (!isRecord(parsed)) return undefined
    source = parsed
  }
  const names = new Set(fields.map((field) => field.name))
  const values = Object.fromEntries(fields.map((field) => [field.name,
    scalarText(Object.hasOwn(source, field.name) ? source[field.name] : field.defaultValue)]))
  const extra = Object.fromEntries(Object.entries(source).filter(([key]) => !names.has(key)))
  return { values, extra }
}

export function parameterFieldVisible(field: ParameterField, values: Record<string, string>) {
  if (!field.visibleWhen) return true
  return Object.entries(field.visibleWhen).every(([name, expected]) => values[name] === scalarText(expected))
}

export function parameterFieldErrors(fields: ParameterField[], values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const text = values[field.name] ?? ''
    if (!text.trim()) {
      if (field.required) errors[field.name] = field.type === 'boolean' || field.options ? '请选择' : '请填写'
      continue
    }
    if (field.type === 'boolean' && text !== 'true' && text !== 'false') errors[field.name] = '请选择是或否'
    else if (field.type === 'integer' && !/^-?(?:0|[1-9]\d*)$/.test(text.trim())) errors[field.name] = '请输入整数'
    else if (field.type === 'number' && !isParameterNumberText(text)) errors[field.name] = '请输入有效数值'
    else if (field.options && !field.options.some((option) => option.value === text)) errors[field.name] = '请选择列表中的选项'
    else if (field.type === 'integer' || field.type === 'number') {
      const number = new ParameterJsonNumber(text)
      if (field.minimum && compareParameterNumbers(number, field.minimum) < 0) errors[field.name] = `不能小于 ${field.minimum.text}`
      else if (field.maximum && compareParameterNumbers(number, field.maximum) > 0) errors[field.name] = `不能大于 ${field.maximum.text}`
    } else if (field.type === 'string') {
      if (field.minLength !== undefined && text.length < field.minLength) errors[field.name] = `至少 ${field.minLength} 个字符`
      else if (field.maxLength !== undefined && text.length > field.maxLength) errors[field.name] = `最多 ${field.maxLength} 个字符`
      else if (field.pattern) {
        try { if (!new RegExp(`^(?:${field.pattern})$`).test(text)) errors[field.name] = '格式不符合要求' } catch { /* 服务端负责校验 Java 正则 */ }
      }
    }
  }
  return errors
}

export function writeParameterFieldDraft(fields: ParameterField[], draft: ParameterFieldDraft): string {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const text = draft.values[field.name] ?? ''
    if (!text.trim() && !field.required) continue
    result[field.name] = field.type === 'boolean' ? text === 'true'
      : field.type === 'string' ? text : new ParameterJsonNumber(text)
  }
  return stringifyParameterJson({ ...result, ...draft.extra })
}

function fieldValueText(field: ParameterField, value: unknown) {
  if (value === undefined) return '未设置'
  const text = scalarText(value)
  const option = field.options?.find((item) => item.value === text)
  if (option) return option.label
  if (field.type === 'boolean') return value === true ? '是' : value === false ? '否' : text
  return text || '空'
}

function readObject(valueJson: unknown): Record<string, unknown> | undefined {
  if (typeof valueJson !== 'string' || !valueJson.trim()) return undefined
  try {
    const parsed = parseParameterJson(valueJson)
    return isRecord(parsed) ? parsed : undefined
  } catch { return undefined }
}

/** 列表摘要：只列出当前可见字段，例如“门诊就诊必测血压：是；必测起始年龄（周岁）：18”。 */
export function describeParameterFieldValue(fields: ParameterField[], valueJson: string | undefined | null) {
  const value = readObject(valueJson)
  if (!value) return undefined
  const texts = Object.fromEntries(fields.map((field) => [field.name, scalarText(value[field.name])]))
  return fields.filter((field) => parameterFieldVisible(field, texts))
    .map((field) => `${field.title}：${fieldValueText(field, value[field.name])}`).join('；')
}

/** 变更记录：按字段列出前后不同的项；任一快照无法按字段解读时返回 undefined。 */
export function diffParameterFieldValues(fields: ParameterField[], beforeJson: unknown, afterJson: unknown) {
  const before = beforeJson == null ? {} : readObject(beforeJson)
  const after = afterJson == null ? {} : readObject(afterJson)
  if (!before || !after) return undefined
  return fields.filter((field) => stringifyOptional(before[field.name]) !== stringifyOptional(after[field.name]))
    .map((field) => ({ name: field.name, title: field.title,
      before: fieldValueText(field, before[field.name]), after: fieldValueText(field, after[field.name]) }))
}

function stringifyOptional(value: unknown) { return value === undefined ? undefined : stringifyParameterJson(value) }
