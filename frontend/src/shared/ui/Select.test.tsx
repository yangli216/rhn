import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

describe('Select', () => {
  const options = [
    { value: 'PO', label: '口服' },
    { value: 'IV', label: '静脉滴注' },
    { value: 'EXT', label: '外用' },
  ]

  it('renders correctly and allows selecting an option by click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select id="test-select" aria-label="给药途径" value="PO" onChange={onChange} options={options} />)

    const trigger = screen.getByRole('combobox', { name: '给药途径' })
    expect(trigger).toHaveTextContent('口服')

    await user.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    const ivOption = screen.getByRole('option', { name: /静脉滴注/ })
    await user.click(ivOption)

    expect(onChange).toHaveBeenCalledWith('IV', expect.objectContaining({ value: 'IV', label: '静脉滴注' }))
  })

  it('automatically opens on focus when openOnFocus is true and allows single Enter commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSelectionCommit = vi.fn()

    render(
      <div>
        <input id="prev-input" aria-label="前序输入" />
        <Select
          id="focus-select"
          aria-label="给药途径"
          value="IV"
          openOnFocus
          onChange={onChange}
          onSelectionCommit={onSelectionCommit}
          options={options}
        />
      </div>
    )

    const prevInput = screen.getByLabelText('前序输入')
    await user.click(prevInput)

    // Focus into the select trigger (simulating Tab or programmatic focus)
    await user.tab()

    // It should automatically open popover and focus the search box
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    const searchInput = screen.getByPlaceholderText('搜索名称、编码或拼音首字母')
    await waitFor(() => expect(searchInput).toHaveFocus())

    // Pressing Enter once confirms the active preselected option ("静脉滴注")
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('IV', expect.objectContaining({ value: 'IV', label: '静脉滴注' }))
    expect(onSelectionCommit).toHaveBeenCalledWith(expect.objectContaining({ value: 'IV', label: '静脉滴注' }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('allows searching and pressing Enter to select filtered option when openOnFocus is true', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSelectionCommit = vi.fn()

    render(
      <div>
        <button id="prev-btn">前序按钮</button>
        <Select
          id="focus-select-2"
          aria-label="给药途径"
          value="PO"
          openOnFocus
          onChange={onChange}
          onSelectionCommit={onSelectionCommit}
          options={options}
        />
      </div>
    )

    await user.click(screen.getByRole('button', { name: '前序按钮' }))
    await user.tab()

    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    const searchInput = screen.getByPlaceholderText('搜索名称、编码或拼音首字母')
    await waitFor(() => expect(searchInput).toHaveFocus())

    // Type "wy" to search for "外用"
    await user.keyboard('wy')
    expect(screen.getByRole('option', { name: /外用/ })).toBeInTheDocument()

    // Press Enter to select "外用"
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('EXT', expect.objectContaining({ value: 'EXT', label: '外用' }))
    expect(onSelectionCommit).toHaveBeenCalledWith(expect.objectContaining({ value: 'EXT', label: '外用' }))
  })

  it('renders hierarchical options as an expandable searchable tree', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select aria-label="与患者关系" value="" onChange={onChange} showValue options={[
      { value: '1', label: '配偶' },
      { value: '11', label: '夫', parentValue: '1' },
      { value: '12', label: '妻', parentValue: '1' },
      { value: '2', label: '子' },
      { value: '21', label: '独生子', parentValue: '2' },
    ]} />)

    await user.click(screen.getByRole('combobox', { name: '与患者关系' }))
    expect(screen.getByRole('tree')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /配偶/ })).toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: /夫/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开 配偶' }))
    await user.click(screen.getByRole('treeitem', { name: /^夫/ }))
    expect(onChange).toHaveBeenCalledWith('11', expect.objectContaining({ parentValue: '1' }))

    await user.click(screen.getByRole('combobox', { name: '与患者关系' }))
    await user.type(screen.getByPlaceholderText('搜索名称、编码或拼音首字母'), '独生子')
    expect(screen.getByRole('treeitem', { name: /^子\s*2$/ })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /独生子/ })).toBeInTheDocument()
  })

  it('only allows selecting leaf nodes when leafOnly is enabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select aria-label="与患者关系" value="" onChange={onChange} leafOnly showValue options={[
      { value: '0', label: '本人' },
      { value: '01', label: '户主本人', parentValue: '0' },
      { value: '1', label: '配偶' },
      { value: '11', label: '夫', parentValue: '1' },
      { value: '12', label: '妻', parentValue: '1' },
    ]} />)

    await user.click(screen.getByRole('combobox', { name: '与患者关系' }))
    const spouseNode = screen.getByRole('treeitem', { name: /配偶/ })
    expect(spouseNode).toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: /夫/ })).not.toBeInTheDocument()

    // 点击非叶子节点（配偶），不应触发 onChange，而应展开显示子节点
    await user.click(spouseNode)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('treeitem', { name: /^夫/ })).toBeInTheDocument()

    // 再次点击配偶，不应触发 onChange，而应收起子节点
    await user.click(spouseNode)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('treeitem', { name: /^夫/ })).not.toBeInTheDocument()

    // 展开并点击叶子节点（夫），正常触发选择
    await user.click(spouseNode)
    await user.click(screen.getByRole('treeitem', { name: /^夫/ }))
    expect(onChange).toHaveBeenCalledWith('11', expect.objectContaining({ value: '11', label: '夫' }))
  })
})
