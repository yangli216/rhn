import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu } from './ActionMenu'

describe('ActionMenu', () => {
  it('opens from the keyboard, skips disabled items and returns focus on Escape', async () => {
    const user = userEvent.setup()
    render(<ActionMenu items={[
      { key: 'first', label: '查看详情', onSelect: vi.fn() },
      { key: 'disabled', label: '不可用操作', disabled: true, onSelect: vi.fn() },
      { key: 'last', label: '终止诊疗', danger: true, onSelect: vi.fn() },
    ]} />)
    const trigger = screen.getByRole('button', { name: '更多' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '查看详情' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '终止诊疗' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '查看详情' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: '终止诊疗' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
  it('runs the selected action once and closes before the business confirmation opens', async () => {
    const user = userEvent.setup(), action = vi.fn()
    render(<ActionMenu items={[{ key: 'terminate', label: '终止诊疗', danger: true, onSelect: action }]} />)
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('menuitem', { name: '终止诊疗' }))
    expect(action).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
  it('closes on outside click and focus departure without moving focus back', async () => {
    const user = userEvent.setup()
    render(<><ActionMenu items={[{ key: 'one', label: '操作', onSelect: vi.fn() }]} /><button>其他区域</button></>)
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('button', { name: '其他区域' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '其他区域' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.tab()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
  it('closes when the action becomes unavailable and prevents disabled item selection', async () => {
    const action = vi.fn(), items = [{ key: 'one', label: '不可用操作', disabled: true, onSelect: action }]
    const { rerender } = render(<ActionMenu items={items} />)
    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    fireEvent.click(screen.getByRole('menuitem'))
    expect(action).not.toHaveBeenCalled()
    rerender(<ActionMenu items={items} disabled />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多' })).toBeDisabled()
  })
})
