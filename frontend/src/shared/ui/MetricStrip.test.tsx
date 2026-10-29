import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetricStrip } from './Workspace'

describe('MetricStrip', () => {
  it('renders label, value and note per metric and flags warnings', () => {
    const { container } = render(<MetricStrip label="月结汇总" items={[
      { label: '期初', value: '¥100.00' },
      { label: '账面差异', value: '¥3.00', note: '2 个异常维度', tone: 'warning' },
    ]} />)
    expect(screen.getByRole('group', { name: '月结汇总' })).toBeInTheDocument()
    expect(screen.getByText('2 个异常维度')).toBeInTheDocument()
    expect(container.querySelectorAll('.ui-metric-strip__item.is-warning')).toHaveLength(1)
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
  })
})
