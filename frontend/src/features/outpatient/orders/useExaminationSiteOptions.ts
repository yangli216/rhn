import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'

const apiScopes = new WeakMap<RhnApi, number>()
let nextApiScope = 0

/** 检查项目的可选部位规则；非检查项目不请求。 */
export function useExaminationSiteOptions(api: RhnApi, encounterId: string, catalogItemId: string | undefined,
  serviceType: string | undefined) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  return useQuery({
    queryKey: ['examination-site-options', apiScopes.get(api), encounterId, catalogItemId],
    queryFn: () => api.encounters.examinationSiteOptions(encounterId, catalogItemId!),
    enabled: Boolean(catalogItemId) && serviceType === 'EXAMINATION',
    retry: false,
    staleTime: 60_000,
  })
}
