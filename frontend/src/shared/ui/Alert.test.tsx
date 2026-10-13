import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Alert, Button, Dialog } from './index'

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

  it('keeps dialog guidance beside its action until the dialog closes', () => {
    vi.useFakeTimers()
    render(<Dialog title="保存草稿" onClose={() => {}}>
      <Alert placement="inline" tone="info">校验通过后继续诊毕<Button>保存并继续</Button></Alert>
    </Dialog>)
    const dialog = screen.getByRole('dialog', { name: '保存草稿' })
    const notice = within(dialog).getByRole('status')
    expect(notice).toHaveClass('ui-alert--info')
    expect(notice).not.toHaveClass('ui-toast', 'ui-alert--error')
    expect(within(notice).getByRole('button', { name: '保存并继续' })).toBeInTheDocument()
    expect(within(notice).queryByRole('button', { name: '关闭提示' })).not.toBeInTheDocument()
    expect(document.querySelector('.ui-toast')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(30_000))
    expect(within(dialog).getByRole('status')).toBeInTheDocument()
  })

  it('keeps a contextual warning visible and supports explicit dismissal', async () => {
    const onDismiss = vi.fn()
    const { container } = render(<Alert placement="inline" tone="warning" dismissible onDismiss={onDismiss}>
      费用尚未核对，请确认后继续
    </Alert>)
    const notice = within(container).getByRole('alert')
    expect(notice).toHaveClass('ui-alert--warning')
    expect(notice).not.toHaveClass('ui-toast', 'ui-alert--error')
    await userEvent.click(within(notice).getByRole('button', { name: '关闭提示' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(within(container).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('moves a notice between the content area and the notification viewport without duplicates', () => {
    const { container, rerender } = render(<Alert placement="inline" tone="info">正在核对</Alert>)
    expect(within(container).getByRole('status')).toBeInTheDocument()
    rerender(<Alert tone="info">正在核对</Alert>)
    expect(within(container).queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveClass('ui-toast')
    rerender(<Alert placement="inline" tone="info">正在核对</Alert>)
    expect(within(container).getByRole('status')).toBeInTheDocument()
    expect(document.querySelector('.ui-toast')).not.toBeInTheDocument()
  })

  it('keeps messages from inactive workspace tabs inside their hidden panel', () => {
    render(<div className="workspace-panel" hidden><Alert>非当前页错误</Alert></div>)

    const notice = document.querySelector('.ui-toast')
    expect(notice?.closest('.workspace-panel')).toHaveAttribute('hidden')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
