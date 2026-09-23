import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './index'

describe('Pagination Component', () => {
  it('renders default full mode correctly with all elements', async () => {
    const handleChange = vi.fn()
    const handleSizeChange = vi.fn()

    render(
      <Pagination
        page={0}
        totalPages={5}
        total={98}
        pageSize={20}
        onChange={handleChange}
        onPageSizeChange={handleSizeChange}
        label="测试完整分页"
      />
    )

    const nav = screen.getByRole('navigation', { name: '测试完整分页' })
    expect(nav).toHaveClass('ui-pagination--full')
    expect(within(nav).getByText('共 98 条记录')).toBeInTheDocument()
    expect(within(nav).getByText('每页显示')).toBeInTheDocument()

    const select = within(nav).getByRole('combobox', { name: '每页显示条数' })
    expect(select).toHaveValue('20')

    const prevBtn = within(nav).getByRole('button', { name: '上一页' })
    const nextBtn = within(nav).getByRole('button', { name: '下一页' })
    expect(prevBtn).toBeDisabled()
    expect(nextBtn).toBeEnabled()

    await userEvent.click(nextBtn)
    expect(handleChange).toHaveBeenCalledWith(1)

    await userEvent.selectOptions(select, '50')
    expect(handleSizeChange).toHaveBeenCalledWith(50)
  })

  it('renders compact mode without redundant text and with compact styling classes', async () => {
    const handleChange = vi.fn()
    const handleSizeChange = vi.fn()

    render(
      <Pagination
        mode="compact"
        page={1}
        totalPages={4}
        total={72}
        pageSize={20}
        onChange={handleChange}
        onPageSizeChange={handleSizeChange}
        pageSizeOptions={[20, 50, 100]}
        label="测试紧凑分页"
      />
    )

    const nav = screen.getByRole('navigation', { name: '测试紧凑分页' })
    expect(nav).toHaveClass('ui-pagination--compact')

    // Still shows total records for full accessibility and test compatibility
    expect(within(nav).getByText('共 72 条记录')).toBeInTheDocument()

    // Does NOT render redundant "每页显示" label text to save horizontal space
    expect(within(nav).queryByText('每页显示')).not.toBeInTheDocument()

    // Still has the accessible select input with aria-label
    const select = within(nav).getByRole('combobox', { name: '每页显示条数' })
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('20')

    // Option labels are suffixed with "条/页" in compact mode
    expect(within(select).getByRole('option', { name: '20 条/页' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: '50 条/页' })).toBeInTheDocument()

    const prevBtn = within(nav).getByRole('button', { name: '上一页' })
    const nextBtn = within(nav).getByRole('button', { name: '下一页' })
    expect(prevBtn).toBeEnabled()
    expect(nextBtn).toBeEnabled()

    await userEvent.click(prevBtn)
    expect(handleChange).toHaveBeenCalledWith(0)
  })

  it('renders simple mode without page size changer', () => {
    render(
      <Pagination
        mode="simple"
        page={0}
        totalPages={3}
        total={30}
        pageSize={10}
        onChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        label="测试简洁分页"
      />
    )

    const nav = screen.getByRole('navigation', { name: '测试简洁分页' })
    expect(nav).toHaveClass('ui-pagination--simple')
    expect(within(nav).getByText('共 30 条记录')).toBeInTheDocument()
    expect(within(nav).queryByRole('combobox', { name: '每页显示条数' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: '上一页' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: '下一页' })).toBeInTheDocument()
  })

  it('renders mini mode with compact arrow buttons and no total/size changer', () => {
    render(
      <Pagination
        mode="mini"
        page={2}
        totalPages={5}
        total={50}
        onChange={vi.fn()}
        label="测试微型分页"
      />
    )

    const nav = screen.getByRole('navigation', { name: '测试微型分页' })
    expect(nav).toHaveClass('ui-pagination--mini')
    expect(within(nav).queryByText('共 50 条记录')).not.toBeInTheDocument()
    expect(within(nav).queryByRole('combobox', { name: '每页显示条数' })).not.toBeInTheDocument()

    const prevBtn = within(nav).getByRole('button', { name: '上一页' })
    const nextBtn = within(nav).getByRole('button', { name: '下一页' })
    expect(prevBtn).toHaveTextContent('‹')
    expect(nextBtn).toHaveTextContent('›')
    expect(within(nav).getByText('3')).toBeInTheDocument()
    expect(within(nav).getByText('/ 5')).toBeInTheDocument()
  })
})
