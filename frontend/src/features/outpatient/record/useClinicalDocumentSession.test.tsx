import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useClinicalDocumentSession } from './useClinicalDocumentSession'

describe('clinical document operation context', () => {
  it('rejects an old render callback even when it captures its continuation after the context changed', () => {
    const { result, rerender } = renderHook(({ api }) => useClinicalDocumentSession(api, 'enc-1', true), { initialProps: { api: {} } })
    const oldCapture = result.current
    rerender({ api: {} })
    expect(oldCapture()).toThrow('工作上下文或操作权限已变化')
    expect(result.current()).not.toThrow()
  })
  it.each(['api', 'patient', 'permission', 'unmount'] as const)('invalidates a captured continuation on %s change', change => {
    const api = {}
    const { result, rerender, unmount } = renderHook(({ client, key, enabled }) => useClinicalDocumentSession(client, key, enabled),
      { initialProps: { client: api, key: 'enc-1', enabled: true } })
    const check = result.current()
    expect(check).not.toThrow()
    if (change === 'unmount') unmount()
    else {
      act(() => rerender({ client: change === 'api' ? {} : api, key: change === 'patient' ? 'enc-2' : 'enc-1', enabled: change !== 'permission' }))
      // Returning to the old context does not revive its old continuation.
      act(() => rerender({ client: api, key: 'enc-1', enabled: true }))
      expect(result.current()).not.toThrow()
    }
    expect(check).toThrow('工作上下文或操作权限已变化')
  })
})
