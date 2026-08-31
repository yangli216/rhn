import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SearchField, Tabs } from './Workspace'

function TabsExample() {
  const [value, setValue] = useState<'first' | 'second'>('first')
  return <Tabs value={value} onChange={setValue} label="示例页签" items={[
    { value: 'first', label: '第一个', panelId: 'first-panel' },
    { value: 'second', label: '第二个', panelId: 'second-panel' },
  ]} />
}

function SearchExample() {
  const [value, setValue] = useState('已有内容')
  return <SearchField label="搜索参数" value={value} onChange={setValue} placeholder="输入关键词" />
}

describe('Workspace primitives', () => {
  it('activates and focuses the next tab with the keyboard', async () => {
    render(<TabsExample />)
    const first = screen.getByRole('tab', { name: '第一个' })
    const second = screen.getByRole('tab', { name: '第二个' })
    first.focus()

    await userEvent.keyboard('{ArrowRight}')

    expect(second).toHaveFocus()
    expect(second).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveAttribute('aria-selected', 'false')
  })

  it('provides a consistent accessible clear action for searches', async () => {
    render(<SearchExample />)

    await userEvent.click(screen.getByRole('button', { name: '清空搜索参数' }))

    const searchbox = screen.getByRole('searchbox', { name: '搜索参数' })
    expect(searchbox).toHaveValue('')
    expect(searchbox).toHaveFocus()
  })
})
