import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ModuleSearch } from './ModuleSearch'

it('searches nested categories and names, opens a result, and reports no matches', () => {
  const onNavigate = vi.fn()
  render(<ModuleSearch nodes={[
    { id: 'analytics', label: '智能统计分析', to: '/analytics' },
    { id: 'outpatient', label: '门诊诊疗', children: [{ id: 'query', label: '挂号查询', to: '/query' }] },
  ]} onNavigate={onNavigate} />)
  fireEvent.click(screen.getByRole('button', { name: '搜索模块' }))
  const input = screen.getByRole('searchbox')
  expect(input).toHaveFocus()
  fireEvent.change(input, { target: { value: '门诊 查询' } })
  expect(screen.queryByRole('button', { name: /智能统计分析/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /挂号查询/ })).toBeInTheDocument()
  fireEvent.change(input, { target: { value: '不存在' } })
  expect(screen.getByRole('status')).toHaveTextContent('找到 0 个模块')
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onNavigate).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '统计' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onNavigate).toHaveBeenCalledWith('/analytics')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.keyDown(window, { ctrlKey: true, key: 'k' })
  expect(within(screen.getByRole('dialog')).getByRole('searchbox')).toHaveValue('')
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
