import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import { isActiveExecutionDepartment } from './orderExecutionDepartment'

const apiScopes = new WeakMap<RhnApi, number>()
let nextApiScope = 0

export function useOrderExecutionDepartments(api: RhnApi, organizationId: string, enabled = true) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  return useQuery({
    queryKey: ['order-execution-departments', apiScopes.get(api), organizationId],
    queryFn: async () => (await api.organization.departments(organizationId))
      .filter(department => isActiveExecutionDepartment(department, organizationId)),
    enabled,
    retry: false,
    staleTime: 60_000,
  })
}
