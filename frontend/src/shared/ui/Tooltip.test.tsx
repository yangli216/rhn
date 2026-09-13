import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens quickly on hover and closes when the pointer leaves', () => {
    vi.useFakeTimers()
    render(<Tooltip content="需皮试 · 观察 20 分钟"><button type="button">皮</button></Tooltip>)

    const trigger = screen.getByRole('button', { name: '皮' }).parentElement!
    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(79))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('需皮试 · 观察 20 分钟')
    expect(screen.getByRole('button', { name: '皮' })).toHaveAttribute('aria-describedby', tooltip.id)

    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens immediately for keyboard focus and closes with Escape', () => {
    render(<Tooltip content="基本药物"><button type="button">基</button></Tooltip>)

    fireEvent.focus(screen.getByRole('button', { name: '基' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('基本药物')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
