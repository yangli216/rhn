import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FocusLayoutContext, useFocusLayout } from '../../../shared/hooks/focusLayout'
import { RecordColumnSplitter, useRecordColumnWidth } from './RecordColumnSplitter'

function Cockpit() {
  const container = useRef<HTMLElement>(null)
  const column = useRef<HTMLDivElement>(null)
  const recordColumn = useRecordColumnWidth()
  return <section ref={container} data-testid="cockpit" data-width={recordColumn.width ?? ''}>
    <div ref={column}><RecordColumnSplitter containerRef={container} columnRef={column} {...recordColumn} /></div>
  </section>
}

describe('RecordColumnSplitter', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  it('drags and nudges the record width within bounds, persists it and resets on Enter', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1400 } as DOMRect)
    render(<Cockpit />)
    const splitter = screen.getByRole('separator', { name: '调整病历宽度' })
    fireEvent.pointerDown(splitter, { button: 0, pointerId: 1 })
    fireEvent.pointerMove(splitter, { clientX: 700, pointerId: 1 })
    fireEvent.pointerUp(splitter, { pointerId: 1 })
    expect(screen.getByTestId('cockpit')).toHaveAttribute('data-width', '600')
    expect(localStorage.getItem('rhn.doctor.recordWidth')).toBe('600')
    fireEvent.keyDown(splitter, { key: 'ArrowRight' })
    expect(screen.getByTestId('cockpit')).toHaveAttribute('data-width', '624')
    fireEvent.pointerDown(splitter, { button: 0, pointerId: 1 })
    fireEvent.pointerMove(splitter, { clientX: 5000, pointerId: 1 })
    fireEvent.pointerUp(splitter, { pointerId: 1 })
    expect(screen.getByTestId('cockpit')).toHaveAttribute('data-width', '920')
    fireEvent.keyDown(splitter, { key: 'Enter' })
    expect(screen.getByTestId('cockpit')).toHaveAttribute('data-width', '')
    expect(localStorage.getItem('rhn.doctor.recordWidth')).toBeNull()
  })
})

describe('useFocusLayout', () => {
  it('asks the shell for focus while mounted and releases it on unmount', () => {
    const setFocus = vi.fn()
    function Chart() { useFocusLayout(); return null }
    const view = render(<FocusLayoutContext.Provider value={{ tabId: 'doctor', setFocus }}><Chart /></FocusLayoutContext.Provider>)
    expect(setFocus).toHaveBeenLastCalledWith('doctor', true)
    view.unmount()
    expect(setFocus).toHaveBeenLastCalledWith('doctor', false)
  })
})
