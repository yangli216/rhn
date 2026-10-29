import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DescriptionList, Tag } from './Workspace'

describe('DescriptionList', () => {
  it('renders label/value pairs, spans and a dash for empty values', () => {
    const { container } = render(<DescriptionList columns={3} items={[
      { label: '库位', value: 'A-01' },
      { label: '备注', value: '', span: 2 },
    ]} />)
    expect(screen.getByText('库位').nextElementSibling).toHaveTextContent('A-01')
    expect(screen.getByText('备注').nextElementSibling).toHaveTextContent('—')
    expect((container.querySelectorAll('dl > div')[1] as HTMLElement).style.gridColumn).toBe('span 2')
  })
})

describe('Tag', () => {
  it('applies tone and mono modifiers', () => {
    render(<Tag tone="brand" mono>B20260101</Tag>)
    expect(screen.getByText('B20260101')).toHaveClass('ui-tag', 'ui-tag--brand', 'ui-tag--mono')
  })
})
