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
  stockSiteName?: string
  itemName?: string
}

export function resolveExecutingDepartment(
  item: ExecutingDepartmentSource,
  currentDepartmentName?: string
): string {
  if (item.kind === 'medication') {
    if (item.stockSiteName?.trim()) {
      return item.stockSiteName.trim()
    }
    if (item.type === 'HERBAL') {
      return '门诊中药房'
    }
    return '门诊西药房'
  }

  // 诊疗项目
  const sType = item.type || ''
  const name = item.itemName || ''

  if (sType === 'LABORATORY') {
    return '检验科'
  }

  if (sType === 'EXAMINATION') {
    if (/(超声|彩超|B超|多普勒)/i.test(name)) return '超声科'
    if (/(心电|脑电|肌电)/i.test(name)) return '心电图室'
    if (/(CT|磁共振|MRI|X线|DR|摄片|胸片|造影|透视)/i.test(name)) return '放射影像科'
    if (/(胃镜|肠镜|内镜|支气管镜|喉镜)/i.test(name)) return '内窥镜中心'
    if (/(病理|活检|细胞学)/i.test(name)) return '病理科'
    return '医技检查科'
  }

  if (sType === 'PATHOLOGY') {
    return '病理科'
  }

  // 一般费用类/治疗处置类（不需要特别执行过的，默认当前科室）
  return currentDepartmentName?.trim() || '当前科室'
}

export function serviceTypeLabel(value?: string) {
  return ({ LABORATORY: '检验', EXAMINATION: '检查', TREATMENT: '治疗', OTHER: '诊疗' } as Record<string, string>)[value || 'OTHER']
    ?? '诊疗'
}

export function formatServiceExecution(value?: string) {
  if (value === 'LABORATORY') return '门诊检验送检'
  if (value === 'EXAMINATION') return '放射/医技检查'
  if (value === 'TREATMENT') return '门诊治疗室执行'
  return '门诊常规执行'
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

export function formatUnitPrice(value?: number, currencyCode = 'CNY') {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: currencyCode || 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(Number(value))
}
