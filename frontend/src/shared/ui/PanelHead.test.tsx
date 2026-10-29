import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PanelHead } from './index'

describe('PanelHead', () => {
  it('renders a description under the title and the section level modifier', () => {
    const { container } = render(<PanelHead level="section" title="差异明细" description="处理差异后需重新执行预检" meta="3 项" actions={<button type="button">刷新</button>} />)
    expect(screen.getByRole('heading', { name: '差异明细' })).toBeInTheDocument()
    expect(screen.getByText('处理差异后需重新执行预检').tagName).toBe('SMALL')
    expect(container.querySelector('header')).toHaveClass('ui-panel__head--section', 'has-actions')
  })

  it('keeps the plain heading structure without a description', () => {
    const { container } = render(<PanelHead title="患者" />)
    expect(container.querySelector('.ui-panel__titles')).toBeNull()
  })
})
