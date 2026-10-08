import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { GridAddressNode } from '../api/gridAddressApi'
import { GridAddressInput, type GridAddressInputProps, type GridAddressValue } from './GridAddressInput'

const levels: GridAddressNode['level'][] = ['PROVINCE', 'CITY', 'COUNTY', 'STREET', 'COMMUNITY']
const names = ['测试省', '测试市', '测试县', '测试街道', '测试社区']
const codes = ['110000000000', '110100000000', '110101000000', '110101001000', '110101001001']
const nodes: GridAddressNode[] = levels.map((level, index) => ({ id: `node-${index}`, revision: 1, level,
  levelName: names[index], depth: index + 1, code: codes[index], name: names[index], pinyinCode: `CS${index}`,
  parentId: index ? `node-${index - 1}` : undefined, fullPath: names.slice(0, index + 1).join('/'),
  sortOrder: index, status: 'ACTIVE', systemManaged: false, updatedAt: '2026-10-03T00:00:00Z' }))
const selected: GridAddressValue = { provinceCode: codes[0], cityCode: codes[1], districtCode: codes[2], streetCode: codes[3], communityCode: codes[4] }

function setup({ value = {}, depth = 5, list = vi.fn().mockResolvedValue(nodes), onChange = vi.fn() }: {
  value?: GridAddressValue; depth?: 3 | 5; list?: Mock<GridAddressInputProps['api']['list']>; onChange?: Mock<GridAddressInputProps['onChange']>
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = { list }
  const view = render(<QueryClientProvider client={queryClient}><GridAddressInput api={api} levels={depth} value={value} onChange={onChange} /></QueryClientProvider>)
  return { ...view, queryClient, api, list, onChange, user: userEvent.setup() }
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole('combobox', { name: '网格地址' })).toBeEnabled())
  await user.click(screen.getByRole('combobox', { name: '网格地址' }))
  return within(await screen.findByRole('dialog', { name: '选择网格地址' }))
}

