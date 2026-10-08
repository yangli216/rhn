import type { CompiledPlanServiceItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { TemplateServiceCandidate } from './templateCatalogSearch'

export function serviceCandidateDraft(candidate: TemplateServiceCandidate): CompiledPlanServiceItem {
  return { catalogItemId: candidate.id, itemCode: candidate.code, itemName: candidate.name,
    serviceType: candidate.serviceType, quantity: Number.NaN, unitCode: candidate.unitCode,
    priceType: 'SALE', pricingRequired: candidate.chargeable }
}

export function aiServiceValidation(item: CompiledPlanServiceItem): string {
  if (!item.catalogItemId || !item.unitCode?.trim()) return '项目目录身份或数量单位缺失，请重新选择。'
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return '请填写大于 0 的项目数量。'
  return ''
}
