import type { ItemPackage, MedicationKnowledge, MedicationProduct } from '../../../shared/api/masterDataApi'

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

export function resolveDispensableOptions(
  medication: MedicationKnowledge, organizationId: string,
): DispensableProductOption[] {
  const today = new Date().toISOString().slice(0, 10)
  const result: DispensableProductOption[] = []
  for (const product of medication.products) {
    const adoption = product.organizationAdoption
    if (product.sdStatus !== 'ACTIVE' || !product.orderable || !product.chargeable
      || !adoption || adoption.organizationId !== organizationId || adoption.sdStatus !== 'ACTIVE'
      || !adoption.orderable || !adoption.chargeable || !adoption.dispensable) continue
    const prices = product.prices.filter((value) => value.sdStatus === 'ACTIVE'
      && value.sdPriceType === 'SALE' && (!value.organizationId || value.organizationId === organizationId)
      && value.validFrom <= today && (!value.validTo || value.validTo >= today))
      .sort((left, right) => Number(Boolean(right.organizationId)) - Number(Boolean(left.organizationId)))
    const packages = [...product.packages].filter((value) => value.sdStatus === 'ACTIVE'
      && value.validFrom <= today && (!value.validTo || value.validTo >= today))
      .sort((left, right) => Number(right.defaultDispense) - Number(left.defaultDispense)
        || Number(right.defaultSale) - Number(left.defaultSale))
    for (const itemPackage of packages) {
      const price = prices.find((value) => value.packageId === itemPackage.id)
      if (price) result.push({
        key: `${product.id}:${itemPackage.id}`, product, itemPackage,
        unitCode: itemPackage.unitCode, unitName: itemPackage.unitName,
        packageFactor: Number(itemPackage.quantityFactor), priceType: price.sdPriceType,
        price: Number(price.price), currencyCode: price.currencyCode, split: false,
        label: itemPackage.packageSpec || itemPackage.unitName,
        secondaryText: `${itemPackage.quantityFactor}${product.unitCode || medication.preparationUnit || '最小单位'} · ${unitPriceText(Number(price.price), price.currencyCode)}/${itemPackage.unitName}`,
      })
    }
    const basePrice = prices.find((value) => !value.packageId)
    const baseUnit = product.unitCode || medication.preparationUnit
    if (basePrice && baseUnit) result.push({
      key: `${product.id}:BASE`, product, unitCode: baseUnit, unitName: baseUnit,
      packageFactor: 1, priceType: basePrice.sdPriceType, price: Number(basePrice.price),
      currencyCode: basePrice.currencyCode, split: true, label: `${baseUnit}（拆零）`,
      secondaryText: `${unitPriceText(Number(basePrice.price), basePrice.currencyCode)}/${baseUnit} · 按最小单位计价`,
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
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: currencyCode || 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(value)
}
