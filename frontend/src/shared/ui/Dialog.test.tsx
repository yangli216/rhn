import { createRef } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, FormField, Select } from './index'

describe('Dialog form keyboard navigation', () => {
  it('focuses the requested field and advances with Enter only when the current value is valid', async () => {
    const initialFocusRef = createRef<HTMLInputElement>()
    render(<Dialog title="编辑资料" onClose={vi.fn()} initialFocusRef={initialFocusRef}>
      <form>
        <FormField label="姓名" required>
          <input ref={initialFocusRef} required />
        </FormField>
        <FormField label="证件号">
          <input aria-label="证件号" pattern="[0-9]{3}" />
        </FormField>
        <FormField label="性别" required>
          <Select value="MALE" onChange={vi.fn()} options={[{ value: 'MALE', label: '男' }]} />
        </FormField>
      </form>
    </Dialog>)

    const name = screen.getByLabelText(/姓名/)
    const identity = screen.getByLabelText('证件号')
    const gender = screen.getByRole('combobox', { name: /性别/ })
    expect(name).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(name).toHaveFocus()

    await userEvent.type(name, '张三{Enter}')
    expect(identity).toHaveFocus()

    await userEvent.type(identity, '12{Enter}')
    expect(identity).toHaveFocus()

    await userEvent.type(identity, '3{Enter}')
    expect(gender).toHaveFocus()
  })

  it('keeps Enter available for multiline fields', async () => {
    render(<Dialog title="填写说明" onClose={vi.fn()}>
      <form><FormField label="说明"><textarea /></FormField></form>
    </Dialog>)

    const textarea = screen.getByLabelText('说明')
    await userEvent.type(textarea, '第一行{Enter}第二行')
    expect(textarea).toHaveValue('第一行\n第二行')
  })
})


describe('Content-bound drawer', () => {
  it('tracks content bounds and retains Escape, backdrop protection and focus restoration', async () => {
    const boundary = document.createElement('div')
    const trigger = document.createElement('button')
    document.body.append(boundary, trigger)
    trigger.focus()
    let width = 1200
    vi.spyOn(boundary, 'getBoundingClientRect').mockImplementation(() => ({
      top: 80, left: 240, width, height: 800, right: 240 + width, bottom: 880, x: 240, y: 80,
      toJSON: () => ({}),
    }))
    const onClose = vi.fn()
    const { unmount } = render(<Dialog title="智能建方" presentation="drawer" boundary={boundary}
      closeOnBackdrop={false} onClose={onClose}><FormField label="主诉"><textarea /></FormField></Dialog>)
    const backdrop = screen.getByRole('dialog').parentElement!
    expect(backdrop).toHaveStyle({ top: '80px', left: '240px', width: '1200px', height: '800px' })
    await userEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
    width = 1000
    act(() => { window.dispatchEvent(new Event('resize')) })
    await userEvent.click(screen.getByLabelText('主诉'))
    expect(backdrop).toHaveStyle({ width: '1000px' })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    expect(trigger).toHaveFocus()
    boundary.remove()
    trigger.remove()
  })

  it('does not set #root inert in drawer mode and hides backdrop when host panel is hidden', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    const panel = document.createElement('div')
    panel.className = 'workspace-panel'
    const boundary = document.createElement('div')
    boundary.className = 'workspace-content'
    panel.appendChild(boundary)
    root.appendChild(panel)
    document.body.appendChild(root)

    vi.spyOn(boundary, 'getBoundingClientRect').mockImplementation(() => ({
      top: 50, left: 200, width: 1000, height: 600, right: 1200, bottom: 650, x: 200, y: 50,
      toJSON: () => ({}),
    }))

    const { unmount } = render(
      <Dialog title="抽屉测试" presentation="drawer" boundary={boundary} onClose={vi.fn()}>
        <div>内容</div>
      </Dialog>,
      { container: panel }
    )

    expect(root).not.toHaveAttribute('inert')
    const backdrop = screen.getByRole('dialog').parentElement!
    expect(backdrop).not.toHaveStyle({ display: 'none' })

    act(() => {
      panel.setAttribute('hidden', '')
    })
    await vi.waitFor(() => {
      expect(backdrop).toHaveStyle({ display: 'none' })
    })

    act(() => {
      panel.removeAttribute('hidden')
    })
    await vi.waitFor(() => {
      expect(backdrop).not.toHaveStyle({ display: 'none' })
    })

    unmount()
    root.remove()
  })

  it('renders header actions when actions prop is provided', () => {
    render(
      <Dialog
        title="测试标题"
        actions={<button type="button">头部操作</button>}
        onClose={vi.fn()}
      >
        <div>测试内容</div>
      </Dialog>
    )

    expect(screen.getByRole('button', { name: '头部操作' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '测试标题' })).toBeInTheDocument()
  })
})

