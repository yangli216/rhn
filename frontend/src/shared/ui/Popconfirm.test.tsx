import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './index'
import { Popconfirm } from './Popconfirm'

describe('Popconfirm', () => {
  it('does not render popover initially and shows it upon clicking trigger', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <Popconfirm
        title="确认移除该项？"
        okText="确认移除"
        cancelText="放弃"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        <Button>移除</Button>
      </Popconfirm>,
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '移除' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('确认移除该项？')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认移除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放弃' })).toBeInTheDocument()

    // Click cancel
    await userEvent.click(screen.getByRole('button', { name: '放弃' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('triggers onConfirm and closes when confirming', async () => {
    const onConfirm = vi.fn()

    render(
      <Popconfirm
        title="确认撤销医嘱？"
        okText="撤销"
        onConfirm={onConfirm}
      >
        <Button>撤销</Button>
      </Popconfirm>,
    )

    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    const confirmBtn = dialog.querySelector('.ui-popconfirm__actions .ui-button--danger') as HTMLElement
    await userEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the caller ref on the trigger while anchoring the popover', async () => {
    const objectRef = createRef<HTMLButtonElement>()
    const callbackRef = vi.fn()
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { rerender } = render(
      <Popconfirm title="确认？" onConfirm={vi.fn()}><button ref={objectRef}>对象引用</button></Popconfirm>,
    )
    expect(objectRef.current).toBe(screen.getByRole('button', { name: '对象引用' }))
    rerender(<Popconfirm title="确认？" onConfirm={vi.fn()}><button ref={callbackRef}>回调引用</button></Popconfirm>)
    expect(callbackRef).toHaveBeenLastCalledWith(screen.getByRole('button', { name: '回调引用' }))
    await userEvent.click(screen.getByRole('button', { name: '回调引用' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/element\.ref/)
    warn.mockRestore()
  })

  it('closes on Escape key press', async () => {
    const onCancel = vi.fn()

    render(
      <Popconfirm title="确认删除？" onCancel={onCancel}>
        <Button>删除</Button>
      </Popconfirm>,
    )

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not open when disabled is true', async () => {
    render(
      <Popconfirm title="确认删除？" disabled>
        <Button disabled>删除</Button>
      </Popconfirm>,
    )

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
