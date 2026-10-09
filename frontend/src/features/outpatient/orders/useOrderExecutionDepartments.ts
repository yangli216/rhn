import { useQueries, useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ServiceRequest } from '../../../shared/api/encountersApi'
import { isActiveExecutionDepartment } from './orderExecutionDepartment'

const apiScopes = new WeakMap<RhnApi, number>()
let nextApiScope = 0

function departmentDirectoryQuery(api: RhnApi, organizationId: string) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  return {
    queryKey: ['order-execution-departments', apiScopes.get(api), organizationId],
    queryFn: () => api.organization.departments(organizationId),
    retry: false as const,
    staleTime: 60_000,
  }
}

export function useOrderExecutionDepartments(api: RhnApi, organizationId: string, enabled = true) {
  return useQuery({
    ...departmentDirectoryQuery(api, organizationId),
    select: departments => departments.filter(department => isActiveExecutionDepartment(department, organizationId)),
    enabled,
  })
}

/** Read saved destinations without restricting them to departments available for new orders. */
export function useSavedOrderDepartmentNames(api: RhnApi, services: ServiceRequest[]) {
  const organizationIds = [...new Set(services.filter(service => service.performerDepartmentId?.trim())
    .map(service => service.performerOrganizationId?.trim()).filter((id): id is string => Boolean(id)))].sort()
  const directories = useQueries({ queries: organizationIds.map(id => departmentDirectoryQuery(api, id)) })
  return (service: ServiceRequest): string | undefined => {
    const index = organizationIds.indexOf(service.performerOrganizationId?.trim() ?? '')
    if (index < 0) return undefined
    const directory = directories[index]
    if (!directory.isSuccess || !Array.isArray(directory.data)) return undefined
    const matches = directory.data.filter(department => department.organizationId === organizationIds[index]
      && department.id === service.performerDepartmentId && department.name?.trim())
    return matches.length === 1 ? matches[0].name.trim() : undefined
  }
}
