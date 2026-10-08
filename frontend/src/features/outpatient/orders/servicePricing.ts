import { z } from 'zod'
import type { CatalogPrice, ServiceCatalogItem } from '../../../shared/api/masterDataApi'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const date = (value: unknown): value is string => z.iso.date().safeParse(value).success
const periodKnown = (row: { validFrom: string; validTo?: string }) => date(row.validFrom)
  && (row.validTo == null || (date(row.validTo) && row.validTo >= row.validFrom))
const effective = (row: { validFrom: string; validTo?: string }, at: string) => periodKnown(row)
  && row.validFrom <= at && (row.validTo == null || row.validTo >= at)
const statuses = new Set(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'REPLACED', 'INACTIVE'])

export type ServicePricing = { price: CatalogPrice; error?: never } | { price?: never; error: string }

/** The normal outpatient service workflow requests SALE pricing when it submits. */
export function resolveServicePricing(service: ServiceCatalogItem, organizationId: string): ServicePricing {
  const unknown = (): ServicePricing => ({ error: '诊疗项目或销售价格信息待确认，请核实目录后重新选择' })
  const now = new Date()
  const at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const adoption = service.organizationAdoption
  if (!text(service.id) || !text(service.unitCode) || !text(organizationId)
    || service.sdStatus !== 'ACTIVE' || service.orderable !== true || service.chargeable !== true
    || !['COMMON', 'OUTPATIENT'].includes(service.sdUsageType) || !effective(service, at)
    || !adoption || adoption.organizationId !== organizationId || adoption.sdStatus !== 'ACTIVE'
    || adoption.orderable !== true || adoption.chargeable !== true || !effective(adoption, at)
    || !Array.isArray(service.prices)) return unknown()
  const prices: CatalogPrice[] = []
  const ids = new Set<string>()
  for (const price of service.prices) {
    if (!price || !text(price.id) || ids.has(price.id) || !statuses.has(price.sdStatus)) return unknown()
    ids.add(price.id)
    if (price.sdStatus !== 'ACTIVE') continue
    if (!text(price.sdPriceType)) return unknown()
    if (price.sdPriceType !== 'SALE') continue
    if (price.organizationId !== null && !text(price.organizationId)) return unknown()
    if (price.organizationId !== null && price.organizationId !== organizationId) continue
    if (!periodKnown(price)) return unknown()
    if (!effective(price, at)) continue
    // Service requests use the catalog unit and cannot select a medication package price.
    if (price.packageId != null) return unknown()
    if (typeof price.price !== 'number' || !Number.isFinite(price.price) || price.price < 0
      || typeof price.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(price.currencyCode)) return unknown()
    prices.push(price)
  }
  const local = prices.filter(price => price.organizationId === organizationId)
  const selected = local.length ? local : prices.filter(price => price.organizationId === null)
  if (!selected.length) return { error: '当前机构及业务日期未配置有效销售价格，请维护价格后重新选择' }
  if (selected.length !== 1) return { error: '存在多条适用销售价格，请核实价格配置后重新选择' }
  return { price: selected[0] }
}
