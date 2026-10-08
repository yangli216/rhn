import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { StandardMappingDialog } from './BasicDataManagement'
import { requireStandardMappings, assertMappingStatusCommand, verifyMappingStatusReceipt, requirePersistedMappings } from './standardMappingFacts'
import type { ItemTermMapping, ItemTermMappingMaintenance, RhnApi } from '../../shared/rhnApi'

const row: ItemTermMapping = { id: 'mapping', revision: 1, subjectId: 'subject', subjectType: 'CATALOG_ITEM', targetId: 'item',
  conceptId: 'term', codeSystemId: 'system', systemCode: 'ICD', systemName: '标准发布版', systemVersion: '2026', authorityType: 'NATIONAL',
  termCode: 'A01', termDisplay: '标准术语', mappingType: 'CLINICAL', equivalence: 'EXACT', primaryMapping: true,
  limitation: '限制范围', validFrom: '2020-01-01', validTo: '2099-12-31', status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z', createdBy: 'user', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 'user' }
function snapshot(rows = [row], businessDate = new Date().toISOString().slice(0, 10)): ItemTermMappingMaintenance {
  return { subjectId: 'subject', subjectType: 'CATALOG_ITEM', targetId: 'item', businessDate, history: rows,
    effectiveMappings: rows.filter(value => value.status !== 'SUSPENDED' && value.validFrom <= businessDate && (!value.validTo || value.validTo >= businessDate)) }
}
const paused = { ...row, status: 'SUSPENDED' as const, revision: 2, updatedAt: '2026-10-03T01:00:00Z' }
const command = { original: row, status: 'SUSPENDED' as const }
function fixture() {
  return { masterData: { itemTermMappings: vi.fn().mockImplementation(async (_subject, _id, at) => snapshot([row], at)),
    standardCodeSystems: vi.fn().mockResolvedValue([]), standardTerms: vi.fn().mockResolvedValue([]),
    changeItemTermMappingStatus: vi.fn().mockResolvedValue(snapshot([paused])), saveItemTermMapping: vi.fn() } }
}
function setup(api = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), onClose = vi.fn()
  const content = (value = api) => <QueryClientProvider client={client}><StandardMappingDialog api={value as unknown as RhnApi}
    subjectType="CATALOG_ITEM" targetId="item" itemName="项目" systemType="SERVICE" onClose={onClose} /></QueryClientProvider>
  const view = render(content())
  return { api, client, onClose, switchApi: (value: ReturnType<typeof fixture>) => view.rerender(content(value)) }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

describe('standard mapping facts and status receipts', () => {
  it.each([undefined, {}, { ...snapshot(), history: undefined }, { ...snapshot(), targetId: 'other' },
    { ...snapshot(), history: [row, row] }, { ...snapshot(), effectiveMappings: [] },
    snapshot([{ ...row, validTo: '2019-01-01' }]), snapshot([{ ...row, subjectId: 'other' }]),
    snapshot([{ ...row, status: 'RETIRED', validTo: undefined }]), snapshot([{ ...row, createdAt: 'invalid' }]),
    { ...snapshot(), effectiveMappings: [{ ...row, primaryMapping: false }] },
  ])('rejects missing or contradictory facts %#', value => {
    expect(() => requireStandardMappings(value, snapshot())).toThrow('标准映射数据')
  })
  it('accepts actual empty history and historical retired mappings within their date range', () => {
    expect(requireStandardMappings(snapshot([]), snapshot())).toEqual(snapshot([]))
    const value = snapshot([{ ...row, status: 'RETIRED', validTo: '2026-10-03' }], '2026-10-02')
    expect(requireStandardMappings(value, value).effectiveMappings).toHaveLength(1)
  })
  it.each(['validTo', 'conceptId', 'codeSystemId', 'systemName', 'termCode', 'equivalence', 'primaryMapping', 'limitation', 'validFrom', 'createdAt', 'createdBy', 'revision', 'status'] as const)(
    'rejects a receipt changing or failing to confirm %s', field => {
      const bad = { ...paused, [field]: field === 'validTo' ? undefined : field === 'revision' ? 1 : field === 'status' ? 'ACTIVE'
        : field === 'primaryMapping' ? false : field === 'validFrom' ? '2021-01-01' : field === 'createdAt' ? '2026-02-01T00:00:00Z'
        : field === 'equivalence' ? 'RELATED' : 'other' }
      expect(() => verifyMappingStatusReceipt(snapshot([bad]), snapshot(), command)).toThrow()
    })
  it('requires unchanged unrelated history and reread identity, not merely matching status', () => {
    const other = { ...row, id: 'other' }, before = snapshot([row, other])
    expect(() => verifyMappingStatusReceipt(snapshot([paused]), before, command)).toThrow()
    expect(() => verifyMappingStatusReceipt(snapshot([paused, { ...other, limitation: 'changed' }]), before, command)).toThrow()
    const receipt = verifyMappingStatusReceipt(snapshot([paused, other]), before, command)
    expect(() => requirePersistedMappings(receipt, snapshot([paused, other], '2100-01-01'))).not.toThrow()
    expect(() => requirePersistedMappings(receipt, snapshot([row, other]))).toThrow()
    expect(() => requirePersistedMappings(receipt, snapshot([{ ...paused, id: 'different' }, other]))).toThrow()
  })
  it('requires explicit valid retirement date and preserves expiry on resume', () => {
    expect(() => assertMappingStatusCommand(snapshot(), { original: row, status: 'RETIRED', validTo: '2019-01-01' })).toThrow('不能早于')
    expect(() => assertMappingStatusCommand(snapshot(), { ...command, validTo: '2099-12-31' })).toThrow('不能修改')
    expect(() => verifyMappingStatusReceipt(snapshot([{ ...row, revision: 3 }]), snapshot([paused]), { original: paused, status: 'ACTIVE' })).not.toThrow()
    expect(() => verifyMappingStatusReceipt(snapshot([{ ...row, revision: 2, status: 'RETIRED', validTo: '2026-10-03' }]), snapshot(),
      { original: row, status: 'RETIRED', validTo: '2026-10-03' })).not.toThrow()
  })
})

describe('standard mapping status UI', () => {
  it.each(['network', 'malformed'])('does not turn %s reads into empty business history', async kind => {
    const api = fixture()
    if (kind === 'network') api.masterData.itemTermMappings.mockRejectedValueOnce(new Error('连接失败'))
    else api.masterData.itemTermMappings.mockResolvedValueOnce({})
    setup(api)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('当前日期暂无有效映射')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无映射历史')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增映射' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '重新核实映射' }))
    expect(await screen.findByRole('button', { name: '暂停' })).toBeEnabled()
  })
  it('pauses only after receipt and reread agree while retaining the editor draft', async () => {
    const api = fixture(); setup(api)
    await screen.findByRole('button', { name: '暂停' })
    fireEvent.change(screen.getByLabelText('限制使用范围'), { target: { value: '未提交草稿' } })
    api.masterData.itemTermMappings.mockImplementation(async (_subject, _id, at) => snapshot([paused], at))
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(await screen.findByRole('button', { name: '恢复' })).toBeEnabled()
    expect(api.masterData.changeItemTermMappingStatus).toHaveBeenCalledExactlyOnceWith('mapping', 1, 'SUSPENDED', undefined)
    expect(screen.getByLabelText('限制使用范围')).toHaveValue('未提交草稿')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('至 2099-12-31')).toBeInTheDocument()
  })
  it.each(['wrong-receipt', 'unchanged-read', 'failed-read'])('keeps %s unconfirmed and never clears the draft', async kind => {
    const api = fixture(); setup(api)
    await screen.findByRole('button', { name: '暂停' })
    fireEvent.change(screen.getByLabelText('限制使用范围'), { target: { value: '保留草稿' } })
    if (kind === 'wrong-receipt') api.masterData.changeItemTermMappingStatus.mockResolvedValue(snapshot([{ ...paused, validTo: undefined }]))
    if (kind === 'failed-read') api.masterData.itemTermMappings.mockRejectedValueOnce(new Error('读取失败'))
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '恢复' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('限制使用范围')).toHaveValue('保留草稿')
    expect(screen.getByRole('button', { name: '新增映射' })).toBeDisabled()
  })
  it('does not silently adjust retirement dates before the mapping starts', async () => {
    const api = fixture(); setup(api)
    await screen.findByRole('button', { name: '停用' })
    fireEvent.change(screen.getByLabelText('业务日期'), { target: { value: '2019-01-01' } })
    await userEvent.click(await screen.findByRole('button', { name: '停用' }))
    expect(await screen.findByText(/停用日期不能早于/)).toBeInTheDocument()
    expect(api.masterData.changeItemTermMappingStatus).not.toHaveBeenCalled()
  })
  it('locks duplicate writes and closing, and ignores responses from an old API context', async () => {
    const api = fixture(), pending = deferred<ItemTermMappingMaintenance>()
    api.masterData.changeItemTermMappingStatus.mockReturnValue(pending.promise)
    const view = setup(api)
    await userEvent.click(await screen.findByRole('button', { name: '暂停' }))
    expect(screen.getByRole('button', { name: '停用' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' }); expect(view.onClose).not.toHaveBeenCalled()
    const next = fixture(); view.switchApi(next)
    await screen.findByRole('button', { name: '暂停' })
    await act(async () => pending.resolve(snapshot([paused])))
    expect(screen.queryByRole('button', { name: '恢复' })).not.toBeInTheDocument()
    expect(next.masterData.itemTermMappings).toHaveBeenCalledTimes(1)
    expect(api.masterData.itemTermMappings).toHaveBeenCalledTimes(1)
  })
})
