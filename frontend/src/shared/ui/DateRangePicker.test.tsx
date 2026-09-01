import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DateRangePicker } from './DateRangePicker'
import { getTodayStr, getThisWeekRange } from '../utils/dateRange'

describe('DateRangePicker', () => {
  it('renders preset trigger and date inputs with exact single-line layout', () => {
    const onChange = vi.fn()
    const today = getTodayStr()
    render(<DateRangePicker value={{ from: today, to: today }} onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: /今天/ })
    expect(trigger).toBeInTheDocument()

    const startInput = screen.getByLabelText('开始日期') as HTMLInputElement
    const endInput = screen.getByLabelText('结束日期') as HTMLInputElement
    expect(startInput.value).toBe(today)
    expect(endInput.value).toBe(today)
  })

  it('opens preset popover and triggers onChange when clicking an option', () => {
    const onChange = vi.fn()
    const today = getTodayStr()
    render(<DateRangePicker value={{ from: today, to: today }} onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: /今天/ })
    fireEvent.click(trigger)

    expect(screen.getByRole('listbox', { name: '快捷日期选项' })).toBeInTheDocument()
    const thisWeekOption = screen.getByRole('option', { name: '本周' })
    fireEvent.click(thisWeekOption)

    const thisWeek = getThisWeekRange()
    expect(onChange).toHaveBeenCalledWith(thisWeek, 'THIS_WEEK')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('triggers onChange when inputs change', () => {
    const onChange = vi.fn()
    render(<DateRangePicker value={{ from: '2026-08-01', to: '2026-08-15' }} onChange={onChange} />)

    const startInput = screen.getByLabelText('开始日期')
    fireEvent.change(startInput, { target: { value: '2026-08-05' } })
    expect(onChange).toHaveBeenCalledWith({ from: '2026-08-05', to: '2026-08-15' }, undefined)
  })

  it('clears date range when clicking clear button', () => {
    const onChange = vi.fn()
    render(<DateRangePicker value={{ from: '2026-08-01', to: '2026-08-15' }} onChange={onChange} />)

    const clearBtn = screen.getByRole('button', { name: '清空日期' })
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith({ from: '', to: '' }, undefined)
  })
})
