import type { ParameterCategory, ParameterCategoryInput, ParameterCategoryOrder, ParameterCategoryUpdate } from '../../shared/api/configurationApi'

const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const optionalText = (value: unknown) => value == null || typeof value === 'string'
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const fail = (reason: string): never => { throw new Error(`参数分类未确认：${reason}，请重新加载并核实`) }
const stored = (value: string | null | undefined) => value?.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '') || null

function requireCategory(source: unknown): ParameterCategory {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fail('分类资料缺失')
  const value = source as Record<string, unknown>
  if (!text(value.id) || !text(value.code) || !text(value.name) || !integer(value.revision) || !integer(value.sortOrder)
    || value.sdParamStatus !== 'ACTIVE' && value.sdParamStatus !== 'INACTIVE'
    || value.parentId != null && !text(value.parentId) || !optionalText(value.description)) return fail('分类标识、名称、排序、修订或状态不完整')
  return source as ParameterCategory
}

export function requireParameterCategories(source: unknown): ParameterCategory[] {
  if (!Array.isArray(source)) return fail('分类列表不完整')
  const categories = source.map(requireCategory)
  const byId = new Map<string, ParameterCategory>(), codes = new Set<string>()
  for (const category of categories) {
    if (byId.has(category.id) || codes.has(category.code)) fail('分类标识或编码重复')
    byId.set(category.id, category); codes.add(category.code)
  }
  const verified = new Set<string>()
  for (const category of categories) {
    const path = new Set<string>()
    let current: ParameterCategory | undefined = category
    while (current && !verified.has(current.id)) {
      if (path.has(current.id)) fail('分类层级形成循环')
      path.add(current.id)
      if (current.parentId != null && !byId.has(current.parentId)) fail('父分类未返回')
      current = current.parentId == null ? undefined : byId.get(current.parentId)
    }
    path.forEach(id => verified.add(id))
  }
  return source as ParameterCategory[]
}

export function requireCreatedCategory(source: unknown, input: ParameterCategoryInput, before: ParameterCategory[]): ParameterCategory {
  const next = requireCategory(source)
  if (before.some(value => value.id === next.id || value.code === next.code)) return fail('创建结果指向已有分类')
  if (next.code !== stored(input.code)?.toUpperCase() || next.name !== stored(input.name)
    || (next.parentId ?? null) !== (input.parentId ?? null) || (next.description ?? null) !== stored(input.description)
    || next.sortOrder !== input.sortOrder || next.sdParamStatus !== 'ACTIVE') return fail('创建结果与提交不符')
  requireParameterCategories([...before, next])
  return next
}

export function requireUpdatedCategory(source: unknown, before: ParameterCategory, input: ParameterCategoryUpdate): ParameterCategory {
  const next = requireCategory(source)
  if (next.id !== before.id || next.code !== before.code || next.revision <= input.expectedRevision
    || next.name !== stored(input.name) || (next.description ?? null) !== stored(input.description)
    || (next.parentId ?? null) !== (input.parentId ?? null) || next.sortOrder !== input.sortOrder
    || next.sdParamStatus !== (input.active ? 'ACTIVE' : 'INACTIVE')) return fail('更新结果与原目标、修订或提交内容不符')
  return next
}

export function requireReorderedCategories(source: unknown, before: ParameterCategory[], orders: ParameterCategoryOrder[]): ParameterCategory[] {
  const next = requireParameterCategories(source)
  const byId = new Map(next.map(category => [category.id, category]))
  const commands = new Map(orders.map(command => [command.id, command]))
  if (commands.size !== orders.length || orders.some(command => !before.some(category => category.id === command.id))) fail('排序命令目标重复或不存在')
  for (const original of before) {
    const category = byId.get(original.id), command = commands.get(original.id)
    if (!category || category.code !== original.code || category.name !== original.name || (category.description ?? null) !== (original.description ?? null)
      || category.sdParamStatus !== original.sdParamStatus) return fail('排序结果缺少分类或改变了其他内容')
    if (command ? category.revision <= command.expectedRevision : category.revision !== original.revision) return fail('排序修订未确认')
    if ((category.parentId ?? null) !== (command ? command.parentId ?? null : original.parentId ?? null)
      || category.sortOrder !== (command ? command.sortOrder : original.sortOrder)) return fail('分类层级或顺序未按提交保存')
  }
  return next
}

// A refetch may finish before a write response. Preserve newer facts and unrelated additions.
export function mergeConfirmedCategories(source: unknown, confirmed: ParameterCategory[]): ParameterCategory[] {
  const current = requireParameterCategories(source)
  const byId = new Map(current.map(category => [category.id, category]))
  for (const category of confirmed) {
    const previous = byId.get(category.id)
    if (previous && previous.revision > category.revision) continue
    if (previous && previous.revision === category.revision
      && (previous.code !== category.code || previous.name !== category.name || previous.sortOrder !== category.sortOrder
        || previous.sdParamStatus !== category.sdParamStatus || (previous.parentId ?? null) !== (category.parentId ?? null)
        || (previous.description ?? null) !== (category.description ?? null))) fail('同一修订返回了不同分类内容')
    byId.set(category.id, category)
  }
  return requireParameterCategories([...byId.values()])
}
