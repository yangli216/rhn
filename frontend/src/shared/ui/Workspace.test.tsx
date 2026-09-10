import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DataTable, SearchField, tableCellClass, Tabs } from './Workspace'

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

  it('provides explicit semantic classes for matching table headers and cells', () => {
    render(<DataTable><thead><tr>
      <th className={tableCellClass('text')}>项目</th>
      <th className={tableCellClass('numeric')}>金额</th>
      <th className={tableCellClass('status')}>状态</th>
    </tr></thead><tbody><tr>
      <td className={tableCellClass('text')}>诊查费</td>
      <td className={tableCellClass('numeric')}>12.00</td>
      <td className={tableCellClass('status')}>已结算</td>
    </tr></tbody></DataTable>)

    expect(screen.getByRole('columnheader', { name: '金额' })).toHaveClass('ui-table-cell--numeric')
    expect(screen.getByRole('cell', { name: '12.00' })).toHaveClass('ui-table-cell--numeric')
    expect(screen.getByRole('columnheader', { name: '状态' })).toHaveClass('ui-table-cell--status')
    expect(screen.getByRole('cell', { name: '已结算' })).toHaveClass('ui-table-cell--status')
  })
})
