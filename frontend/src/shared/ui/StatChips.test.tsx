import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatChips } from './Workspace'

describe('StatChips', () => {
  it('renders label, value and an optional warning note', () => {
    render(<StatChips items={[
      { label: '品种', value: 12 },
      { label: '批次', value: 3, note: '（临期 1）', warn: true },
      { label: '空', value: 0, note: undefined },
    ]} />)
    expect(screen.getByText('品种').closest('.ui-stat-chip')).toHaveTextContent('品种 12')
    expect(screen.getByText('（临期 1）')).toHaveClass('ui-stat-chip__warn')
    expect(screen.getByText('空').closest('.ui-stat-chip')?.querySelector('small')).toBeNull()
  })
})
