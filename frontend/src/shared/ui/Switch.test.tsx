import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('renders with role switch and handles click toggle', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Switch checked={false} onChange={onChange} checkedText="已开启" uncheckedText="已停用" />)

    const toggle = screen.getByRole('switch', { name: '已停用' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('已停用')).toBeInTheDocument()

    await user.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('supports keyboard navigation using Space and Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Switch checked={true} onChange={onChange} checkedText="已开启" uncheckedText="已停用" />)

    const toggle = screen.getByRole('switch', { name: '已开启' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    toggle.focus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(false)

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('prevents interaction when disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Switch disabled checked={false} onChange={onChange} label="测试开关" />)

    const toggle = screen.getByRole('switch', { name: '测试开关' })
    expect(toggle).toBeDisabled()

    await user.click(toggle)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('works in uncontrolled mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Switch defaultChecked={false} onChange={onChange} checkedText="已开启" uncheckedText="已停用" />)

    const toggle = screen.getByRole('switch', { name: '已停用' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('已开启')).toBeInTheDocument()
  })
})
