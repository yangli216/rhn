import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTemplateCatalogSearch } from './useTemplateCatalogSearch'

describe('template search request lifecycle', () => {
  it.each(['query', 'context', 'disabled', 'restore-query', 'unmount'])('rejects late candidates after %s', async change => {
    let resolve!: (rows: object[]) => void
    const load = vi.fn(() => new Promise<object[]>(done => { resolve = done }))
    const initial = { context: 'one', query: 'first', enabled: true }
    const view = renderHook(({ context, query, enabled }) => useTemplateCatalogSearch(context, query, enabled, load), { initialProps: initial })
    let task!: Promise<void>
    act(() => { task = view.result.current.search() })
    if (change === 'unmount') view.unmount()
    else if (change === 'disabled') view.rerender({ ...initial, enabled: false })
    else if (change === 'context') view.rerender({ ...initial, context: 'two' })
    else { view.rerender({ ...initial, query: 'second' }); if (change === 'restore-query') view.rerender(initial) }
    const row = { id: 'old' }
    await act(async () => { resolve([row]); await task })
    expect(view.result.current.rows).toEqual([])
    expect(view.result.current.canSelect(row)).toBeFalsy()
  })
  it('keeps failure distinct from an empty success and retries the same query', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('请求失败')).mockResolvedValueOnce([])
    const { result } = renderHook(() => useTemplateCatalogSearch('same', '目标', true, load))
    await act(async () => { await result.current.search() })
    expect(result.current.status).toBe('error'); expect(result.current.error).toBe('请求失败')
    await act(async () => { await result.current.search() })
    expect(result.current.status).toBe('success'); expect(result.current.rows).toEqual([])
    expect(load.mock.calls).toEqual([['目标'], ['目标']])
  })
  it('only accepts rows from the latest completed request and invalidates them when another search starts', async () => {
    const resolves: Array<(rows: object[]) => void> = []
    const load = () => new Promise<object[]>(resolve => resolves.push(resolve))
    const { result } = renderHook(() => useTemplateCatalogSearch('same', '目标', true, load))
    let first!: Promise<void>, second!: Promise<void>
    act(() => { first = result.current.search(); second = result.current.search() })
    const old = { id: 'old' }, current = { id: 'new' }
    await act(async () => { resolves[1]([current]); await second; resolves[0]([old]); await first })
    expect(result.current.rows).toEqual([current])
    expect(result.current.canSelect(current)).toBe(true)
    expect(result.current.canSelect(old)).toBe(false)
    let third!: Promise<void>
    act(() => { third = result.current.search() })
    expect(result.current.canSelect(current)).toBe(false)
    await act(async () => { resolves[2]([]); await third })
  })
})
