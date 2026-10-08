import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent } from '../api/realtimeApi'
import type { RhnApi } from '../rhnApi'
import { RealtimeBridge } from './RealtimeBridge'

describe('RealtimeBridge critical-value refresh', () => {
  it('refreshes the announcement list as well as its count when reconnecting after disconnection', async () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const connect = vi.fn().mockRejectedValueOnce(new Error('Disconnected'))
      .mockImplementation((signal: AbortSignal) => new Promise<undefined>((resolve) =>
        signal.addEventListener('abort', () => resolve(undefined), { once: true })))
    const api = { realtime: { connect }, presence: { activity: vi.fn().mockResolvedValue(undefined) } } as unknown as RhnApi
    const { unmount } = render(<QueryClientProvider client={client}>
      <RealtimeBridge api={api} contextKey="A" organizationId="org" />
    </QueryClientProvider>)
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(connect).toHaveBeenCalledTimes(2)
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['announcements', 'A'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['announcement-summary', 'A'] })
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('refreshes both clinical entry points after a real critical-value event', () => {
    let receive!: (event: RealtimeEvent) => void
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const api = { realtime: { connect: vi.fn((signal: AbortSignal, _lastId: string | undefined,
      onEvent: (event: RealtimeEvent) => void) => {
      receive = onEvent
      return new Promise<undefined>((resolve) => signal.addEventListener('abort', () => resolve(undefined), { once: true }))
    }) }, presence: { activity: vi.fn().mockResolvedValue(undefined) } } as unknown as RhnApi
    const { unmount } = render(<QueryClientProvider client={client}>
      <RealtimeBridge api={api} contextKey="GENERAL:org:dept" organizationId="org" />
    </QueryClientProvider>)
    act(() => receive({ id: 'event1', type: 'DIAGNOSTIC_CRITICAL_VALUE_CLOSED', occurredAt: '2026-10-03T01:00:00Z',
      severity: 'INFO', attributes: {} }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['critical-values', 'GENERAL:org:dept'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inpatient-critical-values'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['work-tasks'] })
    unmount()
  })
})
