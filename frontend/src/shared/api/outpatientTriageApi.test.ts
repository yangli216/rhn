import { describe, expect, it, vi } from 'vitest'
import { createOutpatientTriageApi, type TriageRecord } from './outpatientTriageApi'
import type { ApiClient } from './httpClient'

describe('outpatient triage api: getByEncounter', () => {
  it('normalizes an empty response (no triage recorded) to null instead of undefined', async () => {
    const request = vi.fn().mockResolvedValue(undefined)
    const api = createOutpatientTriageApi({ request } as unknown as ApiClient)
    await expect(api.getByEncounter('E1')).resolves.toBeNull()
    expect(request).toHaveBeenCalledWith('/api/outpatient/triage/by-encounter/E1')
  })

  it('keeps an explicit null and returns an existing record unchanged', async () => {
    const record = { id: 'T1', triageNo: 'TR-1', triageLevel: 'LEVEL_3_ROUTINE_URGENT' } as TriageRecord
    const request = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(record)
    const api = createOutpatientTriageApi({ request } as unknown as ApiClient)
    await expect(api.getByEncounter('E1')).resolves.toBeNull()
    await expect(api.getByEncounter('E2')).resolves.toBe(record)
  })
})
