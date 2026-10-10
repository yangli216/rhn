import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AnchoredPanel } from './AnchoredPanel'

afterEach(() => vi.useRealTimers())

it('keeps inner interactions open, closes outside and uses the latest close handler', () => {
  vi.useFakeTimers()
  const previous = vi.fn(), close = vi.fn()
  const { rerender } = render(<AnchoredPanel label="参考内容" anchorRect={null} onClose={previous}>
    <button>内部操作</button>
  </AnchoredPanel>)
  fireEvent.mouseDown(document.body)
  expect(previous).not.toHaveBeenCalled()
  act(() => vi.runOnlyPendingTimers())
  rerender(<AnchoredPanel label="参考内容" anchorRect={null} onClose={close}><button>内部操作</button></AnchoredPanel>)
  fireEvent.mouseDown(screen.getByRole('button', { name: '内部操作' }))
  expect(close).not.toHaveBeenCalled()
  fireEvent.mouseDown(document.body)
  expect(close).toHaveBeenCalledOnce()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).toHaveBeenCalledTimes(2)
  expect(previous).not.toHaveBeenCalled()
})

it('unmount removes pending outside registration and keyboard handlers', () => {
  vi.useFakeTimers()
  const close = vi.fn()
  const { unmount } = render(<AnchoredPanel label="参考内容" anchorRect={null} onClose={close} />)
  unmount()
  act(() => vi.runOnlyPendingTimers())
  fireEvent.mouseDown(document.body)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
})
