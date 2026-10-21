import { fireEvent, render, screen, within } from '@testing-library/react'
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
  const quick = (text: string) => text === '3天' ? [{ label: '改为：5天', nextText: '5天' }, { label: '改为：7天', nextText: '7天' }] : []
  it('shows status, evidence, quick actions and 删除这句 in a non-modal popover', () => {
    const change = vi.fn()
    render(<AnnotatedTextarea aria-label="现病史" value="咳嗽3天" annotations={marks} onValueChange={change} quickActions={quick} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'false')
    expect(dialog).toHaveTextContent('请结合本次口述')
    expect(screen.queryByRole('button', { name: '确认无误' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '改为：5天' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '改为：7天' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除这句' })).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })
  it('focuses the popover itself when there are no quick actions', () => {
    render(<AnnotatedTextarea value="咳嗽3天" annotations={marks} onValueChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    expect(screen.getByRole('dialog')).toHaveFocus()
    expect(screen.getAllByRole('button').map((item) => item.getAttribute('aria-label') ?? item.textContent)).toEqual(
      expect.not.arrayContaining(['改为：5天']))
  })
  function Editor({ initial = '咳嗽3天，发热3天' }: { initial?: string }) {
    const [value, setValue] = useState(initial)
    return <AnnotatedTextarea aria-label="现病史" value={value} onValueChange={setValue} annotations={marks} quickActions={quick} />
  }
  it('shows the quick action result and undo inside the same popover', () => {
    render(<Editor />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    fireEvent.click(screen.getByRole('button', { name: '改为：7天' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByRole('status')).toHaveTextContent('已改为「7天」')
    expect(within(dialog).queryByRole('button', { name: /^改为：/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '删除这句' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '现病史' })).toHaveTextContent('咳嗽7天，发热3天')
    fireEvent.click(within(dialog).getByRole('button', { name: '撤销' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3天：模板病程' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: '现病史' })).toHaveTextContent('咳嗽3天，发热3天')
  })
  it('closes the result popover on an unrelated edit or outside click', () => {
    const view = render(<Editor />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    fireEvent.click(screen.getByRole('button', { name: '改为：5天' }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.unmount()
    const change = vi.fn()
    const external = render(<AnnotatedTextarea value="咳嗽3天" annotations={marks} onValueChange={change} quickActions={quick} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    fireEvent.click(screen.getByRole('button', { name: '改为：5天' }))
    expect(change).toHaveBeenCalledWith('咳嗽5天')
    external.rerender(<AnnotatedTextarea value="咳嗽9天" annotations={marks} onValueChange={change} quickActions={quick} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('deletes the marked sentence only through 删除这句 and reports it in place', () => {
    render(<Editor initial="咳嗽3天" />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    fireEvent.click(screen.getByRole('button', { name: '删除这句' }))
    expect(screen.getByRole('textbox', { name: '现病史' })).toHaveValue('咳嗽')
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('已删除这句')
  })
  it('hiding annotations preserves content and normal textarea editing', () => {
    const change = vi.fn()
    render(<AnnotatedTextarea aria-label="现病史" value="咳嗽3天" annotations={marks} showAnnotations={false} onValueChange={change} />)
    expect(screen.getByRole('textbox')).toHaveValue('咳嗽3天')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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
    else fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
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
    render(<AnnotatedTextarea value="咳嗽3天" annotations={marks} readOnly onValueChange={vi.fn()} quickActions={quick} />)
    fireEvent.click(screen.getByRole('button', { name: '3天：模板病程' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('3天')
    expect(screen.queryByRole('button', { name: '改为：5天' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除这句' })).not.toBeInTheDocument()
  })
})
