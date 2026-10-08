import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBarcodeScanner } from './useBarcodeScanner'

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('triggers onScan when characters arrive with high speed (<50ms) followed by Enter', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))

    const code = 'MZ20260830001'
    for (const char of code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      vi.advanceTimersByTime(10) // 10ms interval
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onScan).toHaveBeenCalledWith('MZ20260830001')
  })

  it('does not trigger onScan when typing slowly (>50ms interval, human typing)', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))

    const code = 'MZ2026'
    for (const char of code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      vi.advanceTimersByTime(100) // 100ms interval
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onScan).not.toHaveBeenCalled()
  })

  it('does not trigger onScan when character count is below minCharacters', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan, minCharacters: 5 }))

    const code = '123'
    for (const char of code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      vi.advanceTimersByTime(10)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onScan).not.toHaveBeenCalled()
  })

  it('respects enabled flag', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan, enabled: false }))

    const code = 'MZ20260830001'
    for (const char of code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      vi.advanceTimersByTime(10)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onScan).not.toHaveBeenCalled()
  })

  it.each(['ctrlKey', 'metaKey', 'altKey'])('does not consume %s+Enter after rapid typing', (modifier) => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))
    for (const key of '28.6') window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    const event = new KeyboardEvent('keydown', { key: 'Enter', [modifier]: true, cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('does not scan cash input or leave cash digits in the next scan buffer', () => {
    const onScan = vi.fn()
    renderHook(() => useBarcodeScanner({ onScan }))
    const input = document.createElement('input')
    input.dataset.barcodeScan = 'ignore'
    document.body.appendChild(input)
    try {
      for (const key of ['2', '8', '.', '6', 'Enter']) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(onScan).not.toHaveBeenCalled()
    } finally {
      input.remove()
    }
  })
})
