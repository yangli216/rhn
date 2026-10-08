import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRhnSessionApi } from '../../../shared/rhnApi'
import { resolveTemplateOrders } from './resolveTemplateOrders'
import { templateCatalogFixture } from './resolveTemplateOrders.testFixtures'

afterEach(() => vi.restoreAllMocks())

describe('template catalog resolution through production API modules', () => {
  it.each(['success', 'forbidden', 'incomplete-preview'])('verifies catalog, scope and preview transport: %s', async outcome => {
    const f = templateCatalogFixture()
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost')
      const json = (value: unknown) => new Response(JSON.stringify(value))
      switch (url.pathname) {
        case '/api/platform/master-data/medications':
          expect(url.searchParams.get('query')).toBe('TEST')
          expect(url.searchParams.get('organizationId')).toBe('org')
          expect(url.searchParams.get('status')).toBe('ACTIVE')
          return json([f.medication])
        case '/api/platform/master-data/medication-routes/active':
          expect(url.searchParams.get('scene')).toBe('OUTPATIENT')
          return json(f.routes)
        case '/api/platform/master-data/order-frequencies/active':
          expect(url.searchParams.get('organizationId')).toBe('org')
          expect(url.searchParams.get('departmentId')).toBe('dept')
          expect(url.searchParams.get('orderType')).toBe('MEDICATION')
          return json(f.frequencies)
        case '/api/encounters/current/orderable-medications':
          expect(url.searchParams.get('query')).toBe('TEST')
          return json([f.medication])
        case '/api/platform/master-data/services/search':
          expect(url.searchParams.get('query')).toBe('S1')
          expect(url.searchParams.get('organizationId')).toBe('org')
          return json({ content: [f.service] })
        case '/api/platform/departments/lab-dept':
          if (outcome === 'forbidden') return new Response(JSON.stringify({ message: '科室不可访问' }), { status: 403 })
          return json({ department: f.department })
        case '/api/encounters/current/prescriptions/auto-split-preview': {
          expect(init?.method).toBe('POST')
          const items = JSON.parse(String(init?.body))
          expect(items).toEqual([expect.objectContaining({ medicationId: 'm', catalogItemId: 'product', packageId: 'box', quantity: 2 })])
          return json(outcome === 'incomplete-preview' ? [] : await f.autoSplitPreview('current', items))
        }
        default: throw new Error(`Unexpected template request: ${url.pathname}`)
      }
    })
    const api = createRhnSessionApi('test-tenant').withWorkContext({ organizationId: 'org', departmentId: 'dept' })
    const result = resolveTemplateOrders(f.plan, f.target, api, [], true)
    if (outcome !== 'success') await expect(result).rejects.toThrow()
    else expect(await result).toMatchObject({ medications: [{ stockSiteId: 'pharmacy', unitPrice: 2.5 }],
      services: [{ performerDepartmentName: '检验中心二部', unitPrice: 3 }] })
    expect(fetcher.mock.calls.some(([path]) => String(path).includes('/order-drafts'))).toBe(false)
  })
})
