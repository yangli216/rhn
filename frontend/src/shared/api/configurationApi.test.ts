import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from './httpClient'
import { createConfigurationApi, type ParameterDefinitionInput, type ParameterValue } from './configurationApi'

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

it('reuses an explicit current-value request code for a retry and allocates a code for ordinary callers', async () => {
  const request = vi.fn().mockResolvedValue({})
  const api = createConfigurationApi({ request } as unknown as ApiClient)
  const input = { scopeType: 'TENANT', valueMode: 'OVERRIDE', valueJson: 'true' } as const
  await api.saveValue('def-1', input, 'stable-request')
  await api.saveValue('def-1', input, 'stable-request')
  await api.saveValue('def-1', input)
  const bodies = request.mock.calls.map(call => JSON.parse(call[1].body))
  expect(bodies[0]).toEqual({ ...input, requestCode: 'stable-request' })
  expect(bodies[1]).toEqual(bodies[0])
  expect(bodies[2]).toEqual({ ...input, requestCode: expect.any(String) })
  expect(bodies[2].requestCode).not.toBe('stable-request')
})

it.each(['create', 'update', 'status'])('preserves a definition %s request code and revision on retry', async kind => {
  const request = vi.fn().mockResolvedValue({})
  const api = createConfigurationApi({ request } as unknown as ApiClient)
  const input = { key: 'test.setting' } as ParameterDefinitionInput
  const send = (code?: string) => kind === 'create' ? api.create(input, code)
    : kind === 'update' ? api.update('def-1', 3, input, code) : api.changeStatus('def-1', 3, false, code)
  await send('stable-code')
  await send('stable-code')
  await send()
  const bodies = request.mock.calls.map(call => JSON.parse(call[1].body))
  expect(bodies[0].requestCode).toBe('stable-code')
  expect(bodies[1]).toEqual(bodies[0])
  expect(bodies[2].requestCode).toEqual(expect.any(String))
  expect(bodies[2].requestCode).not.toBe('stable-code')
  if (kind !== 'create') expect(bodies[0].expectedRevision).toBe(3)
})

it.each(['status', 'rollback'])('retains the value %s request code and original revision', async kind => {
  const request = vi.fn().mockResolvedValue({})
  const api = createConfigurationApi({ request } as unknown as ApiClient)
  const value = { id: 'value', revision: 7 } as ParameterValue
  const send = (code?: string) => kind === 'status' ? api.changeValueStatus('definition', value, false, code)
    : api.rollback('definition', 'change', 7, '恢复历史', code)
  await send('same-command'); await send('same-command'); await send()
  const bodies = request.mock.calls.map(call => JSON.parse(call[1].body))
  expect(bodies[0]).toEqual(expect.objectContaining({ expectedRevision: 7, requestCode: 'same-command' }))
  expect(bodies[1]).toEqual(bodies[0])
  expect(bodies[2].requestCode).toEqual(expect.any(String))
  expect(bodies[2].requestCode).not.toBe('same-command')
})
