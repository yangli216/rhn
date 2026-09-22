import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceDraftEditRow } from './ServiceDraftEditRow'
import { useDraftRowInteractions } from './useDraftRowInteractions'

type Handlers = Parameters<typeof useDraftRowInteractions>[0]
function Harness(props: Handlers) {
  const { rowRef, handleBlur, handleKeyDown } = useDraftRowInteractions(props)
  return <>
    <div className="doctor-unified-order-list" data-testid="list">
      <div ref={rowRef} onBlur={handleBlur} onKeyDown={handleKeyDown}><input aria-label="row input" /></div>
    </div>
    <div className="ui-select__popover"><button>选项</button></div>
    <button>外部</button>
  </>
}
const handlers = (): Handlers => ({ save: vi.fn(), cancel: vi.fn(), ignoreInteraction: () => false })
afterEach(() => vi.useRealTimers())

describe('draft row interaction lifecycle', () => {
  it('keeps popover and scrollbar interactions inside the editing session', () => {
    vi.useFakeTimers()
    const props = handlers()
    render(<Harness {...props} />)
    fireEvent.pointerDown(screen.getByText('选项'))
    fireEvent.blur(screen.getByLabelText('row input'), { relatedTarget: screen.getByText('选项') })
    fireEvent.scroll(screen.getByTestId('list'))
    fireEvent.blur(screen.getByLabelText('row input'), { relatedTarget: screen.getByText('外部') })
    expect(props.save).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(400))
    fireEvent.blur(screen.getByLabelText('row input'), { relatedTarget: screen.getByText('外部') })
    expect(props.save).toHaveBeenCalledTimes(1)
  })

  it('uses current save state and honors remove/append suppression on outside events', () => {
    const before = handlers(), after = handlers()
    const view = render(<Harness {...before} />)
    view.rerender(<Harness {...after} />)
    fireEvent.pointerDown(screen.getByText('外部'))
    expect(before.save).not.toHaveBeenCalled()
    expect(after.save).toHaveBeenCalledTimes(1)
    view.rerender(<Harness {...after} ignoreInteraction={() => true} />)
    fireEvent.pointerDown(screen.getByText('外部'))
    expect(after.save).toHaveBeenCalledTimes(1)
  })

  it('uses the latest callback for deferred blur and removes callbacks on unmount', () => {
    vi.useFakeTimers()
    const before = handlers(), after = handlers()
    const view = render(<Harness {...before} />)
    fireEvent.blur(screen.getByLabelText('row input'), { relatedTarget: null })
    view.rerender(<Harness {...after} />)
    act(() => vi.advanceTimersByTime(100))
    expect(before.save).not.toHaveBeenCalled()
    expect(after.save).toHaveBeenCalledTimes(1)
    fireEvent.blur(screen.getByLabelText('row input'), { relatedTarget: null })
    view.unmount()
    act(() => vi.advanceTimersByTime(100))
    fireEvent.pointerDown(document.body)
    expect(after.save).toHaveBeenCalledTimes(1)
  })

  it('routes Escape to cancel and Ctrl/Meta+Enter to save', () => {
    const props = handlers()
    render(<Harness {...props} />)
    fireEvent.keyDown(screen.getByLabelText('row input'), { key: 'Escape' })
    fireEvent.keyDown(screen.getByLabelText('row input'), { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(screen.getByLabelText('row input'), { key: 'Enter', metaKey: true })
    expect(props.cancel).toHaveBeenCalledTimes(1)
    expect(props.save).toHaveBeenCalledTimes(2)
  })

  it('saves a service row once across the full outside-click sequence', () => {
    const onSave = vi.fn()
    render(<><ServiceDraftEditRow value={{ id: 's1', catalogItemId: 'lab', itemCode: 'LAB',
      itemName: '检验', quantity: 1 }} onSave={onSave} onCancel={vi.fn()} onRemove={vi.fn()} />
      <button>外部</button></>)
    fireEvent.change(screen.getByLabelText('编辑项目数量'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('编辑临床说明'), { target: { value: '  空腹  ' } })
    const outside = screen.getByText('外部')
    fireEvent.pointerDown(outside); fireEvent.mouseDown(outside); fireEvent.click(outside)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2, clinicalDescription: '空腹' }))
  })
})
