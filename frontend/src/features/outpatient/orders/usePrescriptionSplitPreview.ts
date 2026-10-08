import { useQuery } from '@tanstack/react-query'
import type { BatchOrderMedicationItem, SplitPrescriptionPlan } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'

type PreviewApi = Pick<RhnApi['encounters'], 'autoSplitPreview'>
const apiScopes = new WeakMap<PreviewApi, number>()
let nextApiScope = 0
const knownCategories = new Set(['WESTERN', 'CHINESE_PATENT', 'HERBAL'])
const fail = (): never => { throw new Error('分方结果与当前药品草稿不一致或缺少必要信息，请重新核对') }
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0

/** The preview is a receipt for every submitted line, including repeated products with different instructions. */
export function requireSplitPreview(plans: SplitPrescriptionPlan[], inputs: BatchOrderMedicationItem[]) {
  if (!Array.isArray(plans) || (inputs.length > 0 && plans.length === 0)) fail()
  const remaining = [...inputs]
  for (const plan of plans) {
    if (!plan || !knownCategories.has(plan.categoryCode) || !text(plan.title)
      || !['HERBAL', 'INFUSION', 'NON_INFUSION'].includes(plan.routeGroupType)
      || !Array.isArray(plan.ruleReasons) || !plan.ruleReasons.every(text)
      || !Array.isArray(plan.items) || !plan.items.length) fail()
    for (const line of plan.items) {
      const item = line?.item
      if (!item || !item.medicationId || !knownCategories.has(item.categoryCode ?? '')
        || !text(item.routeCode) || !['NONE', 'ADMINISTRATION', 'INFUSION'].includes(item.routeExecutionType ?? '')
        || typeof line.groupLeader !== 'boolean') fail()
      if (item.selfProvided) {
        if (item.stockSiteId != null || item.stockSiteName != null || plan.stockSiteId != null || plan.stockSiteName != null) fail()
      } else if (!text(item.stockSiteName) || !text(plan.stockSiteName) || !item.stockSiteId
        || String(item.stockSiteId) !== String(plan.stockSiteId) || item.stockSiteName !== plan.stockSiteName) fail()
      const index = remaining.findIndex(input => Object.entries(input).every(([field, value]) => {
        // Names are resolved on the server; absent optional facts may be filled from the directory.
        if (field === 'stockSiteName' || value == null || (item.selfProvided && field === 'stockSiteId')) return true
        return String(value) === String(item[field as keyof BatchOrderMedicationItem])
      }))
      if (index < 0) fail()
      remaining.splice(index, 1)
    }
  }
  if (remaining.length) fail()
  return plans
}

export function usePrescriptionSplitPreview({ api, encounter, items, enabled }: {
  api: PreviewApi
  encounter: Pick<Encounter, 'id' | 'residentId' | 'organizationId' | 'departmentId'>
  items: BatchOrderMedicationItem[]
  enabled: boolean
}) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  const query = useQuery({
    queryKey: ['auto-split-preview', apiScopes.get(api), encounter.id, encounter.residentId,
      encounter.organizationId, encounter.departmentId, items],
    queryFn: async () => requireSplitPreview(await api.autoSplitPreview(encounter.id, items), items),
    enabled: enabled && items.length > 0,
    retry: false,
    gcTime: 0,
  })
  const ready = items.length === 0 || (enabled && query.isSuccess && !query.isFetching)
  return { ...query, ready, plans: ready ? query.data ?? [] : [],
    requireReady: () => { if (!ready) throw new Error('分方预览尚未确认，请等待完成或重新核对后开立') } }
}
