import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AnnotatedTextarea } from './AnnotatedTextarea'

const marks = [{ start: 2, text: '3天', label: '模板病程', description: '请结合本次口述', tone: 'variable' as const }]
describe('AnnotatedTextarea', () => {
  it('keeps focus and the entire input when annotations arrive during typing', async () => {
    function Editor() {
      const [value, setValue] = useState('')
      return <AnnotatedTextarea aria-label="主诉" value={value} onValueChange={setValue}
        annotations={value ? [{ start: 0, text: value, label: '来源', tone: 'source' }] : []} />
    }
    render(<Editor />)
    const input = screen.getByRole('textbox', { name: '主诉' })
    await userEvent.type(input, '咳嗽5天，伴发热')
    expect(input).toHaveFocus()
    expect(input).toHaveValue('咳嗽5天，伴发热')
    fireEvent.blur(input)
    expect(screen.getByRole('button', { name: '咳嗽5天，伴发热：来源' })).toBeInTheDocument()
  })
  it('edits the same authoritative text through a non-modal popover', () => {
    const change = vi.fn()
    render(<AnnotatedTextarea aria-label="现病史" value="咳嗽3天" annotations={marks} onValueChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false')
    fireEvent.change(screen.getByLabelText('调整此处文字'), { target: { value: '5天' } })
    fireEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(change).toHaveBeenCalledWith('咳嗽5天')
  })
  it('hiding annotations preserves content and normal textarea editing', () => {
    const change = vi.fn()
    render(<AnnotatedTextarea aria-label="现病史" value="咳嗽3天" annotations={marks} showAnnotations={false} onValueChange={change} />)
    expect(screen.getByRole('textbox')).toHaveValue('咳嗽3天')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('keeps the pending edit while scrolling the popover or its textarea', () => {
    const change = vi.fn()
    render(<AnnotatedTextarea value="咳嗽3天" annotations={marks} onValueChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    const dialog = screen.getByRole('dialog')
    const input = screen.getByLabelText('调整此处文字')
    fireEvent.change(input, { target: { value: '5天' } })
    fireEvent.mouseDown(dialog)
    fireEvent.scroll(dialog, { target: { scrollTop: 100 } })
    expect(dialog).toBeInTheDocument()
    fireEvent.scroll(input, { target: { scrollTop: 30 } })
    expect(input).toHaveValue('5天')
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(change).toHaveBeenCalledWith('咳嗽5天')
  })
  it.each(['page scroll', 'resize', 'outside click', 'Escape'])('still dismisses on %s', (action) => {
    const change = vi.fn()
    render(<AnnotatedTextarea value="咳嗽3天" annotations={marks} onValueChange={change} />)
    const trigger = screen.getByRole('button', { name: '3天：模板病程' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    if (action === 'page scroll') fireEvent.scroll(document.body)
    else if (action === 'resize') fireEvent.resize(window)
    else if (action === 'outside click') fireEvent.mouseDown(document.body)
    else fireEvent.keyDown(screen.getByLabelText('调整此处文字'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
    if (action === 'Escape') expect(trigger).toHaveFocus()
  })
  it('discards an open edit when the text changes externally', () => {
    const change = vi.fn()
    const view = render(<AnnotatedTextarea value="咳嗽3天" annotations={marks} onValueChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    view.rerender(<AnnotatedTextarea value="咳嗽5天" annotations={marks} onValueChange={change} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })
  it('does not permit changing saved read-only content through annotations', () => {
    render(<AnnotatedTextarea value="咳嗽3天" annotations={marks} readOnly onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除' })).not.toBeInTheDocument()
  })
})
