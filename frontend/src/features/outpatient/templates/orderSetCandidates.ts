import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import { medicationRequestToDraft, serviceRequestToDraft } from '../orders/editSavedOrder'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'

/**
 * “存为组套”的候选来源，按新旧优先级排列：待确认草稿（内存）> 已随病历保存的草稿（服务端、未开立）> 本次就诊已开立。
 * 去重时靠前的来源优先，因此剂量用法取最新来源。
 */
export type OrderSetCandidateSource = 'PENDING' | 'SAVED_DRAFT' | 'ISSUED'
export const orderSetCandidateSources: OrderSetCandidateSource[] = ['PENDING', 'SAVED_DRAFT', 'ISSUED']
/** 前端自有的来源分组，不是服务端枚举。 */
export const orderSetSourceLabel = (source: OrderSetCandidateSource) =>
  source === 'PENDING' ? '待确认草稿' : source === 'SAVED_DRAFT' ? '已保存的医嘱草稿' : '本次已开立'


export type OrderSetCandidate = {
  key: string
  source: OrderSetCandidateSource
  /** 不可选时的原因（草药整方暂不支持）；可选行为空。 */
  disabledReason?: string
  /** 输液成组或组内行：本期不保存成组关系，按单行保存。 */
  grouped?: boolean
} & ({ kind: 'medication'; medication: MedicationPlanDraft } | { kind: 'service'; service: ServicePlanDraft })

export const herbalDisabledReason = '草药整方暂不支持存为组套'

/** 已作废、已撤销的医嘱不进候选；按状态编码判断。 */
const isLiveStatus = (status: string) => status !== 'CANCELLED'

const medicationKey = (draft: MedicationPlanDraft) => `${draft.request.medicationId ?? ''}|${draft.request.catalogItemId ?? ''}`
const byNewest = <T extends { authoredAt: string }>(items: T[]) =>
  [...items].sort((a, b) => b.authoredAt.localeCompare(a.authoredAt))

/**
 * 汇总三类来源的候选行：复用 medicationRequestToDraft / serviceRequestToDraft 把持久化医嘱转成草稿形态，
 * 再沿用 draftsToOrderSetInput 转换。同一药品（medicationId + catalogItemId）或同一项目（catalogItemId）只列一次；
 * 草药整方不去重（整方里同药可能多行），一律置灰。
 */
export function buildOrderSetCandidates(input: {
  medicationDrafts: MedicationPlanDraft[]
  serviceDrafts: ServicePlanDraft[]
  medications: MedicationRequest[]
  services: ServiceRequest[]
}): OrderSetCandidate[] {
  const all: OrderSetCandidate[] = []
  // 待确认草稿：越靠后越新。
  for (const draft of [...input.medicationDrafts].reverse()) all.push(medicationCandidate(`pending:${draft.id}`, 'PENDING', draft,
    Boolean(draft.parentRequestId || draft.administrationGroupKey)))
  for (const draft of [...input.serviceDrafts].reverse()) all.push({ key: `pending:${draft.id}`, source: 'PENDING', kind: 'service', service: draft })
  const groupedIds = new Set(input.medications.flatMap(item => item.parentRequestId ? [item.id, item.parentRequestId] : []))
  for (const source of ['SAVED_DRAFT', 'ISSUED'] as const) {
    const status = source === 'SAVED_DRAFT' ? 'DRAFT' : 'ACTIVE'
    for (const request of byNewest(input.medications.filter(item => item.status === status && isLiveStatus(item.status)))) {
      all.push(medicationCandidate(`${source}:${request.id}`, source,
        { ...medicationRequestToDraft(request), id: `${source}:${request.id}` }, groupedIds.has(request.id)))
    }
    for (const request of byNewest(input.services.filter(item => item.status === status && isLiveStatus(item.status)))) {
      all.push({ key: `${source}:${request.id}`, source, kind: 'service',
        service: { ...serviceRequestToDraft(request), id: `${source}:${request.id}` } })
    }
  }
  const seen = new Set<string>()
  return all.filter(candidate => {
    if (candidate.disabledReason) return true
    const key = candidate.kind === 'medication' ? `M|${medicationKey(candidate.medication)}` : `S|${candidate.service.catalogItemId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function medicationCandidate(key: string, source: OrderSetCandidateSource, medication: MedicationPlanDraft, grouped: boolean): OrderSetCandidate {
  const herbal = medication.editorMode === 'herbal' || medication.categoryCode === 'HERBAL'
  return { key, source, kind: 'medication', medication, ...(herbal ? { disabledReason: herbalDisabledReason } : {}), ...(grouped ? { grouped } : {}) }
}

export const selectableCandidates = (candidates: OrderSetCandidate[]) => candidates.filter(item => !item.disabledReason)