describe('Non-modal panel', () => {
  it('keeps its own portaled Select interactive while closing on unrelated outside controls', async () => {
    const onClose = vi.fn(), user = userEvent.setup()
    render(<><Select aria-label="外部选项" options={[{ value: 'outside', label: '外部项目' }]} value="" onChange={vi.fn()} />
      <Dialog title="目录核对" presentation="panel" onClose={onClose}>
        <Select aria-label="院内项目" options={[{ value: 'five', label: '五分类血常规' }]} value="" onChange={vi.fn()} />
      </Dialog></>)
    await user.click(screen.getByRole('combobox', { name: '院内项目' }))
    await user.click(screen.getByRole('option', { name: '五分类血常规' }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('combobox', { name: '外部选项' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('keeps the application interactive and does not steal focus', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    const trigger = document.createElement('button')
    trigger.textContent = '查看知识'
    root.appendChild(trigger)
    document.body.appendChild(root)
    trigger.focus()
    const onClose = vi.fn()

    const { unmount } = render(
      <Dialog title="临床指南" presentation="panel" onClose={onClose}>
        <button type="button">面板操作</button>
      </Dialog>
    )

    const panel = screen.getByRole('dialog', { name: '临床指南' })
    expect(panel).toHaveAttribute('aria-modal', 'false')
    expect(root).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).not.toBe('hidden')
    expect(trigger).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    root.remove()
  })

  it('keeps the close button available for long titles and closes on outside pointer interaction', async () => {
    const outside = document.createElement('button')
    outside.textContent = '面板外操作'
    document.body.appendChild(outside)
    const onClose = vi.fn()

    const { unmount } = render(
      <Dialog
        title="《急性咽峡炎与扁桃体炎基层诊疗指南（2020年）》来源解析与完整参考资料"
        eyebrow="临床知识库"
        presentation="panel"
        onClose={onClose}
      >
        <button type="button">面板内操作</button>
      </Dialog>
    )

    const closeButton = screen.getByRole('button', { name: '关闭面板' })
    expect(closeButton.closest('.ui-dialog__head')).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '面板内操作' }))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(outside)
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    outside.remove()
  })

  it('keeps parent panels open during nested matching and closes only the top panel on Escape', async () => {
    const parentClose = vi.fn(), childClose = vi.fn(), user = userEvent.setup()
    render(<Dialog title="推荐依据" presentation="panel" onClose={parentClose}>
      <Dialog title="匹配目录" presentation="panel" onClose={childClose} closeOnBackdrop={false}>
        <Select aria-label="嵌套候选" value="" onChange={vi.fn()} options={[{ value: 'cbc', label: '血常规' }]} />
      </Dialog>
    </Dialog>)
    await user.click(within(screen.getByRole('dialog', { name: '匹配目录' })).getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '血常规' }))
    expect(parentClose).not.toHaveBeenCalled()
    expect(childClose).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(childClose).toHaveBeenCalledTimes(1)
    expect(parentClose).not.toHaveBeenCalled()
  })

  it('asks an existing panel to close when a new panel opens', async () => {
    const closeFirst = vi.fn()
    const closeSecond = vi.fn()

    const { rerender } = render(
      <Dialog title="第一个知识面板" presentation="panel" onClose={closeFirst}>
        <div>第一份内容</div>
      </Dialog>
    )

    rerender(<>
      <Dialog title="第一个知识面板" presentation="panel" onClose={closeFirst}>
        <div>第一份内容</div>
      </Dialog>
      <Dialog title="第二个知识面板" presentation="panel" onClose={closeSecond}>
        <div>第二份内容</div>
      </Dialog>
    </>)

    await vi.waitFor(() => expect(closeFirst).toHaveBeenCalledTimes(1))
    expect(closeSecond).not.toHaveBeenCalled()
  })
})