describe('GridAddressInput facts and selection', () => {
  it.each([null, {}, [nodes[1]], [nodes[0], { ...nodes[1], parentId: nodes[1].id }],
    [{ ...nodes[0], status: undefined }], [{ ...nodes[0], status: 'INACTIVE' }],
    [nodes[0], nodes[0]], [{ ...nodes[0], depth: 2 }], [{ ...nodes[0], fullPath: '其他路径' }],
  ])('rejects malformed candidate directories without pretending there are no addresses %j', async source => {
    const { onChange } = setup({ list: vi.fn().mockResolvedValue(source), value: selected })
    expect(await screen.findByRole('alert')).toHaveTextContent(/网格地址加载失败/)
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('暂无下级区划')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects levels beyond the requested directory depth', async () => {
    setup({ depth: 3 })
    expect(await screen.findByRole('alert')).toHaveTextContent('超出请求层级')
  })

  it('keeps a failed lookup visible and recovers only with verified directory data', async () => {
    const list = vi.fn().mockRejectedValue(new Error('地址服务断线'))
    const { user, onChange } = setup({ list, value: selected })
    expect(await screen.findByRole('alert')).toHaveTextContent('地址服务断线')
    list.mockResolvedValue(nodes)
    await user.click(screen.getByRole('button', { name: '重新核实地址目录' }))
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent(names.join(' / ')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    { ...selected, cityCode: '999999999999' }, { ...selected, cityCode: undefined },
    { ...selected, provinceCode: codes[1] }, { provinceCode: codes[0] },
  ])('does not silently discard invalid or missing selected codes %j', async value => {
    const { onChange } = setup({ value })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('已有地址未确认')
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not combine independently valid nodes from different parents', async () => {
    const other = { ...nodes[0], id: 'other', code: '220000000000', name: '另一省', fullPath: '另一省' }
    setup({ list: vi.fn().mockResolvedValue([...nodes, other]), value: { ...selected, provinceCode: other.code } })
    expect(await screen.findByRole('alert')).toHaveTextContent('父子关系不一致')
    expect(screen.getByRole('combobox')).not.toHaveTextContent('另一省 / 测试市')
  })

  it('does not disguise deeper codes without a province/city/county as an empty three-level selection', async () => {
    setup({ depth: 3, list: vi.fn().mockResolvedValue(nodes.slice(0, 3)), value: { streetCode: codes[3] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('地址层级不完整')
    expect(screen.getByRole('combobox')).toHaveTextContent('已有地址未确认')
  })

  it('shows an explicitly empty catalog without emitting synthetic address codes', async () => {
    const { user, onChange } = setup({ list: vi.fn().mockResolvedValue([]) })
    const dialog = await open(user)
    expect(dialog.getByText('暂无下级区划')).toBeInTheDocument()
    expect(dialog.queryByRole('option')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([3, 5] as const)('commits a verified %i-level path by search', async depth => {
    const { user, onChange } = setup({ depth, list: vi.fn().mockResolvedValue(nodes.slice(0, depth)) })
    const dialog = await open(user)
    await user.type(dialog.getByRole('textbox', { name: '检索网格地址' }), codes[depth - 1])
    await user.click(dialog.getByRole('option'))
    expect(onChange).toHaveBeenCalledWith({ ...selected,
      streetCode: depth === 5 ? codes[3] : undefined, communityCode: depth === 5 ? codes[4] : undefined }, nodes.slice(0, depth))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not submit intermediate cascading selections', async () => {
    const { user, onChange } = setup()
    const dialog = await open(user)
    for (const [index, name] of names.entries()) {
      await user.click(dialog.getByRole('option', { name }))
      if (index < 4) expect(onChange).not.toHaveBeenCalled()
    }
    expect(onChange).toHaveBeenCalledWith(selected, nodes)
  })

  it('clears stale deeper codes when a three-level selection replaces a five-level value', async () => {
    const { user, onChange } = setup({ depth: 3, list: vi.fn().mockResolvedValue(nodes.slice(0, 3)), value: selected })
    const dialog = await open(user)
    await user.click(dialog.getByRole('option', { name: names[0] }))
    await user.click(dialog.getByRole('option', { name: names[1] }))
    await user.click(dialog.getByRole('option', { name: names[2] }))
    expect(onChange.mock.calls[0][0]).toEqual({ ...selected, streetCode: undefined, communityCode: undefined })
  })

  it('clears all five codes for a merging form consumer while preserving unrelated address fields', async () => {
    const list = vi.fn().mockResolvedValue(nodes), user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Form() {
      const [value, setValue] = useState({ ...selected, addressText: '门牌地址', primary: true })
      return <><GridAddressInput api={{ list }} value={value} onChange={grid => setValue(current => ({ ...current, ...grid }))} />
        <output aria-label="表单数据">{JSON.stringify(value)}</output></>
    }
    render(<QueryClientProvider client={queryClient}><Form /></QueryClientProvider>)
    const dialog = await open(user)
    await user.click(dialog.getByRole('button', { name: '清空选择' }))
    expect(screen.getByLabelText('表单数据')).toHaveTextContent('{"addressText":"门牌地址","primary":true}')
    expect(screen.getByRole('combobox')).toHaveTextContent('请选择省')
  })

  it('allows explicitly clearing a selected code that no longer exists without silently repairing it', async () => {
    const { user, onChange } = setup({ value: { ...selected, communityCode: '999999999999' } })
    await screen.findByRole('alert')
    const dialog = await open(user)
    await user.click(dialog.getByRole('button', { name: '清空选择' }))
    expect(onChange).toHaveBeenCalledWith({ provinceCode: undefined, cityCode: undefined, districtCode: undefined, streetCode: undefined, communityCode: undefined }, [])
  })

  it('blocks stale options during refetch and preserves the unsubmitted draft through failure and recovery', async () => {
    const list = vi.fn().mockResolvedValue(nodes)
    const { user, queryClient, onChange } = setup({ list })
    let dialog = await open(user)
    await user.click(dialog.getByRole('option', { name: names[0] }))
    let reject!: (error: Error) => void
    list.mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['grid-address-options'] }) })
    await waitFor(() => expect(screen.getByRole('combobox')).toBeDisabled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => { reject(new Error('刷新失败')) })
    expect(await screen.findByRole('alert')).toHaveTextContent('刷新失败')
    expect(onChange).not.toHaveBeenCalled()
    list.mockResolvedValue(nodes)
    await user.click(screen.getByRole('button', { name: '重新核实地址目录' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByRole('option', { name: names[0] })).toHaveAttribute('aria-selected', 'true')
    expect(dialog.getByRole('option', { name: names[1] })).toBeInTheDocument()
  })

  it('resets an open draft when the controlled address is replaced externally', async () => {
    const { user, queryClient, api, onChange, rerender } = setup({ value: selected })
    await open(user)
    rerender(<QueryClientProvider client={queryClient}><GridAddressInput api={api} value={{}} onChange={onChange} /></QueryClientProvider>)
    await waitFor(() => expect(within(screen.getByRole('dialog')).queryByRole('option', { name: names[1] })).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not commit a stale search result when the control becomes disabled', async () => {
    const { user, queryClient, api, onChange, rerender } = setup()
    const dialog = await open(user)
    await user.type(dialog.getByRole('textbox', { name: '检索网格地址' }), names[4])
    const result = dialog.getByRole('option')
    rerender(<QueryClientProvider client={queryClient}><GridAddressInput api={api} disabled onChange={onChange} /></QueryClientProvider>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(result)
    expect(onChange).not.toHaveBeenCalled()
  })
})
