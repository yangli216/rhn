import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DictionarySelect } from './DictionarySelect'
import type { RhnApi } from '../rhnApi'

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('DictionarySelect', () => {
  const mockApi = {
    resolve: vi.fn().mockResolvedValue([
      { code: '0', name: '本人', sortOrder: 0, parentCode: undefined },
      { code: '01', name: '户主本人', sortOrder: 1, parentCode: '0' },
      { code: '1', name: '配偶', sortOrder: 2, parentCode: undefined },
      { code: '11', name: '夫', sortOrder: 3, parentCode: '1' },
      { code: '12', name: '妻', sortOrder: 4, parentCode: '1' },
    ]),
    get: vi.fn(),
  } as unknown as RhnApi['dictionaries']

  it('defaults to leafOnly=true and prevents selecting branch nodes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderWithClient(
      <DictionarySelect
        api={mockApi}
        dictionaryCode="PI_RELATED_PERSON_RELATIONSHIP"
        value=""
        onChange={onChange}
        aria-label="与患者关系"
      />
    )

    await user.click(await screen.findByRole('combobox', { name: '与患者关系' }))

    // 点击大类父节点“本人”
    const selfNode = await screen.findByRole('treeitem', { name: /本人/ })
    await user.click(selfNode)

    // 不应触发选中，而应展开显示“户主本人”
    expect(onChange).not.toHaveBeenCalled()
    const selfLeaf = await screen.findByRole('treeitem', { name: /户主本人/ })
    expect(selfLeaf).toBeInTheDocument()

    // 点击叶子节点“户主本人”
    await user.click(selfLeaf)
    expect(onChange).toHaveBeenCalledWith('01', expect.objectContaining({ value: '01', label: '户主本人' }))
  })

  it('allows selecting branch nodes when leafOnly is explicitly false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderWithClient(
      <DictionarySelect
        api={mockApi}
        dictionaryCode="PI_RELATED_PERSON_RELATIONSHIP"
        value=""
        leafOnly={false}
        onChange={onChange}
        aria-label="与患者关系"
      />
    )

    await user.click(await screen.findByRole('combobox', { name: '与患者关系' }))

    // 点击大类父节点“配偶”，由于 leafOnly=false，允许选中
    const spouseNode = await screen.findByRole('treeitem', { name: /配偶/ })
    await user.click(spouseNode)

    expect(onChange).toHaveBeenCalledWith('1', expect.objectContaining({ value: '1', label: '配偶' }))
  })
})
