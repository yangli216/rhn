import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from './httpClient'
import { createConfigurationApi } from './configurationApi'

describe('configuration api', () => {
  it('resolves a parameter with encoded key and scoped context', async () => {
    const request = vi.fn().mockResolvedValue({ value: 'COMBINED_CONFIRMATION' })
    const api = createConfigurationApi({ request } as unknown as ApiClient)

    await api.resolve('outpatient.doctor-workstation/completion mode', {
      organizationId: 'org 1', departmentId: 'dept/1', moduleCode: 'DOCTOR WORKSTATION',
    })

    expect(request).toHaveBeenCalledWith(
      '/api/platform/configuration/values/outpatient.doctor-workstation%2Fcompletion%20mode?organizationId=org+1&departmentId=dept%2F1&moduleCode=DOCTOR+WORKSTATION',
    )
  })

  it('omits the query string when no context is supplied', async () => {
    const request = vi.fn().mockResolvedValue({ value: true })
    const api = createConfigurationApi({ request } as unknown as ApiClient)

    await api.resolve('feature.enabled')

    expect(request).toHaveBeenCalledWith('/api/platform/configuration/values/feature.enabled')
  })
})
