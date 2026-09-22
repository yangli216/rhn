import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FontSizeControl } from './FontSizeControl'
import { FONT_SIZE_STORAGE_KEY } from '../preferences/useFontSizePreference'

beforeEach(() => { localStorage.removeItem(FONT_SIZE_STORAGE_KEY); delete document.documentElement.dataset.fontSize })
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(FONT_SIZE_STORAGE_KEY); delete document.documentElement.dataset.fontSize })

describe('font size preference', () => {
  it('switches immediately, preserves input and restores the choice after remount', async () => {
    const user = userEvent.setup()
    const first = render(<><input aria-label="未保存病历" defaultValue="主诉草稿" /><FontSizeControl /></>)
    await user.click(screen.getByRole('button', { name: '大字' }))
    expect(document.documentElement).toHaveAttribute('data-font-size', 'large')
    expect(screen.getByRole('textbox', { name: '未保存病历' })).toHaveValue('主诉草稿')
    expect(localStorage.getItem(FONT_SIZE_STORAGE_KEY)).toBe('large')
    first.unmount()
    render(<FontSizeControl />)
    expect(screen.getByRole('button', { name: '大字' })).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: '标准' }).focus()
    await user.keyboard('{Enter}')
    expect(document.documentElement).toHaveAttribute('data-font-size', 'standard')
  })

  it('keeps multiple selectors and another browser tab in sync', async () => {
    render(<><FontSizeControl /><FontSizeControl /></>)
    const groups = screen.getAllByRole('group', { name: '字体大小' })
    await userEvent.click(within(groups[0]).getByRole('button', { name: '大字' }))
    expect(within(groups[1]).getByRole('button', { name: '大字' })).toHaveAttribute('aria-pressed', 'true')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'standard' })))
    expect(document.documentElement.dataset.fontSize).toBe('large')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: FONT_SIZE_STORAGE_KEY, newValue: 'standard' })))
    expect(screen.getAllByRole('button', { name: '标准' }).every(button => button.getAttribute('aria-pressed') === 'true')).toBe(true)
  })

  it('defaults safely for invalid preferences and storage restrictions', async () => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, 'huge')
    const first = render(<FontSizeControl />)
    expect(document.documentElement.dataset.fontSize).toBe('standard')
    first.unmount()
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    render(<FontSizeControl />)
    await userEvent.click(screen.getByRole('button', { name: '大字' }))
    expect(document.documentElement.dataset.fontSize).toBe('large')
  })
})
