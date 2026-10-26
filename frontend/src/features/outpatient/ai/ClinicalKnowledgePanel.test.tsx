import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ClinicalKnowledgePanel } from './ClinicalKnowledgePanel'

describe('ClinicalKnowledgePanel resizable drawer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders resizer handle with accessibility attributes and title', () => {
    render(
      <ClinicalKnowledgePanel title="测试药品说明书" onClose={vi.fn()}>
        <div>说明书内容</div>
      </ClinicalKnowledgePanel>
    )

    const resizer = screen.getByRole('separator', { name: /拖动调整临床知识库面板宽度/ })
    expect(resizer).toBeInTheDocument()
    expect(resizer).toHaveAttribute('aria-orientation', 'vertical')
    expect(resizer).toHaveAttribute('title', expect.stringContaining('拖拽调整面板宽度'))
  })

  it('adjusts width via keyboard arrow keys and persists to localStorage', () => {
    render(
      <ClinicalKnowledgePanel title="测试药品说明书" onClose={vi.fn()}>
        <div>说明书内容</div>
      </ClinicalKnowledgePanel>
    )

    const resizer = screen.getByRole('separator', { name: /拖动调整临床知识库面板宽度/ })

    // 按左方向键拉宽
    fireEvent.keyDown(resizer, { key: 'ArrowLeft' })
    expect(localStorage.getItem('rhn.clinicalKnowledgePanel.width')).toBe('608')

    // 按右方向键收窄
    fireEvent.keyDown(resizer, { key: 'ArrowRight' })
    expect(localStorage.getItem('rhn.clinicalKnowledgePanel.width')).toBe('576')

    // 双击恢复默认
    fireEvent.doubleClick(resizer)
    expect(localStorage.getItem('rhn.clinicalKnowledgePanel.width')).toBeNull()
  })
})
