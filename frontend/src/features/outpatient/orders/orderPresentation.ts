import { unitPriceText } from './dispensableOptions'
import { type OrderEntryType } from './orderDraftTypes'

export function formatPackageUnit(unitName?: string, unitCode?: string): string {
  const name = unitName?.trim()
  if (name && !/^[A-Z_]+$/.test(name)) return name
  const code = (unitCode || name || '').toUpperCase()
  const map: Record<string, string> = {
    BOX: '盒',
    BOTTLE: '瓶',
    BAG: '袋',
    VIAL: '支',
    AMP: '安瓿',
    TUBE: '支',
    PIECE: '片',
    TAB: '片',
    CAP: '粒',
    STRIP: '板',
    PACK: '包',
    DOSE: '剂',
    ITEM: '项',
  }
  return map[code] || unitName || unitCode || '单位'
}

export interface ExecutingDepartmentSource {
  kind: 'medication' | 'service'
  type?: string
  stockSiteName?: string | null
  selfProvided?: boolean
  itemName?: string
  performerDepartmentId?: string
  performerDepartmentName?: string
}

export function resolveExecutingDepartment(
  item: ExecutingDepartmentSource,
  _currentDepartmentName?: string
): string {
  // 当前就诊科室、项目类型与名称都不是执行去向的证据。
  if (item.kind === 'medication') return item.selfProvided ? '患者自备，无需药房发药' : item.stockSiteName?.trim() || '发药药房待确认'
  const name = item.performerDepartmentName?.trim()
  if (name) return name
  const id = item.performerDepartmentId?.trim()
  return id ? `科室编号：${id}（名称待确认）` : '执行科室待确认'
}

export function summarizeExecutingDepartments(items: ExecutingDepartmentSource[]): string {
  return [...new Set(items.map(item => resolveExecutingDepartment(item)))].join(' / ')
}

export function serviceTypeLabel(value?: string) {
  return ({ LABORATORY: '检验', EXAMINATION: '检查', TREATMENT: '治疗', OTHER: '诊疗' } as Record<string, string>)[value || 'OTHER']
    ?? '诊疗'
}

export function formatServiceExecution(value?: string) {
  return ({ LABORATORY: '检验项目', EXAMINATION: '检查项目', TREATMENT: '治疗项目', OTHER: '诊疗项目' } as Record<string, string>)[value ?? '']
    ?? '项目类型待确认'
}

export function orderTypeLabel(value: OrderEntryType) {
  return value === 'ALL' ? '全部'
    : value === 'WESTERN' ? '西药'
    : value === 'CHINESE_PATENT' ? '中成药'
    : value === 'MEDICATION' ? '药品'
    : value === 'HERBAL' ? '草药'
    : serviceTypeLabel(value)
}

export function orderStatusLabel(status: string) {
  return ({ DRAFT: '草稿', ACTIVE: '已开立', SUBMITTED: '已提交', CANCELLED: '已撤销' } as Record<string, string>)[status] ?? status
}

export function formatUnitPrice(value?: number, currencyCode?: string) {
  if (value == null) return '价格待确认'
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || !currencyCode || !/^[A-Z]{3}$/.test(currencyCode)) return '价格待确认'
  if (value > 0 && value < 1e-20) return unitPriceText(value, currencyCode)
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 20,
  }).format(value)
}
