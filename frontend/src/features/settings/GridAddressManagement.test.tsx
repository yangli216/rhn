import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GridAddressNode, GridAddressUpdateInput, RhnApi } from '../../shared/rhnApi'
import { GridAddressManagement } from './GridAddressManagement'

const province: GridAddressNode = { id: 'province', revision: 1, level: 'PROVINCE', levelName: '省级', depth: 1,
  code: '110000000000', name: '测试省', pinyinCode: 'CSS', fullPath: '测试省', sortOrder: 0,
  status: 'ACTIVE', systemManaged: false, updatedAt: '2026-10-03T00:00:00Z' }
function setup(overrides: Record<string, unknown> = {}) {
  const api = { gridAddresses: { list: vi.fn().mockResolvedValue([province]), ...overrides } } as unknown as RhnApi
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={queryClient}><GridAddressManagement api={api} /></QueryClientProvider>)
  return { ...view, api, queryClient, user: userEvent.setup() }
}
async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '编辑网格' }))
  const dialog = within(screen.getByRole('dialog', { name: '编辑网格地址' }))
  await user.clear(dialog.getByRole('textbox', { name: /网格名称/ }))
  await user.type(dialog.getByRole('textbox', { name: /网格名称/ }), '草稿省名')
  return dialog
}

describe('grid address management verification', () => {
  it.each([null, {}, [{ ...province, status: undefined }], [{ ...province, parentId: 'missing' }]])('does not turn malformed catalogs into an empty or inactive tree %j', async response => {
    const list = vi.fn().mockResolvedValue(response)
    const { user } = setup({ list })
    expect(await screen.findByText('网格目录未确认')).toBeInTheDocument()
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增网格' })).toBeDisabled()
    expect(screen.queryByText('已停用')).not.toBeInTheDocument()
    list.mockResolvedValue([province])
    await user.click(screen.getByRole('button', { name: '重新加载网格' }))
    expect(await screen.findByRole('treeitem', { name: /测试省/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增网格' })).toBeEnabled()
  })

  it('allows a verified empty catalog to create its first province', async () => {
    const { user } = setup({ list: vi.fn().mockResolvedValue([]) })
    expect(await screen.findByRole('treeitem', { name: /全国网格/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新增网格' }))
    expect(screen.getByRole('dialog', { name: '新增网格地址' })).toBeInTheDocument()
  })

  it('keeps stale update responses unconfirmed and preserves the editor', async () => {
    const update = vi.fn().mockResolvedValue(province)
    const { user } = setup({ update })
    const dialog = await edit(user)
    await user.click(dialog.getByRole('button', { name: '保存网格' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/保存目标、修订或固定属性不符/)
    expect(dialog.getByRole('textbox', { name: /网格名称/ })).toHaveValue('草稿省名')
    expect(screen.queryByText(/已保存网格/)).not.toBeInTheDocument()
  })

  it('retains the original revision and draft across successful and failed refreshes', async () => {
    let result = province, failed = false
    const list = vi.fn().mockImplementation(async () => { if (failed) throw new Error('目录断线'); return [result] })
    const update = vi.fn().mockRejectedValue(new Error('修订冲突'))
    const { user, queryClient } = setup({ list, update })
    const dialog = await edit(user)
    result = { ...province, name: '后台修改', fullPath: '后台修改', revision: 2 }
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['grid-addresses'] }) })
    expect(dialog.getByRole('textbox', { name: /网格名称/ })).toHaveValue('草稿省名')
    failed = true
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['grid-addresses'] }) })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存网格' })).toBeDisabled())
    expect(screen.queryByRole('button', { name: '停用网格' })).not.toBeInTheDocument()
    failed = false
    await user.click(dialog.getByRole('button', { name: '重新确认网格' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存网格' })).toBeEnabled())
    await user.click(dialog.getByRole('button', { name: '保存网格' }))
    expect(update).toHaveBeenCalledWith(province.id, expect.objectContaining({ expectedRevision: 1, name: '草稿省名' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('修订冲突')
  })

  it('rejects empty sort order instead of silently submitting zero', async () => {
    const update = vi.fn()
    const { user } = setup({ update })
    const dialog = await edit(user)
    await user.clear(dialog.getByRole('spinbutton', { name: '排序号' }))
    await user.click(dialog.getByRole('button', { name: '保存网格' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('整数排序号')
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps a create draft when the server returns an existing node', async () => {
    const create = vi.fn().mockResolvedValue(province)
    const { user } = setup({ create })
    await screen.findByRole('button', { name: '编辑网格' })
    await user.click(screen.getByRole('button', { name: '新增网格' }))
    const dialog = within(screen.getByRole('dialog', { name: '新增网格地址' }))
    await user.type(dialog.getByRole('textbox', { name: /统计用区划代码/ }), '110100000000')
    await user.type(dialog.getByRole('textbox', { name: /网格名称/ }), '新市')
    await user.type(dialog.getByRole('textbox', { name: /拼音码/ }), 'XS')
    await user.click(dialog.getByRole('button', { name: '保存网格' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/创建结果指向已有网格/)
    expect(dialog.getByRole('textbox', { name: /网格名称/ })).toHaveValue('新市')
  })

  it('closes only on a confirmed save and invalidates cached address-picker options', async () => {
    let result = province
    const list = vi.fn().mockImplementation(async () => [result])
    const update = vi.fn().mockImplementation(async (_id: string, input: GridAddressUpdateInput) => {
      result = { ...province, ...input, revision: 2, fullPath: input.name }
      return result
    })
    const { user, queryClient } = setup({ list, update })
    queryClient.setQueryData(['grid-address-options', 3], [province])
    const dialog = await edit(user)
    await user.click(dialog.getByRole('button', { name: '保存网格' }))
    expect(await screen.findByText('已保存网格“草稿省名”')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑网格地址' })).not.toBeInTheDocument())
    expect(queryClient.getQueryState(['grid-address-options', 3])?.isInvalidated).toBe(true)
    expect(await screen.findByRole('treeitem', { name: /草稿省名/ })).toBeInTheDocument()
  })

  it('retries a lost status response with the original target and revision after refetch changed the state', async () => {
    let result = province
    const changeStatus = vi.fn().mockImplementation(async () => {
      result = { ...province, status: 'INACTIVE', revision: 2 }
      throw new Error('状态保存响应丢失，请核实')
    })
    const { user } = setup({ changeStatus, list: vi.fn().mockImplementation(async () => [result]) })
    await user.click(await screen.findByRole('button', { name: '停用网格' }))
    await screen.findByRole('button', { name: '启用网格' })
    await user.click(screen.getByRole('button', { name: '重试本次状态操作' }))
    expect(changeStatus).toHaveBeenCalledTimes(2)
    for (const call of changeStatus.mock.calls) expect(call).toEqual([province, 'INACTIVE'])
    expect(screen.queryByText(/状态已更新/)).not.toBeInTheDocument()
  })

  it('locks a pending editor and ignores late results from a replaced API context', async () => {
    let resolve!: (result: GridAddressNode) => void
    const update = vi.fn().mockImplementation(() => new Promise<GridAddressNode>(done => { resolve = done }))
    const { user, api, queryClient, rerender } = setup({ update })
    const dialog = await edit(user)
    await user.click(dialog.getByRole('button', { name: '保存网格' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(dialog.getByRole('textbox', { name: /网格名称/ }).closest('form')).toHaveAttribute('inert')
    expect(dialog.getByRole('button', { name: '取消' })).toBeDisabled()
    const otherApi = { ...api }
    rerender(<QueryClientProvider client={queryClient}><GridAddressManagement api={otherApi} /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await act(async () => { resolve({ ...province, name: '草稿省名', fullPath: '草稿省名', revision: 2 }) })
    expect(screen.queryByText(/已保存网格/)).not.toBeInTheDocument()
  })
})
