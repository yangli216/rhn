import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListItemButton, SelectableList } from './Workspace'

describe('SelectableList', () => {
  it('marks the selected item, selects on click and moves focus with arrow keys', async () => {
    const onSelect = vi.fn()
    render(<SelectableList label="调价单据">
      <ListItemButton title="TJ-001" meta="药品调价" aside="¥12.00" selected onSelect={() => undefined} />
      <ListItemButton title="TJ-002" badge={<span>草稿</span>} meta="药品调价" onSelect={onSelect} />
    </SelectableList>)
    const first = screen.getByRole('button', { name: /TJ-001/ })
    expect(first).toHaveAttribute('aria-current', 'true')
    first.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: /TJ-002/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
