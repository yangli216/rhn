import { z } from 'zod'
import type { CatalogPrice, ItemPackage, MedicationKnowledge, MedicationProduct } from '../../../shared/api/masterDataApi'

export function canPrintPrescription(value: { status: string; medicationRequests: Array<{ status: string }> }) {
  return value.status === 'ACTIVE' && value.medicationRequests.length > 0
    && value.medicationRequests.every((item) => item.status === 'ACTIVE')
}

export interface DispensableProductOption {
  key: string
  product: MedicationProduct
  itemPackage?: ItemPackage
  unitCode: string
  unitName: string
  packageFactor: number
  priceType: string
  price: number
  currencyCode: string
  split: boolean
  label: string
  secondaryText: string
}

const textKnown = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const currencyKnown = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value)
const dateKnown = (value: unknown): value is string => z.iso.date().safeParse(value).success
const periodKnown = (value: { validFrom: string; validTo?: string }) => dateKnown(value.validFrom)
  && (value.validTo == null || (dateKnown(value.validTo) && value.validTo >= value.validFrom))
const effective = (value: { validFrom: string; validTo?: string }, today: string) => periodKnown(value)
  && value.validFrom <= today && (value.validTo == null || value.validTo >= today)
const uniqueIds = (rows: Array<{ id: string }>) => rows.every(row => row && textKnown(row.id))
  && new Set(rows.map(row => row.id)).size === rows.length

export function resolveDispensableOptions(
  medication: MedicationKnowledge, organizationId: string,
  requireDispensable = true,
): DispensableProductOption[] {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (!textKnown(organizationId) || !Array.isArray(medication.products) || !uniqueIds(medication.products)) return []
  const result: DispensableProductOption[] = []
  for (const product of medication.products) {
    const adoption = product.organizationAdoption
    if (product.sdStatus !== 'ACTIVE' || product.orderable !== true || product.chargeable !== true
      || !textKnown(product.unitCode) || !effective(product, today)
      || !adoption || adoption.organizationId !== organizationId || adoption.sdStatus !== 'ACTIVE'
      || adoption.orderable !== true || adoption.chargeable !== true || (requireDispensable && adoption.dispensable !== true)
      || !effective(adoption, today)) continue
    if (!Array.isArray(product.prices) || !uniqueIds(product.prices)
      || !Array.isArray(product.packages) || !uniqueIds(product.packages)) continue
    // Unknown scope/effectivity cannot be discarded to expose a cheaper fallback price.
    const saleRows = product.prices.filter(value => value.sdStatus === 'ACTIVE' && value.sdPriceType === 'SALE')
    if (saleRows.some(value => value.organizationId !== null && !textKnown(value.organizationId))) continue
    const scopedRows = saleRows.filter(value => value.organizationId === null || value.organizationId === organizationId)
    if (scopedRows.some(value => !periodKnown(value))) continue
    const prices = scopedRows.filter(value => effective(value, today))
    if (prices.some(value => !finite(value.price) || value.price < 0 || !currencyKnown(value.currencyCode)
      || (value.packageId != null && !textKnown(value.packageId)))) continue
    const selectPrice = (packageId?: string): CatalogPrice | undefined => {
      const matches = prices.filter(value => (value.packageId ?? undefined) === packageId)
      const local = matches.filter(value => value.organizationId === organizationId)
      const applicable = local.length ? local : matches.filter(value => value.organizationId === null)
      return applicable.length === 1 ? applicable[0] : undefined
    }
    const packages = product.packages.filter(value => value.sdStatus === 'ACTIVE' && effective(value, today)
      && finite(value.quantityFactor) && value.quantityFactor > 0 && textKnown(value.unitCode) && textKnown(value.unitName))
      .sort((left, right) => Number(right.defaultDispense === true) - Number(left.defaultDispense === true)
        || Number(right.defaultSale === true) - Number(left.defaultSale === true))
    for (const itemPackage of packages) {
      const price = selectPrice(itemPackage.id)
      if (price) result.push({
        key: `${product.id}:${itemPackage.id}`, product, itemPackage,
        unitCode: itemPackage.unitCode, unitName: itemPackage.unitName,
        packageFactor: itemPackage.quantityFactor, priceType: price.sdPriceType,
        price: price.price, currencyCode: price.currencyCode, split: false,
        label: itemPackage.packageSpec || itemPackage.unitName,
        secondaryText: `${itemPackage.quantityFactor}${product.unitCode} · ${unitPriceText(price.price, price.currencyCode)}/${itemPackage.unitName}`,
      })
    }
    const basePrice = selectPrice()
    const baseUnit = product.unitCode
    if (basePrice) result.push({
      key: `${product.id}:BASE`, product, unitCode: baseUnit, unitName: baseUnit,
      packageFactor: 1, priceType: basePrice.sdPriceType, price: basePrice.price,
      currencyCode: basePrice.currencyCode, split: true, label: `${baseUnit}（拆零）`,
      secondaryText: `${unitPriceText(basePrice.price, basePrice.currencyCode)}/${baseUnit} · 按最小单位计价`,
    })
  }
  return result
}

export function resolveDispensableProduct(medication: MedicationKnowledge, organizationId: string): {
  product: MedicationProduct; itemPackage: ItemPackage; priceType: string
} | undefined {
  const value = resolveDispensableOptions(medication, organizationId).find((option) => option.itemPackage)
  return value?.itemPackage ? { product: value.product, itemPackage: value.itemPackage, priceType: value.priceType } : undefined
}

export function unitPriceText(value: number, currencyCode: string) {
  if (!finite(value) || value < 0 || !currencyKnown(currencyCode)) return '价格待确认'
  // Keep the actual amount, including tiny unit prices; formatting must not round them to zero.
  const amount = String(value)
  const [integer, fraction = ''] = amount.split('.')
  return `${currencyCode} ${/[eE]/.test(amount) ? amount : `${integer}.${fraction.padEnd(2, '0')}`}`
}
