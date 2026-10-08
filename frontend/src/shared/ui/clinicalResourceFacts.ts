import { z } from 'zod'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const date = (value: unknown): value is string => z.iso.date().safeParse(value).success
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const periodKnown = (row: Record<string, unknown>) => date(row.validFrom)
  && (row.validTo == null || (date(row.validTo) && row.validTo >= row.validFrom))
const inPeriod = (row: Record<string, unknown>, at: string) => (row.validFrom as string) <= at && (row.validTo == null || (row.validTo as string) >= at)
const knownStatus = new Set(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'REPLACED', 'INACTIVE'])
export function clinicalBusinessDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const amountText = (value: number) => {
  const source = String(value)
  if (/[eE]/.test(source)) return source
  const [integer, fraction = ''] = source.split('.')
  return `${integer}.${fraction.padEnd(2, '0')}`
}

/** Keep price units, currencies and product identities separate; do not synthesize a range. */
export function clinicalReferencePrices(subjects: unknown, organizationId?: string, at = clinicalBusinessDate()): string {
  const unknown = '参考销售价待确认'
  if (!Array.isArray(subjects) || !date(at)) return unknown
  const details: string[] = []
  for (const subject of subjects) {
    if (!record(subject) || !text(subject.sdStatus) || !knownStatus.has(subject.sdStatus)) return unknown
    if (subject.sdStatus !== 'ACTIVE') continue
    if (!periodKnown(subject)) return unknown
    if (!inPeriod(subject, at)) continue
    if (!Array.isArray(subject.prices)) return unknown
    const byPackage = new Map<string, Record<string, unknown>[]>()
    for (const price of subject.prices) {
      if (!record(price) || !text(price.sdStatus) || !knownStatus.has(price.sdStatus)) return unknown
      if (price.sdStatus !== 'ACTIVE') continue
      if (!text(price.sdPriceType)) return unknown
      if (price.sdPriceType !== 'SALE') continue
      if (price.organizationId === undefined || (price.organizationId !== null && !text(price.organizationId))) return unknown
      if (price.organizationId !== null && price.organizationId !== organizationId) continue
      if (!periodKnown(price)) return unknown
      if (!inPeriod(price, at)) continue
      if (!number(price.price) || price.price < 0 || typeof price.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(price.currencyCode)
        || (price.packageId != null && !text(price.packageId))) return unknown
      const key = (price.packageId as string | undefined) ?? ''
      byPackage.set(key, [...(byPackage.get(key) ?? []), price])
    }
    for (const [packageId, candidates] of byPackage) {
      const local = candidates.filter(row => row.organizationId === organizationId)
      const selected = local.length ? local : candidates.filter(row => row.organizationId === null)
      if (selected.length !== 1) return unknown
      let unit: unknown = subject.unitCode
      let spec: unknown
      if (packageId) {
        if (!Array.isArray(subject.packages)) return unknown
        const matches = subject.packages.filter(value => record(value) && value.id === packageId)
        if (matches.length !== 1 || !record(matches[0])) return unknown
        const pack = matches[0]
        if (pack.sdStatus !== 'ACTIVE' || !periodKnown(pack) || !inPeriod(pack, at)) return unknown
        unit = pack.unitName; spec = text(pack.packageSpec) ? pack.packageSpec : `包装 ${packageId}`
      }
      if (!text(unit)) return unknown
      const value = selected[0]
      const label = text(subject.name) && subjects.length > 1 ? `${subject.name}：` : ''
      details.push(`${label}${value.currencyCode} ${amountText(value.price as number)}/${unit}${text(spec) ? `（${spec}）` : ''}`)
    }
  }
  return details.length ? `参考销售价：${details.join('；')}` : '暂无有效销售价'
}
export function clinicalMedicationType(value: { sdMedicationType?: string; sdMedicationTypeText?: string }): string {
  if (text(value.sdMedicationTypeText)) return value.sdMedicationTypeText
  const labels: Record<string, string> = { WESTERN: '西药', CHINESE_PATENT: '中成药', HERBAL: '中草药', VACCINE: '疫苗' }
  return text(value.sdMedicationType) ? labels[value.sdMedicationType] ?? `药品类型：${value.sdMedicationType}` : '药品类型待确认'
}
export function clinicalStockText(value: { stockSiteName?: string; availablePackageQuantity?: number; packageUnitName?: string }): string {
  if (!text(value.stockSiteName)) return value.availablePackageQuantity == null ? '' : '库存所属药房待确认'
  const quantity = value.availablePackageQuantity
  if (!number(quantity)) return `${value.stockSiteName}（库存待确认）`
  if (quantity < 0) return `${value.stockSiteName}（库存数据异常：${quantity}）`
  if (quantity === 0) return `${value.stockSiteName} (缺药)`
  if (!text(value.packageUnitName)) return `${value.stockSiteName}（可用数量 ${quantity}，单位待确认）`
  return `${value.stockSiteName} (可用: ${quantity}${value.packageUnitName})`
}
