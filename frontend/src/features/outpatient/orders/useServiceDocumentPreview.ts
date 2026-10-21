import { useQuery } from '@tanstack/react-query'
import type { CreateServiceRequestInput, ServiceDocumentPlan } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'

type PreviewApi = Pick<RhnApi['encounters'], 'previewServiceDocuments'>
const apiScopes = new WeakMap<PreviewApi, number>()
let nextApiScope = 0

/** 合单结果必须恰好覆盖每个提交项目一次；遗漏或重复时拒绝展示，不用本地规则补单据。 */
export function requireServiceDocumentPreview(plans: ServiceDocumentPlan[], inputs: CreateServiceRequestInput[]) {
  const fail = (): never => { throw new Error('申请单合单结果与当前项目草稿不一致，请重新核对') }
  if (!Array.isArray(plans) || (inputs.length > 0 && plans.length === 0)) fail()
  const seen = new Set<number>()
  for (const plan of plans) {
    if (!plan || !Array.isArray(plan.itemIndexes) || !plan.itemIndexes.length
      || !Array.isArray(plan.ruleReasons) || typeof plan.title !== 'string') fail()
    for (const index of plan.itemIndexes) {
      if (!Number.isInteger(index) || index < 0 || index >= inputs.length || seen.has(index)) fail()
      seen.add(index)
    }
  }
  if (seen.size !== inputs.length) fail()
  return plans
}

export function useServiceDocumentPreview({ api, encounter, items, enabled }: {
  api: PreviewApi
  encounter: Pick<Encounter, 'id' | 'residentId' | 'organizationId' | 'departmentId'>
  items: CreateServiceRequestInput[]
  enabled: boolean
}) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  const query = useQuery({
    queryKey: ['service-document-preview', apiScopes.get(api), encounter.id, encounter.residentId,
      encounter.organizationId, encounter.departmentId, items],
    queryFn: async () => requireServiceDocumentPreview(await api.previewServiceDocuments(encounter.id, items), items),
    enabled: enabled && items.length > 0,
    retry: false,
    gcTime: 0,
  })
  const ready = items.length === 0 || (enabled && query.isSuccess && !query.isFetching)
  return { ...query, ready, plans: ready ? query.data ?? [] : [],
    requireReady: () => { if (!ready) throw new Error('申请单合单预览尚未确认，请等待完成或重新核对后开立') } }
}
