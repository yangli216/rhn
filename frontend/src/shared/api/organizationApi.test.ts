import { describe, expect, it, vi } from 'vitest'
import { createOrganizationApi, type OrganizationProfileInput, type PractitionerOnboardingInput } from './organizationApi'
import type { ApiClient } from './httpClient'

describe('organization onboarding API', () => {
  const input: PractitionerOnboardingInput = { code: 'P001', fullName: '测试人员', sdPractGender: 'UNKNOWN',
    organizationId: '98648483543646208', departmentId: '98648483543646209', positionId: '98648483543646210', hireDate: '2026-10-03' }

  it('uses one atomic request and preserves large relationship IDs in both directions', async () => {
    const receipt = { practitioner: { id: '98648483543646211' }, employments: [], assignments: [] }
    const request = vi.fn().mockResolvedValue(receipt)
    const api = createOrganizationApi({ request } as unknown as ApiClient)
    expect(await api.onboardPractitioner(input)).toBe(receipt)
    expect(request).toHaveBeenCalledTimes(1)
    const [path, init] = request.mock.calls[0]
    expect(path).toBe('/api/platform/practitioners/onboarding')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(input)
  })

  it('propagates a failed request without fabricating a person or retrying legacy APIs', async () => {
    const failure = new Error('任职校验失败')
    const request = vi.fn().mockRejectedValue(failure)
    const api = createOrganizationApi({ request } as unknown as ApiClient)
    await expect(api.onboardPractitioner(input)).rejects.toBe(failure)
    expect(request).toHaveBeenCalledTimes(1)
  })
})

describe('organization governance write routing', () => {
  const relation: OrganizationProfileInput = { section: 'relation', targetOrganizationId: '98648483543646209',
    sdRelationType: 'SUPPORT', primaryRelation: false, description: '关系说明', validFrom: '2026-01-01' }
  it.each(['LEGAL_ORGANIZATION', 'ORG_UNIT'] as const)('preserves the exact %s source and target IDs', async kind => {
    const request = vi.fn().mockResolvedValue({})
    const api = createOrganizationApi({ request } as unknown as ApiClient)
    await api.addProfileItem({ id: '98648483543646208', sdOrgKind: kind }, relation)
    const [path, init] = request.mock.calls[0], body = JSON.parse(init.body)
    expect(path).toBe(`/api/platform/${kind === 'ORG_UNIT' ? 'departments' : 'organization-units'}/98648483543646208/relations`)
    expect(body[kind === 'ORG_UNIT' ? 'targetDepartmentId' : 'targetOrganizationId']).toBe('98648483543646209')
    expect(body[kind === 'ORG_UNIT' ? 'targetOrganizationId' : 'targetDepartmentId']).toBeUndefined()
    expect(body.primaryRelation).toBe(false)
    expect(body.section).toBeUndefined()
  })
  it('rejects unsupported department fields without making a request', () => {
    const request = vi.fn(), api = createOrganizationApi({ request } as unknown as ApiClient)
    expect(() => api.addProfileItem({ id: 'dept', sdOrgKind: 'ORG_UNIT' }, { section: 'address', sdAddressType: 'PRACTICE',
      countryCode: 'CN', streetAddress: '地址', validFrom: '2026-01-01' })).toThrow()
    expect(request).not.toHaveBeenCalled()
  })
})
