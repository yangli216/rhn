import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DatePicker, parseFlexibleDate } from './DatePicker'
import { Dialog } from './index'

describe('parseFlexibleDate', () => {
  it('parses continuous 8-digit number string into YYYY-MM-DD', () => {
    expect(parseFlexibleDate('20260408')).toBe('2026-04-08')
    expect(parseFlexibleDate('20281231')).toBe('2028-12-31')
  })

  it('parses standard separated date formats', () => {
    expect(parseFlexibleDate('2026-04-08')).toBe('2026-04-08')
    expect(parseFlexibleDate('2026/4/8')).toBe('2026-04-08')
    expect(parseFlexibleDate('2026.4.8')).toBe('2026-04-08')
  })

  it('rejects invalid dates or incomplete numbers', () => {
    expect(parseFlexibleDate('20260230')).toBeNull() // 2月无30号
    expect(parseFlexibleDate('20261301')).toBeNull() // 月份13非法
    expect(parseFlexibleDate('2026040')).toBeNull() // 7位不完整
    expect(parseFlexibleDate('abc')).toBeNull()
  })
})

describe('DatePicker Component', () => {
  it('opens on focus outside the scroll container, shows one today shortcut and closes on blur', async () => {
    const user = userEvent.setup()
    const { container } = render(<div style={{ overflow: 'hidden' }}>
      <DatePicker aria-label="效期" value="2030-04-08" />
      <input aria-label="下一字段" />
    </div>)
    await user.tab()
    const calendar = screen.getByRole('dialog', { name: '日历选择' })
    expect(calendar.parentElement).toBe(document.body)
    expect(container).not.toContainElement(calendar)
    expect(screen.getAllByRole('button', { name: '今天' })).toHaveLength(1)
    await user.tab()
    expect(screen.getByLabelText('下一字段')).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the calendar open while clicking its controls, then returns focus after choosing a day', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DatePicker aria-label="效期" value="2030-04-08" onChange={onChange} />)
    await user.click(screen.getByLabelText('效期'))
    await user.click(screen.getByRole('button', { name: '下一月' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '2030-05-15' }))
    expect(onChange).toHaveBeenLastCalledWith('2030-05-15')
    expect(screen.getByLabelText('效期')).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('positions above a field near the viewport bottom and follows scroll changes', () => {
    render(<DatePicker aria-label="效期" />)
    const field = screen.getByTestId('date-picker-wrapper')
    const rect = vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 732, left: 100, right: 260 } as DOMRect)
    fireEvent.focus(screen.getByLabelText('效期'))
    const calendar = screen.getByRole('dialog')
    expect(calendar.style.bottom).toBe(`${window.innerHeight - 700 + 4}px`)
    expect(calendar.style.top).toBe('')
    rect.mockReturnValue({ top: 20, bottom: 52, left: 100, right: 260 } as DOMRect)
    fireEvent.scroll(window)
    expect(calendar.style.top).toBe('56px')
    expect(calendar.style.bottom).toBe('')
    rect.mockRestore()
  })

  it('closes only the calendar on Escape inside a parent dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Dialog title="采购入库" onClose={onClose}><DatePicker aria-label="效期" value="2030-04-08" /></Dialog>)
    await user.click(screen.getByLabelText('效期'))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: '2030-04-08' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '日历选择' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('效期')).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('respects bounds for typed dates and calendar shortcuts', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<><DatePicker aria-label="效期" min="2100-01-01" max="2100-12-31" value="2100-04-08" onChange={onChange} /><input aria-label="下一字段" /></>)
    await user.click(screen.getByLabelText('效期'))
    expect(screen.getByRole('button', { name: '今天' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '+1年' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('效期'), { target: { value: '20990101' } })
    await user.tab()
    expect(onChange).not.toHaveBeenCalledWith('2099-01-01')
    expect(screen.getByLabelText('效期')).toHaveValue('2100-04-08')
  })

  it('supports continuous typing 20260408 and automatically maps to 2026-04-08', () => {
    const onChange = vi.fn()
    render(<DatePicker aria-label="有效期至" value="" onChange={onChange} />)

    const input = screen.getByLabelText('有效期至') as HTMLInputElement
    // 连续输入 20260408
    fireEvent.change(input, { target: { value: '20260408' } })

    expect(onChange).toHaveBeenCalledWith('2026-04-08')
    expect(input.value).toBe('2026-04-08')
  })

  it('accepts standard date string and triggers onChange', () => {
    const onChange = vi.fn()
    render(<DatePicker aria-label="到货日期" value="" onChange={onChange} />)

    const input = screen.getByLabelText('到货日期')
    fireEvent.change(input, { target: { value: '2028-12-31' } })

    expect(onChange).toHaveBeenCalledWith('2028-12-31')
  })

  it('opens styled RHN calendar popover and supports quick expiry shortcuts', () => {
    const onChange = vi.fn()
    render(<DatePicker aria-label="效期" value="2026-04-08" onChange={onChange} showShortcuts={true} />)

    const triggerBtn = screen.getByRole('button', { name: '打开效期日历' })
    fireEvent.click(triggerBtn)

    // 检查弹窗及快捷选项
    expect(screen.getByRole('dialog', { name: '日历选择' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: '效期快速预设' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+1年' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+2年' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+3年' })).toBeInTheDocument()

    // 点击 +2年
    fireEvent.click(screen.getByRole('button', { name: '+2年' }))
    expect(onChange).toHaveBeenCalled()
    // 弹窗自动关闭
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('allows clicking day cells in the calendar grid', () => {
    const onChange = vi.fn()
    render(<DatePicker aria-label="选择日期" value="2026-04-08" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '打开选择日期日历' }))

    // 点击 2026-04-15
    const dayBtn = screen.getByRole('button', { name: '2026-04-15' })
    fireEvent.click(dayBtn)

    expect(onChange).toHaveBeenCalledWith('2026-04-15')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('clears date when clear button is clicked', () => {
    const onChange = vi.fn()
    render(<DatePicker aria-label="效期" value="2026-04-08" onChange={onChange} />)

    const clearBtn = screen.getByRole('button', { name: '清空日期' })
    fireEvent.click(clearBtn)

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('handles Enter key and closes calendar popover without breaking enter navigation', () => {
    const onKeyDown = vi.fn()
    render(<DatePicker aria-label="有效期" value="" onKeyDown={onKeyDown} />)

    const input = screen.getByLabelText('有效期')
    fireEvent.change(input, { target: { value: '20260408' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onKeyDown).toHaveBeenCalled()
  })
})
