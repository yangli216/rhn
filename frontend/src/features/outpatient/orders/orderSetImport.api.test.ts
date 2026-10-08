import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRhnSessionApi } from '../../../shared/rhnApi'
import { groupApi, groupFixture } from './orderSetImport.testFixtures'
import { resolveOrderSetImport } from './orderSetImport'

afterEach(() => vi.restoreAllMocks())

describe('order-set import through the production API modules', () => {
  it.each([false, true])('uses the real department route and propagates its failure: %s', async fails => {
    const group = groupFixture(), { services, department } = groupApi(group)
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/platform/master-data/operations/item-groups') {
        expect(url.searchParams.get('query')).toBe(group.code)
        expect(url.searchParams.get('groupType')).toBe('ORDER_SET')
        return new Response(JSON.stringify([group]))
      }
      if (url.pathname === '/api/platform/master-data/services/search') {
        expect(url.searchParams.get('organizationId')).toBe('org')
        return new Response(JSON.stringify({ content: services.filter(service => service.code === url.searchParams.get('query')) }))
      }
      if (url.pathname === '/api/platform/departments/lab-dept') {
        if (fails) return new Response(JSON.stringify({ message: '科室不可访问' }), { status: 403 })
        return new Response(JSON.stringify({ department }))
      }
      throw new Error(`Unexpected request: ${url.pathname}`)
    })
    const api = createRhnSessionApi('test-tenant').withWorkContext({ organizationId: 'org', departmentId: 'doctor-dept' })
    const result = resolveOrderSetImport(group, { organizationId: 'org', departmentId: 'doctor-dept' }, api)
    if (fails) await expect(result).rejects.toThrow()
    else expect((await result).drafts[0].performerDepartmentName).toBe(department.name)
    expect(fetcher.mock.calls.filter(([path]) => String(path) === '/api/platform/departments/lab-dept')).toHaveLength(1)
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })
})
