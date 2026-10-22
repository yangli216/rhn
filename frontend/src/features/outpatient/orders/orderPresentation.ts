import { unitPriceText } from './dispensableOptions'
import { type OrderEntryType } from './orderDraftTypes'
import { formatAmount } from '../../../shared/utils/precision'

/** Duration units are stored as UCUM codes (d/wk/mo/h); doctors read them in Chinese. */
export function formatDurationUnit(unit?: string, fallback = '天'): string {
  const value = unit?.trim()
  if (!value) return fallback
  return ({ d: '天', wk: '周', mo: '月', h: '小时', min: '分钟', a: '年' } as Record<string, string>)[value] ?? value
}

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

export const SPECIMEN_TYPE_MAP: Record<string, string> = {
  SERUM: '血清',
  WHOLE_BLOOD: '全血',
  PLASMA: '血浆',
  URINE: '尿液',
  STOOL: '粪便',
  FECES: '粪便',
  CSF: '脑脊液',
  PLEURAL_FLUID: '胸腹水',
  SECRETION: '分泌物',
  SWAB: '咽拭子',
  BONE_MARROW: '骨髓',
}

export const EXAMINATION_TYPE_MAP: Record<string, string> = {
  RADIOGRAPHY: 'X线检查',
  ULTRASOUND: '超声检查',
  CT: 'CT检查',
  MRI: 'MRI检查',
  ECG: '心电检查',
  ENDOSCOPY: '内镜检查',
  PATHOLOGY: '病理检查',
}

export function formatSpecimenType(value?: string): string {
  if (!value) return ''
  const trimmed = value.trim()
  return SPECIMEN_TYPE_MAP[trimmed.toUpperCase()] || trimmed
}

export function formatExaminationType(value?: string): string {
  if (!value) return ''
  const trimmed = value.trim()
  return EXAMINATION_TYPE_MAP[trimmed.toUpperCase()] || trimmed
}

export function shouldDisplayOrderCode(code?: string): boolean {
  if (!code) return false
  // 移除英文编码：包含英文字母的技术/内部编码不展示在临床界面中
  return !/[a-zA-Z]/.test(code)
}

export interface ExecutingDepartmentSource {
  kind: 'medication' | 'service'
  type?: string
  stockSiteName?: string | null
  stockSiteSource?: 'RESERVATION' | 'ROUTING' | null
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
  if (item.kind === 'medication') {
    if (item.selfProvided) return '患者自备，无需药房发药'
    const name = item.stockSiteName?.trim()
    if (!name) return '发药药房待确认'
    return item.stockSiteSource === 'ROUTING' ? `${name}（当前路由）` : name
  }
  const name = item.performerDepartmentName?.trim()
  if (name) return name
  const id = item.performerDepartmentId?.trim()
  return id ? `科室编号：${id}（名称待确认）` : '执行科室待确认'
}

export function summarizeExecutingDepartments(items: ExecutingDepartmentSource[]): string {
  return [...new Set(items.map(item => resolveExecutingDepartment(item)))].join(' / ')
}

/** Header badge only when the document spans several departments; a single one is already shown in every row. */
export function mixedDepartmentsOnly(summary: string): string | undefined {
  return summary.includes(' / ') ? summary : undefined
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

/** 简单模式“保存即生效”，签署模式“签署后生效”；未传模式时沿用通用口径。 */
export function orderStatusLabel(status: string, mode?: 'SIMPLE' | 'SIGNING') {
  // 草稿/已开立两种状态的措辞随生效方式变化，属于界面语义而非编码字典；其余状态不在此处另存中文名。
  if (status === 'DRAFT') return mode === 'SIMPLE' ? '未生效' : mode === 'SIGNING' ? '未签署' : '草稿'
  if (status === 'ACTIVE') return mode === 'SIMPLE' ? '已生效' : mode === 'SIGNING' ? '已签署' : '已开立'
  if (status === 'SUBMITTED') return '已提交'
  if (status === 'CANCELLED') return '已撤销'
  return status
}

export function formatUnitPrice(value?: number, currencyCode?: string) {
  if (value == null) return '价格待确认'
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || !currencyCode || !/^[A-Z]{3}$/.test(currencyCode)) return '价格待确认'
  if (value > 0 && value < 1e-20) return unitPriceText(value, currencyCode)
  return formatAmount(value, currencyCode, { minimumFractionDigits: 2, maximumFractionDigits: 20 })
}
