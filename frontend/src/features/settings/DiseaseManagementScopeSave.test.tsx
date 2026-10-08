import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { BasicDataManagement, DiseaseManagementMembersDialog } from './BasicDataManagement'
import type { Organization } from '../../shared/model'
import { scopeProgram, savedScope } from './diseaseScopeReceipt.testFixtures'

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(onSave = vi.fn().mockResolvedValue(savedScope())) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const props = { program: structuredClone(scopeProgram), api: { masterData: {} } as RhnApi,
    dictionaries: {}, codeSystems: [], onClose: vi.fn(), onSave, onSaved: vi.fn() }
  const view = (changes: Partial<typeof props> = {}) => <QueryClientProvider client={client}>
    <DiseaseManagementMembersDialog {...props} {...changes} /></QueryClientProvider>
  return { ...render(view()), props, view }
}
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: '保存识别范围' }))

function setupPage(onSave: ReturnType<typeof vi.fn>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const page = { content: [scopeProgram], page: 0, size: 20, totalElements: 1, totalPages: 1 }
  const api = { dictionaries: { resolve: vi.fn().mockResolvedValue([]) }, masterData: {
    diseaseCodeSystems: vi.fn().mockResolvedValue([]),
    searchDiseases: vi.fn().mockResolvedValue({ ...page, content: [], totalElements: 0, totalPages: 0 }),
    searchDiseaseManagementPrograms: vi.fn().mockResolvedValue(page), replaceDiseaseManagementScope: onSave,
  } } as unknown as RhnApi
  const view = (currentApi = api) => <QueryClientProvider client={client}>
    <BasicDataManagement api={currentApi} organization={{ id: 'organization' } as Organization}
      scope="disease" onNavigate={vi.fn()} /></QueryClientProvider>
  return { ...render(view()), api, view }
}

async function openScopeFromPage() {
  fireEvent.click(screen.getByRole('tab', { name: '管理规则' }))
  fireEvent.click(await screen.findByRole('button', { name: '配置识别范围' }))
  expect(await screen.findByRole('button', { name: '保存识别范围' })).toBeEnabled()
}

describe('disease scope save through the management page', () => {
  it('opens without another dialog and reports success only after verifying the saved scope', async () => {
    const onSave = vi.fn().mockResolvedValue(savedScope()); setupPage(onSave)
    await openScopeFromPage(); await act(async () => clickSave())
    expect(onSave).toHaveBeenCalledWith('program', 2, expect.any(Array),
      [{ conceptId: 'concept', inclusionMode: 'INCLUDE', note: '原有例外备注' }])
    expect(await screen.findByText('适用疾病范围已更新')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('does not close the actual page editor or announce success for an empty response', async () => {
    setupPage(vi.fn().mockResolvedValue(undefined)); await openScopeFromPage()
    await act(async () => clickSave())
    expect(await screen.findByRole('alert')).toHaveTextContent('保存未确认')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('适用疾病范围已更新')).not.toBeInTheDocument()
  })
  it('drops the old page editor when the API changes and ignores its late save receipt', async () => {
    const pending = deferred(), onSave = vi.fn().mockReturnValue(pending.promise)
    const h = setupPage(onSave); await openScopeFromPage(); clickSave()
    const nextSave = vi.fn()
    h.rerender(h.view({ ...h.api, masterData: { ...h.api.masterData, replaceDiseaseManagementScope: nextSave } }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => pending.resolve(savedScope()))
    expect(nextSave).not.toHaveBeenCalled()
    expect(screen.queryByText('适用疾病范围已更新')).not.toBeInTheDocument()
  })
})

describe('disease scope save workflow', () => {
  it('sends the original exception note and confirms only a matching saved receipt', async () => {
    const h = setup(); await act(async () => clickSave())
    expect(h.props.onSave).toHaveBeenCalledWith([expect.objectContaining({ note: '规则原备注' })],
      [{ conceptId: 'concept', inclusionMode: 'INCLUDE', note: '原有例外备注' }])
    expect(h.props.onSaved).toHaveBeenCalledTimes(1)
  })
  it.each([undefined, { ...savedScope(), revision: 2 }, { ...savedScope(), members: [] }])('keeps the editor open on unconfirmed receipt %#', async receipt => {
    const h = setup(vi.fn().mockResolvedValue(receipt)); await act(async () => clickSave())
    expect(await screen.findByRole('alert')).toHaveTextContent('保存未确认')
    expect(screen.getByRole('alert')).toHaveTextContent('未确认不代表已回滚')
    expect(screen.getByPlaceholderText('便于后续审查')).toHaveValue('规则原备注')
    expect(h.props.onSaved).not.toHaveBeenCalled(); expect(h.props.onClose).not.toHaveBeenCalled()
  })
  it('blocks duplicate submission and closing while the request is pending', async () => {
    const pending = deferred(); const h = setup(vi.fn().mockReturnValue(pending.promise))
    const saveButton = screen.getByRole('button', { name: '保存识别范围' })
    const cancelButton = screen.getByRole('button', { name: '取消' })
    fireEvent.click(saveButton); fireEvent.click(saveButton)
    expect(h.props.onSave).toHaveBeenCalledTimes(1)
    expect(cancelButton).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '关闭弹窗' }))
    expect(h.props.onClose).not.toHaveBeenCalled()
    await act(async () => pending.resolve(savedScope()))
    expect(h.props.onSaved).toHaveBeenCalledTimes(1)
  })
  it('retains edits after a transport failure and retries the same expected content', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('连接中断')).mockResolvedValueOnce(savedScope())
    const h = setup(onSave); await act(async () => clickSave())
    expect(await screen.findByRole('alert')).toHaveTextContent('连接中断')
    await act(async () => clickSave())
    expect(onSave.mock.calls[0]).toEqual(onSave.mock.calls[1])
    expect(h.props.onSaved).toHaveBeenCalledTimes(1)
  })
  it.each(['api', 'program', 'revision', 'unmount'] as const)('ignores a late save response after %s changes', async change => {
    const pending = deferred(); const h = setup(vi.fn().mockReturnValue(pending.promise)); clickSave()
    await waitFor(() => expect(h.props.onSave).toHaveBeenCalledTimes(1))
    if (change === 'unmount') h.unmount()
    else h.rerender(h.view(change === 'api' ? { api: { ...h.props.api } }
      : { program: { ...scopeProgram, ...(change === 'program' ? { id: 'different' } : { revision: 4 }) } }))
    await act(async () => pending.resolve(savedScope()))
    expect(h.props.onSaved).not.toHaveBeenCalled(); expect(h.props.onClose).not.toHaveBeenCalled()
  })
})
