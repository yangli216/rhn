import type { GridAddressCreateInput, GridAddressNode, GridAddressStatus } from '../api/gridAddressApi'
import { isIsoInstant } from './instant'

const depths = { PROVINCE: 1, CITY: 2, COUNTY: 3, STREET: 4, COMMUNITY: 5 } as const
export interface GridAddressValue {
  provinceCode?: string
  cityCode?: string
  districtCode?: string
  streetCode?: string
  communityCode?: string
}
export const GRID_ADDRESS_LEVELS = [
  { level: 'PROVINCE', key: 'provinceCode', label: '省' },
  { level: 'CITY', key: 'cityCode', label: '市' },
  { level: 'COUNTY', key: 'districtCode', label: '县/区' },
  { level: 'STREET', key: 'streetCode', label: '街道/乡镇' },
  { level: 'COMMUNITY', key: 'communityCode', label: '社区/村' },
] as const
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const fail = (reason: string): never => { throw new Error(`网格地址未确认：${reason}，请重新加载核实`) }
const stored = (value?: string | null) => value?.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '') || null

export type GridAddressCommand = { kind: 'create'; input: GridAddressCreateInput }
  | { kind: 'update'; before: GridAddressNode; input: Omit<GridAddressCreateInput, 'level' | 'code'> }
  | { kind: 'status'; before: GridAddressNode; status: GridAddressStatus }

function requireNode(source: unknown): GridAddressNode {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return fail('节点资料缺失')
  const value = source as Record<string, unknown>
  if (!text(value.id) || !integer(value.revision) || !text(value.level) || !Object.hasOwn(depths, value.level)
    || value.depth !== depths[value.level as keyof typeof depths] || !text(value.levelName)
    || typeof value.code !== 'string' || !/^\d{12}$/.test(value.code) || !text(value.name) || !text(value.pinyinCode)
    || !text(value.fullPath) || !integer(value.sortOrder) || typeof value.systemManaged !== 'boolean'
    || !isIsoInstant(value.updatedAt) || value.status !== 'ACTIVE' && value.status !== 'INACTIVE'
    || value.parentId != null && !text(value.parentId) || value.shortName != null && typeof value.shortName !== 'string') return fail('节点字段不完整或无效')
  if (value.depth === 1 ? value.parentId != null : !text(value.parentId)) return fail('上级网格与层级不符')
  return source as GridAddressNode
}

export function requireGridAddressNodes(source: unknown): GridAddressNode[] {
  if (!Array.isArray(source)) return fail('目录列表未返回')
  const nodes = source.map(requireNode)
  const byId = new Map<string, GridAddressNode>(), codes = new Set<string>()
  for (const node of nodes) {
    if (byId.has(node.id) || codes.has(node.code)) fail('节点标识或编码重复')
    byId.set(node.id, node); codes.add(node.code)
  }
  for (const node of nodes) {
    const parent = node.parentId == null ? undefined : byId.get(node.parentId)
    if (node.parentId != null && (!parent || parent.depth !== node.depth - 1)) fail('父节点缺失或层级不连续')
    if (node.fullPath !== (parent ? `${parent.fullPath}/${node.name}` : node.name)) fail('完整路径与节点关系不符')
  }
  return source as GridAddressNode[]
}

export function requireGridAddressOptions(source: unknown, levels: 3 | 5): GridAddressNode[] {
  const nodes = requireGridAddressNodes(source)
  if (nodes.some(node => node.status !== 'ACTIVE' || node.depth > levels)) fail('候选目录包含停用节点或超出请求层级')
  return nodes
}

export function inspectGridAddressPath(value: GridAddressValue, levels: 3 | 5,
  nodeByCode: Map<string, GridAddressNode>, complete = true): { path: GridAddressNode[]; issue?: string } {
  const path: GridAddressNode[] = []
  let gap = false
  for (const { level, key, label } of GRID_ADDRESS_LEVELS.slice(0, levels)) {
    const code = value[key]
    if (code == null || code === '') { gap = true; continue }
    if (gap) return { path, issue: '地址层级不完整，请重新选择' }
    const node = typeof code === 'string' ? nodeByCode.get(code) : undefined
    if (!node || node.level !== level || node.status !== 'ACTIVE') return { path, issue: `${label}编码 ${String(code)} 未在有效目录中确认，请重新选择` }
    if ((node.parentId ?? null) !== (path.at(-1)?.id ?? null)) return { path, issue: '地址编码的父子关系不一致，请重新选择' }
    path.push(node)
  }
  if (!path.length && GRID_ADDRESS_LEVELS.slice(levels).some(({ key }) => value[key] != null && value[key] !== '')) {
    return { path, issue: '地址层级不完整，请重新选择' }
  }
  return complete && path.length > 0 && path.length !== levels
    ? { path, issue: `地址尚未选择到${levels === 3 ? '县区' : '社区村'}层级，请补全` } : { path }
}

// Explicit undefined keys also clear stale codes in form consumers that merge updates.
export function gridAddressValueFromPath(path: GridAddressNode[]): GridAddressValue {
  const value: GridAddressValue = { provinceCode: undefined, cityCode: undefined, districtCode: undefined, streetCode: undefined, communityCode: undefined }
  for (const node of path) {
    const level = GRID_ADDRESS_LEVELS.find(item => item.level === node.level)
    if (level) value[level.key] = node.code
  }
  return value
}

export function requireSavedGridAddress(source: unknown, command: GridAddressCommand, catalog: GridAddressNode[]): GridAddressNode {
  const next = requireNode(source)
  if (command.kind === 'create') {
    if (catalog.some(node => node.id === next.id || node.code === next.code)) fail('创建结果指向已有网格')
    if (next.code !== stored(command.input.code) || next.level !== command.input.level || next.status !== 'ACTIVE'
      || next.systemManaged !== false) fail('创建结果与提交不符')
  } else {
    const before = command.before
    if (!catalog.some(node => node.id === before.id) || next.id !== before.id || next.code !== before.code
      || next.level !== before.level || next.revision <= before.revision || next.systemManaged !== before.systemManaged) fail('保存目标、修订或固定属性不符')
    if (next.status !== (command.kind === 'status' ? command.status : before.status)) fail('保存状态与提交不符')
  }
  const expected = command.kind === 'status' ? command.before : command.input
  const expectedPinyin = command.kind === 'status' ? expected.pinyinCode : stored(expected.pinyinCode)?.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (next.name !== stored(expected.name) || (next.shortName ?? null) !== stored(expected.shortName)
    || (next.parentId ?? null) !== (expected.parentId ?? null) || next.sortOrder !== expected.sortOrder
    || next.pinyinCode !== expectedPinyin) fail('保存内容与提交不符')
  const parent = next.parentId == null ? undefined : catalog.find(node => node.id === next.parentId)
  if (next.parentId != null && (!parent || parent.depth !== next.depth - 1)) fail('上级网格未确认')
  if (next.fullPath !== (parent ? `${parent.fullPath}/${next.name}` : next.name)) fail('保存路径与提交不符')
  return next
}
