import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { StandardMappingDialog } from './BasicDataManagement'
import { assertMappingSaveCommand, verifyMappingSaveReceipt, requireMappingSystems, requireMappingTerms,
  requireUnchangedMappingSelection, type MappingSaveCommand } from './standardMappingFacts'
import type { ItemTermMapping, ItemTermMappingMaintenance, StandardCodeSystem, StandardTerm, SaveItemTermMappingInput, RhnApi } from '../../shared/rhnApi'

const at = new Date().toISOString().slice(0, 10)
const system: StandardCodeSystem = { id: 'system', code: 'NATIONAL.SERVICE', name: '国家服务标准', version: '2026', systemType: 'SERVICE',
  authorityType: 'NATIONAL', status: 'ACTIVE', effectiveFrom: '2020-01-01' }
const term: StandardTerm = { id: 'term-new', codeSystemId: system.id, systemCode: system.code, systemName: system.name, systemVersion: system.version,
  authorityType: system.authorityType, code: 'Z999', display: '远端标准条目', status: 'ACTIVE', effectiveFrom: '2020-01-01' }
const old: ItemTermMapping = { id: 'original', revision: 4, subjectId: 'subject', subjectType: 'CATALOG_ITEM', targetId: 'item',
  conceptId: 'term-old', codeSystemId: system.id, systemCode: system.code, systemName: system.name, systemVersion: system.version,
  authorityType: system.authorityType, termCode: 'A001', termDisplay: '原标准', mappingType: 'CLINICAL', equivalence: 'EXACT', primaryMapping: true,
  limitation: '原限制', validFrom: '2020-01-01', status: 'ACTIVE', createdAt: '2020-01-01T00:00:00Z', createdBy: 'user',
  updatedAt: '2020-01-01T00:00:00Z', updatedBy: 'user' }
const input: SaveItemTermMappingInput = { conceptId: term.id, mappingType: 'CLINICAL', equivalence: 'RELATED', primaryMapping: false,
  limitation: ' 指定范围 ', validFrom: '2026-10-03', validTo: '2027-01-01' }
