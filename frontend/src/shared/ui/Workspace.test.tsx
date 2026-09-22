import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState, type RefObject } from 'react'
import { describe, expect, it } from 'vitest'
import { DataTable, SearchField, TableShell, tableCellClass, Tabs } from './Workspace'

function TabsExample() {
  const [value, setValue] = useState<'first' | 'second'>('first')
  return <Tabs value={value} onChange={setValue} label="示例页签" items={[
    { value: 'first', label: '第一个', panelId: 'first-panel' },
    { value: 'second', label: '第二个', panelId: 'second-panel' },
  ]} />
}

function SearchExample({ inputRef }: { inputRef?: RefObject<HTMLInputElement | null> }) {
  const [value, setValue] = useState('已有内容')
  return <SearchField inputRef={inputRef} label="搜索参数" value={value} onChange={setValue} placeholder="输入关键词" />
}

describe('Workspace primitives', () => {
  it('keeps table footer outside scrolling data and resets both axes when paging', () => {
    const table = (page: number) => <TableShell scrollLabel="可滚动结果" resetScrollKey={page} footer={<span>固定分页</span>}>
      <DataTable><tbody><tr><td>第 {page} 页</td></tr></tbody></DataTable>
    </TableShell>
    const { rerender } = render(table(1))
    const region = screen.getByRole('region', { name: '可滚动结果' })
    expect(region).not.toContainElement(screen.getByText('固定分页'))
    expect(region).toHaveAttribute('tabindex', '0')
    region.scrollTop = 800; region.scrollLeft = 100
    rerender(table(1))
    expect(region.scrollTop).toBe(800)
    rerender(table(2))
    expect(region.scrollTop).toBe(0)
    expect(region.scrollLeft).toBe(0)
    expect(screen.getByRole('cell', { name: '第 2 页' })).toBeInTheDocument()
  })

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

    expect(screen.getByRole('searchbox', { name: '搜索参数' })).toHaveValue('已有内容')
    await userEvent.click(screen.getByRole('button', { name: '清空搜索参数' }))

    const searchbox = screen.getByRole('searchbox', { name: '搜索参数' })
    expect(searchbox).toHaveValue('')
    expect(searchbox).toHaveFocus()
  })

  it('supports shortcut focus through an external ref and restores it after clearing', async () => {
    const inputRef = createRef<HTMLInputElement>()
    render(<SearchExample inputRef={inputRef} />)
    inputRef.current?.focus()
    expect(screen.getByRole('searchbox', { name: '搜索参数' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: '清空搜索参数' }))
    expect(inputRef.current).toHaveFocus()
    expect(inputRef.current).toHaveValue('')
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
