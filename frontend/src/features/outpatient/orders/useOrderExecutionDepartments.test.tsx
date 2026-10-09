import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ServiceRequest } from '../../../shared/api/encountersApi'
import { useOrderExecutionDepartments, useSavedOrderDepartmentNames } from './useOrderExecutionDepartments'

const service = (organizationId = 'org', departmentId = 'lab') => ({ performerOrganizationId: organizationId,
  performerDepartmentId: departmentId } as ServiceRequest)
const department = { id: 'lab', organizationId: 'org', name: '医学检验科', sdOrgStatus: 'INACTIVE',
  validFrom: '2020-01-01', validTo: '2025-01-01', virtual: false }
const apiWith = (departments: ReturnType<typeof vi.fn>) => ({ organization: { departments } } as unknown as RhnApi)
function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('saved execution department names', () => {
  it('resolves inactive historical departments while keeping them unavailable for new orders and sharing the directory request', async () => {
    const api = apiWith(vi.fn().mockResolvedValue([department]))
    const { result } = renderHook(() => ({ names: useSavedOrderDepartmentNames(api, [service(), service()]),
      choices: useOrderExecutionDepartments(api, 'org') }), { wrapper: provider() })
    await waitFor(() => expect(result.current.names(service())).toBe('医学检验科'))
    expect(result.current.choices.data).toEqual([])
    expect(api.organization.departments).toHaveBeenCalledTimes(1)
  })
  it('uses the actual performer organization and does not reuse a different API context', async () => {
    const apiA = apiWith(vi.fn().mockImplementation(async id => [{ ...department, organizationId: id,
      name: id === 'org' ? '机构一检验科' : '机构二检验科' }]))
    const apiB = apiWith(vi.fn().mockResolvedValue([{ ...department, name: '新会话检验科' }]))
    const { result, rerender } = renderHook(({ api, services }) => useSavedOrderDepartmentNames(api, services),
      { wrapper: provider(), initialProps: { api: apiA, services: [service(), service('other-org')] } })
    await waitFor(() => expect(result.current(service('other-org'))).toBe('机构二检验科'))
    expect(result.current(service())).toBe('机构一检验科')
    rerender({ api: apiB, services: [service()] })
    expect(result.current(service())).toBeUndefined()
    await waitFor(() => expect(result.current(service())).toBe('新会话检验科'))
    expect(result.current(service('other-org'))).toBeUndefined()
  })
  it.each(['missing', 'wrong-owner', 'duplicate', 'failed'])('keeps %s destinations unconfirmed without guessing a name', async kind => {
    const departments = vi.fn().mockImplementation(async () => {
      if (kind === 'failed') throw new Error('offline')
      return kind === 'missing' ? [] : kind === 'wrong-owner' ? [{ ...department, organizationId: 'other-org' }]
        : [department, { ...department, name: '另一科室' }]
    })
    const api = apiWith(departments)
    const { result } = renderHook(() => ({ names: useSavedOrderDepartmentNames(api, [service()]),
      directory: useOrderExecutionDepartments(api, 'org') }), { wrapper: provider() })
    await waitFor(() => expect(result.current.directory.isFetching).toBe(false))
    expect(result.current.names(service())).toBeUndefined()
    expect(departments).toHaveBeenCalledTimes(1)
  })
})
