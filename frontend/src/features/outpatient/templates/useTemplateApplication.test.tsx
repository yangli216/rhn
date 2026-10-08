import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTemplateApplication } from './useTemplateApplication'

describe('template application lifecycle', () => {
  it('serializes clicks and applies a verified result once', async () => {
    let resolve!: (value: string) => void
    const load = vi.fn(() => new Promise<string>(done => { resolve = done })), apply = vi.fn()
    const { result } = renderHook(() => useTemplateApplication('same', false))
    let running!: Promise<void>
    act(() => { running = result.current.run(load, apply); void result.current.run(load, apply) })
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(true)
    await act(async () => { resolve('verified'); await running })
    expect(apply).toHaveBeenCalledExactlyOnceWith('verified')
    expect(result.current.pending).toBe(false)
  })
  it.each(['context', 'blocked', 'draft', 'unmount'])(
    'does not apply a late result after %s changes', async change => {
      let resolve!: (value: string) => void, draft = 'before'
      const apply = vi.fn(), load = () => new Promise<string>(done => { resolve = done })
      const view = renderHook(({ context, blocked }) => useTemplateApplication(context, blocked, () => draft),
        { initialProps: { context: 'one', blocked: false } })
      let running!: Promise<void>
      act(() => { running = view.result.current.run(load, apply) })
      if (change === 'unmount') view.unmount()
      else if (change === 'draft') draft = 'after'
      else view.rerender({ context: change === 'context' ? 'two' : 'one', blocked: change === 'blocked' })
      await act(async () => { resolve('old result'); await running })
      expect(apply).not.toHaveBeenCalled()
      if (change !== 'unmount') expect(view.result.current.error).toMatch(/已变化/)
    })
  it('retains failure and supports an explicit retry without automatic mutations', async () => {
    const { result } = renderHook(() => useTemplateApplication('same', false))
    const apply = vi.fn(), load = vi.fn().mockRejectedValueOnce(new Error('接口失败')).mockResolvedValueOnce('verified')
    await act(async () => { await result.current.run(load, apply) })
    expect(result.current.error).toBe('接口失败')
    expect(apply).not.toHaveBeenCalled()
    await act(async () => { await result.current.run(load, apply) })
    expect(result.current.error).toBe('')
    expect(apply).toHaveBeenCalledExactlyOnceWith('verified')
  })
})
