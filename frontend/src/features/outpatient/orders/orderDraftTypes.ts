import type { ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'

export type OrderEntryType = 'ALL' | 'WESTERN' | 'CHINESE_PATENT' | 'MEDICATION' | 'HERBAL' | 'LABORATORY' | 'EXAMINATION' | 'TREATMENT'

export interface ServicePlanDraft {
  id: string
  sequence?: number
  serviceType?: string
  catalogItemId: string
  itemCode: string
  itemName: string
  quantity: number
  unitCode?: string
  clinicalDescription?: string
  unitPrice?: number
  currencyCode?: string
}

export function clinicalAiTreatmentKey(item: Pick<ClinicalAiTreatmentRecommendation, 'type' | 'catalogItemId'>) {
  return `${item.type}:${item.catalogItemId}`
}

export interface AiOrderReviewCommand {
  id: string
  encounterId: string
  items: ClinicalAiTreatmentRecommendation[]
  onCompleted?: (acceptedKeys: string[]) => void
}
