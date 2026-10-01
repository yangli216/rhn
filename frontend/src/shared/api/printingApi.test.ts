import { describe, expect, it, vi } from 'vitest'
import { createPrintingApi } from './printingApi'
import type { ApiClient } from './httpClient'

describe('printing API identifier contract', () => {
  it('preserves the reported registration and encounter IDs as strings in the wire payload', async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createPrintingApi({ request } as unknown as ApiClient)
    const registrationId = '98648483543646208'
    const encounterId = '98648483543646209'
    // Even a binary-representable integer may stringify to a different decimal integer.
    expect(JSON.stringify(Number(registrationId))).not.toBe(registrationId)
    await api.registrationTicket(registrationId, encounterId)
    const [path, init] = request.mock.calls[0]
    expect(path).toBe('/api/platform/printing/tasks')
    expect(JSON.parse(init.body).source).toEqual({
      sourceType: 'PatientRegistration', sourceId: registrationId, encounterId,
    })
    expect(JSON.parse(init.body).taskCode).toBe('OP.REGISTRATION.TICKET.PRINT')
  })

  it('keeps a missing encounter nullable and generic task IDs lossless', async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createPrintingApi({ request } as unknown as ApiClient)
    await api.registrationTicket('98648483543646208')
    expect(JSON.parse(request.mock.calls[0][1].body).source.encounterId).toBeNull()
    await api.submitTask({ taskCode: 'OP.REGISTRATION.TICKET.PRINT', source: {
      sourceType: 'PatientRegistration', sourceId: '98648483543646209', encounterId: '98648483543646210',
    } })
    expect(JSON.parse(request.mock.calls[1][1].body).source).toEqual({
      sourceType: 'PatientRegistration', sourceId: '98648483543646209', encounterId: '98648483543646210',
    })
  })
})
