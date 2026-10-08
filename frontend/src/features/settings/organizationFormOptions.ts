import { z } from 'zod'
import { ORGANIZATION_DICTIONARY as dictionaries, ORGANIZATION_SYSTEM_ENUM as enums,
  type DictionaryValue, type OrganizationUnitInput, type SystemEnumDefinition } from '../../shared/rhnApi'
const text = z.string().refine(value => value.trim().length > 0)
const item = z.object({ code: text, name: text, description: z.string(), sortOrder: z.number().int() }).passthrough()
const definition = z.object({ code: text, name: text, description: z.string(), items: z.array(item) }).passthrough()
export function requireOrganizationEnums(source: unknown): SystemEnumDefinition[] {
  const parsed = z.array(definition).safeParse(source)
  if (!parsed.success || new Set(parsed.data.map(value => value.code)).size !== parsed.data.length
    || parsed.data.some(value => new Set(value.items.map(item => item.code)).size !== value.items.length)) {
    throw new Error('组织人员系统枚举返回不完整或编码重复，请重新加载核实')
  }
  return parsed.data
}
export function enumAvailable(source: SystemEnumDefinition[] | undefined, code: string) {
  return Boolean(source?.find(value => value.code === code)?.items.length)
}
export function requireEnumChoice(source: SystemEnumDefinition[] | undefined, code: string, choice: string) {
  if (!source?.find(value => value.code === code)?.items.some(value => value.code === choice)) {
    throw new Error('表单类型选项尚未确认或所选代码已失效，请重新加载并选择')
  }
}
export function unitOptionsAvailable(kind: OrganizationUnitInput['sdOrgKind'], source: SystemEnumDefinition[] | undefined,
  values: Map<string, DictionaryValue[]>) {
  return enumAvailable(source, enums.kind) && (kind === 'LEGAL_ORGANIZATION'
    ? enumAvailable(source, enums.type) && values.has(dictionaries.property)
    : Boolean(values.get(dictionaries.departmentType)?.length && values.get(dictionaries.departmentProperty)?.length))
}
export function requireUnitOptions(input: OrganizationUnitInput, source: SystemEnumDefinition[] | undefined, values: Map<string, DictionaryValue[]>) {
  if (!unitOptionsAvailable(input.sdOrgKind, source, values)) throw new Error('组织表单选项尚未确认，请重新加载')
  requireEnumChoice(source, enums.kind, input.sdOrgKind)
  const has = (code: string, choice: string | undefined) => Boolean(values.get(code)?.some(value => value.code === choice))
  if (input.sdOrgKind === 'LEGAL_ORGANIZATION') {
    requireEnumChoice(source, enums.type, input.sdOrgType)
    if (input.sdOrgProperty && !has(dictionaries.property, input.sdOrgProperty)) throw new Error('所选机构性质已失效，请重新选择')
  } else if (!has(dictionaries.departmentType, input.sdDepartmentType) || !has(dictionaries.departmentProperty, input.sdDepartmentProperty)) {
    throw new Error('所选科室类型或业务属性已失效，请重新选择')
  }
}
