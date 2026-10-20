import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecordAnnotationLegend } from './RecordAnnotationLegend'

describe('RecordAnnotationLegend', () => {
  it('lists only present types and offers no confirmation controls', () => {
    render(<RecordAnnotationLegend tones={{ variable: false, important: true, conflict: true }} />)
    const legend = screen.getByRole('complementary', { name: '病历标记说明' })
    expect(legend).toHaveTextContent('虚线文字可点击核实')
    expect(legend).toHaveTextContent('橙色：AI 推荐待核实')
    expect(legend).toHaveTextContent('红色：信息冲突')
    expect(legend).not.toHaveTextContent('蓝色')
    expect(legend).not.toHaveTextContent('待核实 ')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