const command: MappingSaveCommand = { input, system, term }
function snap(rows: ItemTermMapping[] = [], businessDate = at): ItemTermMappingMaintenance {
  return { subjectId: 'subject', subjectType: 'CATALOG_ITEM', targetId: 'item', businessDate, history: rows,
    effectiveMappings: rows.filter(row => row.status !== 'SUSPENDED' && row.validFrom <= businessDate && (!row.validTo || row.validTo >= businessDate)) }
}
function receipt(body: SaveItemTermMappingInput, before: ItemTermMapping[] = []): ItemTermMappingMaintenance {
  const previous = new Date(`${body.validFrom}T00:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1)
  const rows = before.map(row => row.id === body.replacesMappingId
    ? { ...row, revision: row.revision + 1, status: 'SUPERSEDED' as const, validTo: previous.toISOString().slice(0, 10) } : row)
  const added: ItemTermMapping = { ...old, ...body, id: 'saved-new', revision: 0, termCode: term.code, termDisplay: term.display,
    limitation: body.limitation?.trim() || undefined, status: 'ACTIVE' }
  return snap([added, ...rows], body.validFrom)
}
function fixture(history: ItemTermMapping[] = []) {
  return { masterData: { itemTermMappings: vi.fn().mockImplementation(async (_type, _id, date) => snap(history, date)),
    standardCodeSystems: vi.fn().mockResolvedValue([system]), standardTerms: vi.fn().mockResolvedValue([term]),
    saveItemTermMapping: vi.fn().mockImplementation(async (_type, _id, body) => receipt(body, history)), changeItemTermMappingStatus: vi.fn() } }
}
function setup(api = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const content = (value = api) => <QueryClientProvider client={client}><StandardMappingDialog api={value as unknown as RhnApi}
    subjectType="CATALOG_ITEM" targetId="item" itemName="项目" systemType="SERVICE" onClose={vi.fn()} /></QueryClientProvider>
  const view = render(content()); return { api, client, switchApi: (value: ReturnType<typeof fixture>) => view.rerender(content(value)) }
}
async function chooseTerm(chooseSystem = true) {
  if (chooseSystem) {
    const publisher = screen.getByRole('combobox', { name: '标准发布版' })
    await waitFor(() => expect(publisher).toBeEnabled())
    await userEvent.click(publisher)
    await userEvent.click(await screen.findByRole('option', { name: /国家服务标准/ }))
  }
  await userEvent.click(screen.getByRole('combobox', { name: '标准条目' }))
  fireEvent.change(screen.getByLabelText('远程检索'), { target: { value: 'Z999' } })
  await userEvent.click(await screen.findByRole('option', { name: /远端标准条目/ }))
}

describe('mapping create and replacement evidence', () => {
  it('confirms exactly one new mapping and a continuous replacement while retaining unrelated history', () => {
    expect(verifyMappingSaveReceipt(receipt(input), snap(), command).history).toHaveLength(1)
    const replacement = { ...command, replaced: old, input: { ...input, replacesMappingId: old.id, expectedReplacesRevision: old.revision } }
    const unrelated = { ...old, id: 'other', mappingType: 'LOCAL' as const }
    expect(verifyMappingSaveReceipt(receipt(replacement.input, [old, unrelated]), snap([old, unrelated]), replacement).history).toHaveLength(3)
  })
  it.each(['conceptId', 'equivalence', 'mappingType', 'primaryMapping', 'limitation', 'validFrom', 'validTo', 'replacesMappingId', 'termCode', 'termDisplay', 'codeSystemId', 'systemVersion', 'authorityType', 'status'] as const)(
    'rejects an incorrect persisted %s even when the server responds successfully', field => {
      const result = receipt(input), row = result.history[0]
      const value = field === 'primaryMapping' ? true : field === 'validFrom' ? '2026-10-04' : field === 'validTo' ? undefined
        : field === 'status' ? 'SUSPENDED' : field === 'authorityType' ? 'LOCAL' : field === 'mappingType' ? 'LOCAL'
        : field === 'equivalence' ? 'EXACT' : 'changed'
      expect(() => verifyMappingSaveReceipt(snap([{ ...row, [field]: value }], input.validFrom), snap(), command)).toThrow()
    })
  it('rejects unchanged receipts, missing originals, wrong replacement cutoff or stale revision', () => {
    expect(() => verifyMappingSaveReceipt(snap([], input.validFrom), snap(), command)).toThrow()
    const replacement = { ...command, replaced: old, input: { ...input, replacesMappingId: old.id, expectedReplacesRevision: 4 } }
    for (const patch of [{ status: 'ACTIVE' }, { revision: 4 }, { validTo: '2026-10-01' }, { limitation: 'changed' }]) {
      const result = receipt(replacement.input, [old]); Object.assign(result.history[1], patch)
      expect(() => verifyMappingSaveReceipt(snap(result.history, input.validFrom), snap([old]), replacement)).toThrow()
    }
    expect(() => assertMappingSaveCommand(snap([{ ...old, revision: 5 }]), replacement)).toThrow('修订号')
    expect(() => assertMappingSaveCommand(snap(receipt(input).history), command)).toThrow('勿重复提交')
  })
  it.each([{}, undefined, [{ ...system, effectiveFrom: '2099-01-01' }], [{ ...system, status: 'RETIRED' }], [system, system], [{ ...system, systemType: 'MEDICATION' }]])(
    'rejects incomplete or inapplicable publishers %#', source => expect(() => requireMappingSystems(source, 'SERVICE', at)).toThrow())
  it.each([{}, undefined, [{ ...term, effectiveTo: '2019-01-01' }], [{ ...term, codeSystemId: 'other' }], [{ ...term, authorityType: 'LOCAL' }], [term, term]])(
    'rejects incomplete or mismatched terms %#', source => expect(() => requireMappingTerms(source, system, at)).toThrow())
  it('requires a bounded range within both publishing and term validity', () => {
    expect(() => assertMappingSaveCommand(snap(), { ...command, system: { ...system, effectiveTo: '2026-12-31' } })).toThrow('有效期内')
    expect(() => assertMappingSaveCommand(snap(), { ...command, term: { ...term, effectiveTo: '2026-12-31' } })).toThrow('有效期内')
    expect(() => assertMappingSaveCommand(snap(), { ...command, input: { ...input, mappingType: 'INSURANCE' } })).toThrow()
    expect(() => requireUnchangedMappingSelection(command, [{ ...system, version: '2027' }], [term])).toThrow('已变化')
    expect(() => requireUnchangedMappingSelection(command, [system], [{ ...term, effectiveTo: '2026-12-31' }])).toThrow('已变化')
  })
})

describe('mapping save and remote search UI', () => {
  it('requires explicit publisher selection and searches the backend with entered keywords', async () => {
    const { api } = setup()
    await waitFor(() => expect(screen.getByRole('combobox', { name: '标准发布版' })).toBeEnabled())
    expect(screen.getByRole('combobox', { name: '标准条目' })).toBeDisabled()
    expect(api.masterData.standardTerms).not.toHaveBeenCalled()
    await chooseTerm()
    expect(api.masterData.standardTerms).toHaveBeenCalledWith(system.id, at, 'Z999')
  })
  it.each(['network', 'invalid'])('offers publisher retry for %s without inventing empty options', async kind => {
    const api = fixture()
    if (kind === 'network') api.masterData.standardCodeSystems.mockRejectedValueOnce(new Error('offline'))
    else api.masterData.standardCodeSystems.mockResolvedValueOnce({})
    setup(api)
    expect(await screen.findByText(/标准发布版加载失败/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增映射' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '重新加载发布版' }))
    await chooseTerm()
  })
  it.each(['network', 'wrong-system'])('surfaces %s term searches without selectable fallback records', async kind => {
    const api = fixture()
    if (kind === 'network') api.masterData.standardTerms.mockRejectedValue(new Error('offline'))
    else api.masterData.standardTerms.mockResolvedValue([{ ...term, codeSystemId: 'other' }])
    setup(api)
    await waitFor(() => expect(screen.getByRole('combobox', { name: '标准发布版' })).toBeEnabled())
    await userEvent.click(screen.getByRole('combobox', { name: '标准发布版' }))
    await userEvent.click(await screen.findByRole('option', { name: /国家服务标准/ }))
    await userEvent.click(screen.getByRole('combobox', { name: '标准条目' }))
    fireEvent.change(screen.getByLabelText('远程检索'), { target: { value: 'Z999' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(kind === 'network' ? 'offline' : '标准条目数据不完整')
    expect(screen.queryByRole('option', { name: /远端标准条目/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增映射' })).toBeDisabled()
  })
  it.each([false, true])('confirms submitted fields and reread before clearing a draft, replacement=%s', async replace => {
    const history = replace ? [old] : [], api = fixture(history); setup(api)
    if (replace) await userEvent.click(await screen.findByRole('button', { name: '替代' }))
    await chooseTerm(!replace)
    fireEvent.change(screen.getByLabelText('限制使用范围'), { target: { value: '本次范围' } })
    api.masterData.saveItemTermMapping.mockImplementation(async (_type, _id, body) => {
      const result = receipt(body, history)
      api.masterData.itemTermMappings.mockImplementation(async (_subject, _target, date) => snap(result.history, date))
      return result
    })
    await userEvent.click(screen.getByRole('button', { name: replace ? '保存替代映射' : '新增映射' }))
    await waitFor(() => expect(screen.getByLabelText('限制使用范围')).toHaveValue(''))
    expect(api.masterData.saveItemTermMapping).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    if (replace) expect(screen.getByText('已替代')).toBeInTheDocument()
  })
  it.each(['wrong-receipt', 'unchanged-receipt', 'lost-response', 'failed-read', 'wrong-read-id', 'stale-term', 'failed-preflight'])('retains drafts and never claims %s as completed', async kind => {
    const api = fixture(); setup(api); await chooseTerm()
    fireEvent.change(screen.getByLabelText('限制使用范围'), { target: { value: '保留输入' } })
    api.masterData.saveItemTermMapping.mockImplementation(async (_type, _id, body) => {
      const result = receipt(body)
      if (kind === 'wrong-receipt') result.history[0].limitation = '错值'
      if (kind === 'unchanged-receipt') return snap([], body.validFrom)
      if (kind === 'lost-response') {
        api.masterData.itemTermMappings.mockImplementation(async (_t, _i, date) => snap(result.history, date))
        throw new Error('响应丢失')
      }
      if (kind === 'failed-read') api.masterData.itemTermMappings.mockRejectedValue(new Error('重新读取失败'))
      if (kind === 'wrong-read-id') api.masterData.itemTermMappings.mockImplementation(async (_t, _i, date) => snap([{ ...result.history[0], id: 'foreign' }], date))
      return result
    })
    if (kind === 'stale-term') api.masterData.standardTerms.mockResolvedValue([{ ...term, display: '已改名' }])
    if (kind === 'failed-preflight') api.masterData.standardCodeSystems.mockRejectedValue(new Error('发布版未确认'))
    await userEvent.click(screen.getByRole('button', { name: '新增映射' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('限制使用范围')).toHaveValue('保留输入')
    expect(screen.getByRole('button', { name: '新增映射' })).toBeDisabled()
    if (kind === 'stale-term' || kind === 'failed-preflight') expect(api.masterData.saveItemTermMapping).not.toHaveBeenCalled()
    if (kind === 'lost-response') {
      await userEvent.click(screen.getByRole('button', { name: '重新核实映射' }))
      await userEvent.click(screen.getByRole('button', { name: '新增映射' }))
      expect(await screen.findByText(/勿重复提交/)).toBeInTheDocument()
      expect(api.masterData.saveItemTermMapping).toHaveBeenCalledOnce()
    }
  })
  it('does not write after API context changes while verifying selected facts', async () => {
    const api = fixture(), view = setup(api); await chooseTerm()
    let resolve!: (value: StandardTerm[]) => void
    api.masterData.standardTerms.mockReturnValue(new Promise<StandardTerm[]>(r => { resolve = r }))
    await userEvent.click(screen.getByRole('button', { name: '新增映射' }))
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled()
    view.switchApi(fixture())
    await act(async () => resolve([term]))
    expect(api.masterData.saveItemTermMapping).not.toHaveBeenCalled()
  })
})
