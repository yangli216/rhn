import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './Workspace'

describe('SegmentedControl', () => {
  it('is a radiogroup that selects with click and arrow keys', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl label="时间范围" value="day" onChange={onChange} items={[
      { value: 'day', label: '今日' }, { value: 'week', label: '本周' }, { value: 'month', label: '本月', disabled: true },
    ]} />)
    expect(screen.getByRole('radiogroup', { name: '时间范围' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '今日' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '本周' }))
    expect(onChange).toHaveBeenLastCalledWith('week')
    screen.getByRole('radio', { name: '今日' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('week')
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('day')
  })
})
