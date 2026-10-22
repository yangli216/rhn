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
  performerOrganizationId?: string
  performerDepartmentId?: string
  performerDepartmentName?: string
  /** 检查部位，按选择顺序；按部位计价时 quantity 由部位数换算。 */
  bodySites?: { code: string; name: string }[]
  /** 医生“修改”的已保存申请；保存时在原申请上更新，不新建。 */
  revises?: { id: string; revision: number }
}

export function clinicalAiTreatmentKey(item: Pick<ClinicalAiTreatmentRecommendation, 'type' | 'catalogItemId'>) {
  return `${item.type}:${item.catalogItemId}`
}

export interface AiOrderReviewCommand {
  id: string
  encounterId: string
  items: ClinicalAiTreatmentRecommendation[]
  onCompleted?: (acceptedKeys: string[]) => void
  onFailed?: (message: string) => void
}
