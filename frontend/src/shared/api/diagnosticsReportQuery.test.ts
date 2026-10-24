import { describe, expect, it, vi } from 'vitest'
import { createDiagnosticsApi } from './diagnosticsApi'
import type { ApiClient } from './httpClient'

describe('diagnostic report query wire contract', () => {
  it('encodes literal identifiers, report filters and focused worklists without losing precision', async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createDiagnosticsApi({ request } as unknown as ApiClient)
    await api.queryReports('EXAMINATION', { keyword: '患者%_ & 报告', status: 'CORRECTED', issuedFrom: '2024-01-01T00:00:00Z' }, 2)
    const url = new URL(request.mock.calls[0][0], 'http://test')
    expect(url.pathname).toBe('/api/diagnostics/reports')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ requestType: 'EXAMINATION', keyword: '患者%_ & 报告', status: 'CORRECTED', page: '2', size: '20', issuedFrom: '2024-01-01T00:00:00Z' })
    await api.reportHistory('98648483543646209')
    expect(request.mock.calls[1][0]).toBe('/api/diagnostics/reports/98648483543646209/history')
    await api.worklistPage('LABORATORY', '', 0, 20, undefined, undefined, { activeAndRecent: true })
    expect(new URL(request.mock.calls[2][0], 'http://test').searchParams.get('activeAndRecent')).toBe('true')
  })
})
