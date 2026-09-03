import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Alert } from './index'

afterEach(() => vi.useRealTimers())

describe('Alert', () => {
  it('renders in the shared top notification viewport and can be dismissed', async () => {
    const { container } = render(<Alert>数据约束冲突，请刷新后重试</Alert>)

    const notice = screen.getByRole('alert')
    expect(notice).toHaveClass('ui-toast')
    expect(notice.closest('[data-ui-notification-viewport="true"]')).toBeInTheDocument()
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stacks messages from top to bottom and automatically clears them', () => {
    vi.useFakeTimers()
    render(<><Alert tone="success">保存成功</Alert><Alert tone="info">数据已刷新</Alert></>)

    const viewport = document.querySelector('[data-ui-notification-viewport="true"]')
    expect(viewport?.querySelectorAll('.ui-toast')).toHaveLength(2)
    expect(viewport?.textContent).toContain('保存成功')
    expect(viewport?.textContent).toContain('数据已刷新')

    act(() => vi.advanceTimersByTime(5_000))
    expect(viewport?.querySelectorAll('.ui-toast')).toHaveLength(0)
  })

  it('keeps messages from inactive workspace tabs inside their hidden panel', () => {
    render(<div className="workspace-panel" hidden><Alert>非当前页错误</Alert></div>)

    const notice = document.querySelector('.ui-toast')
    expect(notice?.closest('.workspace-panel')).toHaveAttribute('hidden')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
