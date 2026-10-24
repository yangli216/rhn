import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Icon, IconActionButton, IconActionGroup } from '.'

describe('IconActionButton', () => {
  it('is a compact text button named by its label, with the label as the default tooltip', async () => {
    const onClick = vi.fn()
    render(<IconActionGroup><IconActionButton label="打印病历" icon={<Icon name="print" />} onClick={onClick} /></IconActionGroup>)
    const button = screen.getByRole('button', { name: '打印病历' })
    expect(button).toHaveAttribute('title', '打印病历')
    expect(button).toHaveClass('ui-button--text', 'ui-button--sm', 'ui-icon-action')
    expect(button.closest('.ui-icon-action-group')).toBeInTheDocument()
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps a custom tooltip and honours disabled', () => {
    render(<IconActionButton label="撤销整单" title="已发药，不能撤销" icon={<Icon name="close" />} disabled />)
    const button = screen.getByRole('button', { name: '撤销整单' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', '已发药，不能撤销')
  })
  it('shows a positive count without changing the action name and hides an empty count', () => {
    const { rerender } = render(<IconActionButton label="病历核查" icon={<Icon name="check" />} count={3} />)
    expect(screen.getByRole('button', { name: '病历核查' })).toHaveTextContent('3')
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true')
    rerender(<IconActionButton label="病历核查" icon={<Icon name="check" />} count={0} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
